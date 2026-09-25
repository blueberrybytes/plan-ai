# Private Deployment

For customers whose meeting audio and meeting text may not leave their own infrastructure. Every AI step can run on the customer's machine or in their cloud account:

| Step | Default | Private |
| --- | --- | --- |
| Transcription (live and post-meeting) | Deepgram | Whisper (`STT_PROVIDER=whisper`) |
| Speaker separation | Deepgram | Voice service (`/diarize`) |
| Naming speakers by voice | Voice service | Voice service |
| Summaries, tickets, documents, chat | OpenRouter | Local LLM (`LLM_PROVIDER=local`) |
| Document search (embeddings) | OpenRouter | Local model (`EMBEDDINGS_PROVIDER=local`) |
| Slide images | OpenRouter (Flux) | Off: slides come without images |

The switches are backend-wide environment variables. They are a property of the deployment, not of a workspace.

## Starting the stack

From the repository root:

```bash
yarn docker:private
```

This starts Postgres, Redis and Qdrant, plus:

| Service | Host port | What it is |
| --- | --- | --- |
| `whisper` | 8010 | speaches, OpenAI-compatible Whisper server |
| `voice` | 8002 | the voice service (speaker separation, voice profiles), with Sentry off |
| `ollama` | 11434 | local LLM and embeddings server |
| `models-init` | none | downloads the Whisper model, the LLM and the embedding model, then exits |

The first start downloads the models (about 20 GB with the defaults) into Docker volumes. Later starts reuse them.

On an NVIDIA host, add the GPU override:

```bash
cd plan-ai/backend
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile private up -d
```

It switches Whisper to its CUDA image and gives both Whisper and Ollama the GPUs. It needs the NVIDIA driver and the NVIDIA Container Toolkit.

## Pointing the backend at it

In `plan-ai/backend/.env`:

```bash
STT_PROVIDER=whisper
WHISPER_BASE_URL=http://localhost:8010

LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=gemma3:27b
LOCAL_LLM_CONTEXT_TOKENS=32768

EMBEDDINGS_PROVIDER=local
LOCAL_EMBEDDINGS_MODEL=bge-m3
LOCAL_EMBEDDINGS_DIMENSION=1024

VOICE_AI_URL=http://localhost:8002
```

`LOCAL_LLM_BASE_URL` takes any OpenAI-compatible server, so vLLM, LM Studio or a llama.cpp server work the same way as Ollama.

## Choosing the models

**LLM.** The default is Gemma 3 27B: multilingual (Spanish, Catalan, Arabic, English), about 17 GB in 4-bit, and not a "thinking" model. Models that write out their reasoning before answering can break the strict JSON the pipeline relies on for tickets and summaries, so prefer instruct models. Qwen3 instruct models and Llama 3.3 70B are alternatives when the hardware allows.

The context window matters as much as the model. Ollama defaults to 4,096 tokens and its OpenAI-compatible API can't raise it per request, so the compose file sets `OLLAMA_CONTEXT_LENGTH` from `LOCAL_LLM_CONTEXT_TOKENS`. Keep the two in step: the backend uses the value to decide whether to inject a project's documents whole or search them (RAG).

**Embeddings.** `bge-m3` is multilingual and produces 1,024-dimension vectors. The cloud model produces 1,536, so local vectors live in their own Qdrant collection, named after the model and size (for example `context_files__bge-m3_1024`). Switching back to the cloud finds the original collection untouched. Documents indexed before the switch must be indexed again to be searchable.

**Whisper.** See [Speech-to-Text](/self-hosting/speech-to-text).

## Hardware

| Setup | What runs | Rough cost |
| --- | --- | --- |
| One GPU with 48 GB (L40S, RTX 6000 Ada) | Gemma 3 27B, Whisper large-v3-turbo and embeddings together | 7,000 to 9,000 EUR for the card, or about 1 USD/hour rented |
| One GPU with 24 GB | Gemma 3 27B alone, Whisper on CPU | |
| CPU only | Whisper and the voice service fine for the post-meeting pass; an LLM of 27B is too slow for interactive chat | |

These are sizing guides, not measurements on the target hardware. Measure with real meetings before quoting a customer.

## What still leaves the machine

Being precise about this is part of the offer:

- **Sign-in** goes through Firebase Authentication (Google). It sees accounts and emails, not meetings.
- **Recordings and uploaded files** are stored in the Firebase Storage bucket set in `FIREBASE_STORAGE_BUCKET`. For a private deployment, use a bucket in the customer's own Google Cloud project and region.
- **Integrations** (Jira, Linear, Notion, Twenty, Google Drive…) send what the customer chooses to sync, to the tools the customer connected.
- **Error reporting**: the backend only reports to Sentry when `SENTRY_DSN` is set; leave it unset. The voice service in this stack has `SENTRY_DSN=""`.
- **Slide images** are off in local mode, because their prompt is written from the meeting's content.

Replacing Firebase with a self-hosted identity provider and object storage (Keycloak and MinIO, for example) is a separate project.

## Checking it

```bash
# Transcription path, live and post-meeting
yarn --cwd plan-ai/backend stt:smoke --mic sample.wav --language es

# Usage is logged as provider LOCAL at zero cost
psql "$DATABASE_URL" -c "select provider, model, count(*) from \"AiUsageLog\" group by 1, 2;"
```
