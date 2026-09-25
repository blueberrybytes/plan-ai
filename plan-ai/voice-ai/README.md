# Plan AI Voice Service

Python service (FastAPI + SpeechBrain) for the voice work the Node backend can't do. It loads one model, [ECAPA-TDNN trained on VoxCeleb](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb), which turns a stretch of speech into a 192-number voice fingerprint.

## Endpoints

All of them except `/health` require the `x-api-key` header when `VOICE_AI_API_KEY` is set.

| Endpoint | What it does |
| --- | --- |
| `GET /health` | `200` once the model is loaded, `503` otherwise |
| `POST /verify` | Takes `profile_url` and `meeting_url`, says whether the user's voice profile appears in the meeting |
| `POST /diarize` | Takes an `audio` file and a JSON list of utterance times, returns one speaker label per utterance |
| `POST /identify` | Takes an `audio_url`, labelled utterances and voice profiles, returns which speaker is which profile |

### `/diarize`

Used by the backend when transcription runs on self-hosted Whisper (`STT_PROVIDER=whisper`), which returns no speakers. Only the system-audio channel goes through it: the mic is always the user.

Form fields:

| Field | Default | |
| --- | --- | --- |
| `audio` | required | The recording, any format ffmpeg reads |
| `segments` | required | `[{"start": 12.4, "end": 15.1}, ...]` in seconds, the utterances Whisper returned |
| `max_speakers` | `8` | Upper bound on speakers |
| `threshold` | `0.5` | Cosine distance under which two utterances count as the same voice |

Response: `{"num_speakers": 3, "labels": [0, 0, 1, 2, 1, ...]}`, one label per segment in the same order, numbered by who speaks first.

How it works: each utterance of at least one second gets a voice fingerprint (the middle 10 s at most), and fingerprints are grouped with average-linkage hierarchical clustering on cosine distance. Shorter utterances ("yes", "ok") take the speaker of the nearest utterance in time. The code is in `diarization.py`; the design and the measurements are in `DIARIZACION.md` at the repository root.

### `/identify`

Names anonymous speakers (`Others 0`, `Others 1`) after the voice profiles of known people, for either transcription provider.

| Field | Default | |
| --- | --- | --- |
| `audio_url` | required | The system-audio recording |
| `segments` | required | `[{"start": 1.2, "end": 4.0, "speaker": "Others 0"}, ...]` |
| `profiles` | required | `[{"id": "user_1", "url": "https://..."}, ...]` |
| `min_similarity` | `0.45` | Cosine similarity a speaker and a profile need to be matched |

Response: `{"matches": [{"speaker": "Others 1", "profile_id": "user_1", "score": 0.71}]}`. Each speaker gets a fingerprint from their longest utterances, each profile from its recording, and they're paired one to one (Hungarian assignment); pairs below `min_similarity` are dropped, so a speaker with no profile stays anonymous. A profile that can't be downloaded is skipped. Code in `identification.py`.

## Error reporting

`SENTRY_DSN` unset reports to the platform's Sentry project, as before. `SENTRY_DSN=""` turns reporting off, which self-hosted customer installs must do: error reports include personal data.

## Running it

```bash
# from the repository root
yarn dev:voice          # uv, port 8001, auto-reload
```

Or with Docker, which is what production uses: see `Dockerfile` (port 8000 inside the container).

## Tests

```bash
cd plan-ai/voice-ai
uv run pytest
```

The tests use a fake encoder, so they don't download or load the model.
