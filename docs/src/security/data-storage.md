# Where Your Files Live

Plan AI stores four kinds of files that belong to you: meeting recordings, voice profiles, context files and chat attachments. All four are private in the storage bucket. Nobody can download them without going through the backend, and the backend checks who is asking first.

## Signed URLs

The database keeps an internal reference to each file (a `gs://` URI), not a link anyone can open. When a file has to be read, the backend creates a signed URL for it. That URL works for a limited time and then stops working.

| Who reads the file | What for | URL valid for |
| --- | --- | --- |
| Deepgram or your Whisper server | Transcribing a finished meeting | 1 hour |
| The voice service | Recognising who spoke | 1 hour |
| The LLM provider | Reading an image or PDF attached in the chat | 1 hour |
| You, in the web app | Opening or downloading a context file | 1 hour, created on click |
| The apps | Chat thumbnails, playing back your voice profile | 12 hours |

A signed URL is created right before it is used, never in advance. A link that ends up in a log, an email or a browser history stops working on its own.

Chat attachments are checked on every message: the backend only accepts files the same user uploaded. A message cannot point the server or the model at another user's file or at an arbitrary address.

## Self-hosted installs

With `STT_PROVIDER=whisper`, `LLM_PROVIDER=local` and `EMBEDDINGS_PROVIDER=local`, the signed URLs only travel between services on your own network. See [Private Stack](/self-hosting/private-stack).

## Upgrading from a version with public files

Before this change, recordings, voice profiles, context files and chat attachments were uploaded with public read access. Old records keep working after the upgrade, because the backend signs both forms of reference. Once the new backend is deployed, close the old files:

```bash
cd plan-ai/backend
yarn storage:make-private           # counts the public files, changes nothing
yarn storage:make-private --apply   # makes them private
```

Run it only after the new backend is live. The old backend still hands out the public links, and those stop working as soon as the files are private.

Google caches public files at the edge. After `--apply`, an old public link can keep answering from that cache until the copy expires: up to an hour for most files, up to a day for chat attachments. Reads that miss the cache are refused straight away.

`yarn storage:smoke` checks the setup against the real bucket. It uploads a test file, confirms that an anonymous read is refused and a signed URL works, and deletes the file. Add `--audio meeting.mp3` to also run a recording through speech-to-text and the voice service by signed URL.

## Documents and presentations

Documents and presentations are private when they are created, including the ones generated after a meeting. Only members of the workspace can open them.

The "public link" button shares one on purpose: it makes it readable by anyone with the link and opens that link. "Stop sharing" turns it off, and the link stops working at once. A link to something that isn't shared answers the same as a link to something that doesn't exist.

Two integrations share a document because that is their job. When Twenty is connected, the meeting document is shared at the moment its link is written into the CRM note. A proposal sent to a prospect over Telegram is shared the same way. Tasks created from a meeting link to the document inside the app, which asks for a login.

## Previews stay inside Plan AI

Word and PowerPoint files in a project are previewed as the text Plan AI extracts from them. Earlier versions used Google's online viewer, which meant handing the file to Google. PDFs open in the browser through a signed URL.

## What stays public

Images generated for documents and slides keep public links. They are embedded in documents and presentations that are meant to be shared.
