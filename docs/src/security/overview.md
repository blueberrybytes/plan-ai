# Security Overview

Engineering meetings carry client code, architecture decisions and plans that are not public yet. This page says where that material goes when you use Plan AI, for each way of running it.

## Two ways to run Plan AI

- **Cloud.** The hosted version at plan-ai.blueberrybytes.com, run by BlueberryBytes. You can bring your own AI keys (BYOK) or let us provide them (Managed).
- **Private install.** Plan AI set up on your own servers. We do the setup with you. See [Private Stack](/self-hosting/private-stack).

## Where each part runs

| Part | Cloud | Private install |
| --- | --- | --- |
| Transcription | Deepgram, with your key or ours | Whisper, on your servers |
| Language model (summaries, tickets, documents, chat) | OpenRouter, with your key or ours | Any OpenAI-compatible server on your servers (Ollama, vLLM) |
| Embeddings and search | OpenRouter embeddings and Qdrant | A local embeddings model and Qdrant, on your servers |
| Speaker identification | The Plan AI voice service | The same voice service, on your servers |
| Database | Postgres, run by BlueberryBytes | Postgres, on your servers |
| Recordings and files | Private Firebase Storage bucket | Private Firebase Storage bucket in your own Google Cloud project |
| Sign-in | Firebase Authentication | Firebase Authentication in your own project |

In a private install, no meeting content goes to OpenAI, Deepgram or any other AI provider.

Sign-in and file storage use Google Firebase in both setups. Firebase Authentication sees accounts and email addresses, not meetings. In a private install the storage bucket belongs to your own Google Cloud project, in the region you choose. Replacing Firebase with self-hosted services such as Keycloak and MinIO is possible as a custom project.

## Recording without a bot

The recorder is an app on your computer or phone. No bot joins the call and the other participants get no invite. The desktop recorder sends the audio to the backend during the meeting, for live captions. When you stop, the recording is uploaded and transcribed again in full. If you pause, that part is never captured.

## Files are private

Recordings, voice profiles, context files and chat attachments are never public. The database keeps an internal reference to each file. When a service or a person needs to read one, Plan AI creates a signed link that expires: after 1 hour for transcription, speaker identification and the language model, and after 12 hours for what the apps keep on screen. Details in [Where Your Files Live](/security/data-storage).

Chat attachments are checked on every message. The backend only accepts files uploaded by the same user.

## Sharing is always on purpose

Meeting documents and presentations stay inside your workspace. The "public link" button shares one with anyone who has the link, and "stop sharing" turns that off at once.

Two integrations share a document because that is their job. When Twenty is connected, the meeting document is shared at the moment its link is written into the CRM note. A proposal sent to a prospect over Telegram is shared the same way.

## Previews stay inside Plan AI

Word and PowerPoint files are previewed as the text Plan AI extracts from them. They are not sent to an online viewer.

## Your AI keys

With BYOK, the AI runs under your own OpenRouter and Deepgram accounts, so your agreements with those providers apply. Keys are stored in your workspace and are never sent back to the browser: the dashboard shows a masked value. See [BYOK Architecture](/security/byok-architecture).

## In transit

The apps talk to the backend over HTTPS. Files are read through signed HTTPS links.
