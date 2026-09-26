
import os
import json
import asyncio
import tempfile
import httpx
import logging
from speechbrain.inference.speaker import SpeakerRecognition
from fastapi import FastAPI, HTTPException, Form, Request, UploadFile, File
from diarization import Segment, diarize_segments, read_wav_mono16k
from identification import LabelledSegment, match_speakers, profile_fingerprint, speaker_fingerprints
from starlette.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import sentry_sdk

# SENTRY_DSN="" turns reporting off. Self-hosted customer installs must do
# that: errors carry PII (send_default_pii) and would otherwise land in
# BlueberryBytes' Sentry. Unset keeps the platform's project, as before.
_PLATFORM_SENTRY_DSN = "https://22b2182401ea5abb0092d103c1742f75@o4511196762734592.ingest.us.sentry.io/4511461842812928"
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", _PLATFORM_SENTRY_DSN) or None,
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

async def convert_to_wav16k(raw_path: str, wav_path: str) -> None:
    """Any format ffmpeg reads, to 16 kHz mono 16-bit WAV."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", raw_path,
        "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav_path,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await asyncio.wait_for(proc.wait(), timeout=120)
    if proc.returncode != 0:
        raise Exception(f"ffmpeg conversion failed with code {proc.returncode}")

async def download_file(url: str) -> str:
    raw_temp = tempfile.NamedTemporaryFile(delete=False)
    wav_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    # The backend sends signed URLs. The query string is the signature, a
    # credential for the file until it expires, so logs and errors get the
    # path only.
    safe_url = url.split("?", 1)[0]

    logger.info(f"Downloading audio from {safe_url}...")
    try:
        # Stream download to disk to avoid buffering large audio files in memory
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(raw_temp.name, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
        
        logger.info(f"Converting audio to 16kHz WAV format...")
        await convert_to_wav16k(raw_temp.name, wav_temp.name)
        return wav_temp.name
    except Exception as e:
        reason = str(e).replace(url, safe_url)
        # httpx puts the full URL in its messages: report a redacted copy.
        sentry_sdk.capture_message(f"Failed to process audio from {safe_url}: {reason}", level="error")
        if os.path.exists(wav_temp.name):
            os.unlink(wav_temp.name)
        raise HTTPException(status_code=400, detail=f"Failed to process audio from {safe_url}: {reason}")
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

@app.post("/diarize")
async def diarize(
    audio: UploadFile = File(...),
    segments: str = Form(...),
    max_speakers: int = Form(8),
    threshold: float = Form(0.5),
    min_speaker_seconds: float = Form(10.0),
):
    """
    Assigns a speaker to each utterance of a recording that has none (the
    self-hosted Whisper provider). `segments` is a JSON list of
    {"start": s, "end": s} in seconds. Returns one label per segment, in the
    same order, numbered by first appearance.
    """
    if not verification_model:
        raise HTTPException(status_code=500, detail="Voice model failed to load.")
    try:
        parsed = [Segment(float(s["start"]), float(s["end"])) for s in json.loads(segments)]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid segments: {e}")
    if not 1 <= max_speakers <= 20:
        raise HTTPException(status_code=400, detail="max_speakers must be between 1 and 20")
    if not 0.0 < threshold < 2.0:
        raise HTTPException(status_code=400, detail="threshold is a cosine distance, between 0 and 2")
    if min_speaker_seconds < 0:
        raise HTTPException(status_code=400, detail="min_speaker_seconds can't be negative")

    raw_temp = tempfile.NamedTemporaryFile(delete=False)
    wav_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    try:
        with open(raw_temp.name, "wb") as f:
            while chunk := await audio.read(1 << 20):
                f.write(chunk)
        await convert_to_wav16k(raw_temp.name, wav_temp.name)
        pcm = read_wav_mono16k(wav_temp.name)

        loop = asyncio.get_event_loop()
        labels = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                diarize_segments,
                verification_model,
                pcm,
                parsed,
                max_speakers,
                threshold,
                min_speaker_seconds,
            ),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        speakers = len(set(labels))
        logger.info(f"Diarization: {len(parsed)} segments, {speakers} speakers (threshold={threshold})")
        return {"num_speakers": speakers, "labels": labels}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.error(f"Error during diarization: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for path in (raw_temp.name, wav_temp.name):
            if os.path.exists(path):
                os.unlink(path)

@app.post("/identify")
async def identify(
    audio_url: str = Form(...),
    segments: str = Form(...),
    profiles: str = Form(...),
    min_similarity: float = Form(0.45),
):
    """
    Names anonymous speakers by voice. `segments` is a JSON list of
    {"start", "end", "speaker"} for one recording (the system-audio channel);
    `profiles` a JSON list of {"id", "url"} voice-profile recordings. Returns
    the speakers whose voice matches a profile, one profile per speaker at most.
    """
    if not verification_model:
        raise HTTPException(status_code=500, detail="Voice model failed to load.")
    try:
        parsed = [
            LabelledSegment(float(s["start"]), float(s["end"]), str(s["speaker"]))
            for s in json.loads(segments)
        ]
        people = [(str(p["id"]), str(p["url"])) for p in json.loads(profiles)]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid segments or profiles: {e}")
    if not 0.0 < min_similarity < 1.0:
        raise HTTPException(status_code=400, detail="min_similarity is a cosine similarity, between 0 and 1")
    if not parsed or not people:
        return {"matches": []}

    paths: list[str] = []
    try:
        meeting_path = await download_file(audio_url)
        paths.append(meeting_path)
        profile_audio: dict[str, object] = {}
        for pid, url in people:
            # One unreadable profile shouldn't cost everyone else their name.
            try:
                path = await download_file(url)
                paths.append(path)
                profile_audio[pid] = read_wav_mono16k(path)
            except Exception as e:
                logger.warning(f"Skipping voice profile {pid}: {e}")

        pcm = read_wav_mono16k(meeting_path)

        def run():
            speakers = speaker_fingerprints(verification_model, pcm, parsed)
            prints = {pid: profile_fingerprint(verification_model, a) for pid, a in profile_audio.items()}
            return match_speakers(speakers, prints, min_similarity)

        loop = asyncio.get_event_loop()
        matches = await asyncio.wait_for(loop.run_in_executor(None, run), timeout=REQUEST_TIMEOUT_SECONDS)
        logger.info(
            f"Identification: {len({s.speaker for s in parsed})} speakers, {len(profile_audio)} profiles, "
            f"{len(matches)} matched"
        )
        return {"matches": [{"speaker": m.speaker, "profile_id": m.profile_id, "score": m.score} for m in matches]}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.error(f"Error during identification: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for path in paths:
            if os.path.exists(path):
                os.unlink(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
