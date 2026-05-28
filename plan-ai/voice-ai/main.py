
import os
import asyncio
import tempfile
import httpx
import logging
from speechbrain.inference.speaker import SpeakerRecognition
from fastapi import FastAPI, HTTPException, Form, Request
from starlette.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import sentry_sdk

sentry_sdk.init(
    dsn="https://22b2182401ea5abb0092d103c1742f75@o4511196762734592.ingest.us.sentry.io/4511461842812928",
    send_default_pii=True,
    traces_sample_rate=0.2,
    environment=os.environ.get("ENV", "local"),
)

# Use uvicorn's logger so our messages appear in the console
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Plan AI Voice Verification")

# --- Internal API key guard ---
_VOICE_API_KEY = os.environ.get("VOICE_AI_API_KEY", "")

@app.middleware("http")
async def _api_key_guard(request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    if _VOICE_API_KEY and request.headers.get("x-api-key") != _VOICE_API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

# --- Request timeout middleware (180s) ---
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("VOICE_REQUEST_TIMEOUT", "180"))

class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        try:
            return await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            return JSONResponse(status_code=504, content={"detail": f"Request timed out after {REQUEST_TIMEOUT_SECONDS}s"})

app.add_middleware(TimeoutMiddleware)

# Load the model once at startup
logger.info("Loading SpeechBrain Model...")
try:
    verification_model = SpeakerRecognition.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir="model")
    logger.info("SpeechBrain model loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load SpeechBrain model: {e}")
    verification_model = None

async def download_file(url: str) -> str:
    raw_temp = tempfile.NamedTemporaryFile(delete=False)
    wav_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    
    logger.info(f"Downloading audio from {url}...")
    try:
        # Stream download to disk to avoid buffering large audio files in memory
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(raw_temp.name, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
        
        logger.info(f"Converting audio to 16kHz WAV format...")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", raw_temp.name,
            "-ac", "1", "-ar", "16000", wav_temp.name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=120)
        if proc.returncode != 0:
            raise Exception(f"ffmpeg conversion failed with code {proc.returncode}")
        
        return wav_temp.name
    except Exception as e:
        sentry_sdk.capture_exception(e)
        if os.path.exists(wav_temp.name):
            os.unlink(wav_temp.name)
        raise HTTPException(status_code=400, detail=f"Failed to process audio from {url}: {str(e)}")
    finally:
        if os.path.exists(raw_temp.name):
            os.unlink(raw_temp.name)

@app.get("/health")
def health():
    if verification_model is None:
        return JSONResponse(status_code=503, content={"status": "error", "model_loaded": False})
    return {"status": "ok", "model_loaded": True}

@app.post("/verify")
async def verify(profile_url: str = Form(...), meeting_url: str = Form(...)):
    """
    Takes two audio URLs (voice profile and a meeting clip), downloads them,
    and returns whether they match along with the similarity score.
    """
    if not verification_model:
        raise HTTPException(status_code=500, detail="Voice verification model failed to load.")

    profile_path = None
    meeting_path = None
    
    try:
        # Download files
        profile_path = await download_file(profile_url)
        meeting_path = await download_file(meeting_url)

        logger.info(f"Comparing {profile_path} against {meeting_path}...")
        # Run SpeechBrain inference in a thread with timeout to avoid blocking
        # the event loop and to catch model deadlocks.
        loop = asyncio.get_event_loop()
        score, prediction = await asyncio.wait_for(
            loop.run_in_executor(None, verification_model.verify_files, profile_path, meeting_path),
            timeout=120.0,
        )
        
        is_match = bool(prediction.item())
        similarity_score = float(score.item())

        logger.info(f"Verification complete: match={is_match}, score={similarity_score}")

        return {
            "match": is_match,
            "score": similarity_score,
            "threshold": 0.25 # SpeechBrain default for ECAPA-TDNN is around 0.25
        }
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.error(f"Error during verification: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        if profile_path and os.path.exists(profile_path):
            os.unlink(profile_path)
        if meeting_path and os.path.exists(meeting_path):
            os.unlink(meeting_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
