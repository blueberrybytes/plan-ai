# Speech-to-Text Provider

Plan AI transcribes audio in three places: the live captions while a meeting is recorded, the post-meeting pass that produces the saved transcript, and Telegram voice notes. All three use the same provider, chosen for the whole backend with one variable:

| `STT_PROVIDER` | Where the audio goes | Key |
| --- | --- | --- |
| `deepgram` (default) | Deepgram's cloud | The workspace's BYOK key, or the platform key |
| `whisper` | A Whisper server you run yourself | None |

It's a backend setting, not a workspace setting, on purpose. Picking the provider means picking where meeting audio is allowed to go, and that belongs to whoever runs the deployment.

With `whisper`, no audio leaves your own infrastructure. This is the option for customers who can't send recordings to a third party.

## How the Whisper provider works

The backend talks to any server that exposes the OpenAI `/v1/audio/transcriptions` API. We use [speaches](https://github.com/speaches-ai/speaches), which runs [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and ships as a Docker image.

The post-meeting pass sends each recorded channel (the user's mic and the system audio) as a file. The result comes back as utterances with word timings, split on 0.5 s pauses like Deepgram's, so echo removal and speaker identification work unchanged.

Live captions need more work, because Whisper transcribes files, not streams. The backend detects where each sentence starts and ends from the audio energy, sends every finished sentence to Whisper, and emits the result with the same events Deepgram uses. The recorder can't tell the difference.

The project's keywords are sent as Whisper's `prompt`. On our Spanish test sample this turned "Plan I" into "Plan AI" and "gira" into "Jira".

## Running it locally

The `whisper` service is in `plan-ai/backend/docker-compose.yml`, on port 8010 (the voice service already uses 8000 and 8001).

It sits behind a Compose profile, so plain `yarn docker` doesn't pull its 2 GB image. From the repository root:

```bash
yarn docker:whisper
# Download the model once. It stays in the whisper-models volume.
curl -X POST http://localhost:8010/v1/models/deepdml/faster-whisper-large-v3-turbo-ct2
```

Then in `plan-ai/backend/.env`:

```bash
STT_PROVIDER=whisper
WHISPER_BASE_URL=http://localhost:8010
WHISPER_MODEL=deepdml/faster-whisper-large-v3-turbo-ct2
```

To check the whole path without the recorder, stream any 16-bit mono WAV through the same code the recorder uses:

```bash
yarn stt:smoke --mic mic.wav --sys sys.wav --language es
```

It prints each live caption with its delay, then runs the real post-meeting pass. On macOS, `afconvert -f WAVE -d LEI16@24000 -c 1 input.m4a mic.wav` converts any audio file.

## Variables

| Variable | Default | What it does |
| --- | --- | --- |
| `STT_PROVIDER` | `deepgram` | `deepgram` or `whisper`. An unknown value falls back to `deepgram` with a warning. |
| `WHISPER_BASE_URL` | `http://localhost:8010` | Server URL, without `/v1`. |
| `WHISPER_MODEL` | `deepdml/faster-whisper-large-v3-turbo-ct2` | Model for the post-meeting pass and voice notes. |
| `WHISPER_LIVE_MODEL` | same as `WHISPER_MODEL` | Model for live captions. A smaller one is faster on CPU. |
| `WHISPER_LIVE_INTERIM_MS` | `1500` | Interim captions while someone talks. `0` turns them off. |
| `WHISPER_TIMEOUT_MS` | `3600000` | Timeout for one post-meeting request. |
| `WHISPER_API_KEY` | none | Only if the server was started with `API_KEY`. |

## Choosing a model

| Model | Use |
| --- | --- |
| `deepdml/faster-whisper-large-v3-turbo-ct2` | Default. Best balance of accuracy and speed. |
| `Systran/faster-whisper-small` | Live captions on a slow CPU. Noticeably less accurate. |
| `Systran/faster-whisper-large-v3` | Most accurate, and clearly slower than turbo. Meant for a GPU. |
| `BSC-LT/faster-whisper-bsc-large-v3-cat` | Tuned for Catalan by the Barcelona Supercomputing Center. |

Measured on an Apple M3 Pro, Docker CPU only, int8:

| | small | large-v3-turbo |
| --- | --- | --- |
| 24 s file, full transcription | 9.4 s | 6.3 s |
| One request, 2 to 10 s of audio | about 2 s | about 4 s |
| Live caption, after the sentence ends | 2.1 s | 2.7 s |

Every request costs roughly the same however short the audio is, because Whisper always decodes a 30 s window. That's why each live connection times the server, and stops asking for interim captions when the server answers slower than they're due. On a GPU, where a request takes well under a second, interims keep flowing.

## CPU or GPU

The compose file uses the CPU image with int8, eight threads, and models kept in memory. For a GPU host, switch the image tag to `latest-cuda`, remove `WHISPER__COMPUTE_TYPE`, and set `WHISPER_LIVE_INTERIM_MS` to taste.

A CPU host is fine for the post-meeting pass: large-v3-turbo runs about 4 times faster than real time on 8 cores, and nobody waits on it. Live captions work on CPU but arrive a few seconds after each sentence. Railway, for example, only offers CPU.

## Known limits

- Whisper doesn't tell speakers apart. The mic channel is still the user and the system channel is still everyone else, but several remote participants come out as one speaker. Adding a diarization model (pyannote) is the next step.
- The desktop recorder still asks BYOK workspace owners for a Deepgram key before recording, even when the backend uses Whisper. Self-hosted instances without Stripe don't hit this check.
