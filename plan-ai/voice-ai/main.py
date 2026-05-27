
import os
import tempfile
import httpx
import logging
from speechbrain.inference.speaker import SpeakerRecognition
from fastapi import FastAPI, HTTPException, Form
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

# Load the model once at startup
logger.info("Loading SpeechBrain Model...")
try:
    verification_model = SpeakerRecognition.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir="model")
    logger.info("SpeechBrain model loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load SpeechBrain model: {e}")
    verification_model = None

import subprocess

async def download_file(url: str) -> str:
    raw_temp = tempfile.NamedTemporaryFile(delete=False)
    wav_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    
    logger.info(f"Downloading audio from {url}...")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            with open(raw_temp.name, "wb") as f:
                f.write(response.content)
        
        # Check if ffmpeg is installed
        try:
            subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            raise HTTPException(status_code=500, detail="ffmpeg is not installed on the system. Please install it (e.g. 'brew install ffmpeg') to process .m4a and .webm files.")
                
        logger.info(f"Converting audio to 16kHz WAV format...")
        subprocess.run([
            "ffmpeg", "-y", "-i", raw_temp.name, 
            "-ac", "1", "-ar", "16000", 
            wav_temp.name
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
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
    return {"status": "ok", "model_loaded": verification_model is not None}

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
        # Compare
        # score is a torch tensor, prediction is a boolean tensor
        score, prediction = verification_model.verify_files(profile_path, meeting_path)
        
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
