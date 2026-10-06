# Security Overview

Engineering meetings carry client code, architecture decisions and plans that are not public yet. This page says where that material goes when you use Plan AI, for each way of running it. It also says what depends on configuration and what we do not have yet.

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
| Email (notes you send, invitations) | Resend | Resend with your own key, or off |
| Calendar (optional) | Google Calendar or Outlook, read-only | The same, with your own OAuth apps |
| Error reports | Sentry | Sentry only if you set `SENTRY_DSN`, otherwise off |

In a private install, no meeting content goes to OpenAI, Deepgram or any other AI provider. This holds when the backend runs with `STT_PROVIDER=whisper`, `LLM_PROVIDER=local` and `EMBEDDINGS_PROVIDER=local`.

Sign-in and file storage use Google Firebase in both setups. Firebase Authentication sees accounts and email addresses, not meetings. In a private install the storage bucket belongs to your own Google Cloud project, in the region you choose. Replacing Firebase with self-hosted services such as Keycloak and MinIO is possible as a custom project.

Every company that receives data from the cloud version is listed in [Subprocessors](/security/subprocessors), with what it receives and why.

## Recording without a bot

The recorder is an app on your computer or phone. No bot joins the call and the other participants get no invite. The desktop recorder sends the audio to the backend during the meeting, for live captions. When you stop, the recording is uploaded and transcribed again in full.

The recorder shows a message you can paste in the meeting chat to tell the other people you are recording. **Pause** stops recording and transcribing until you resume, and the recorder pauses on its own after 15 minutes without speech.

## You decide how long audio is kept

**Delete audio** removes a meeting's audio files and keeps the transcript, summary and tasks. A workspace owner can also set the audio of every meeting to be deleted automatically after 7 to 365 days. Deleting a meeting deletes its audio too. Details in [Recordings](/features/recordings#delete-the-audio-keep-the-notes).

## Files are private

Recordings, voice profiles, context files and chat attachments are never public. The database keeps an internal reference to each file. When a service or a person needs to read one, Plan AI creates a signed link that expires: after 1 hour for transcription, speaker identification and the language model, and after 12 hours for what the apps keep on screen. Slide images are stored the same way, except the ones made by older versions. Details in [Where Your Files Live](/security/data-storage).

Chat attachments are checked on every message. The backend only accepts files uploaded by the same user.

## Sharing is always on purpose

Meeting documents, presentations and diagrams stay inside your workspace. Only members of the workspace can open them.

Two integrations share a document because that is their job. When Twenty is connected, the meeting document is shared at the moment its link is written into the CRM note. A proposal sent to a prospect over Telegram is shared the same way.

## Public links

The "public link" button makes one document, presentation or diagram readable by anyone who has the link. The link carries a random share token of 192 bits. Plan AI creates a new token each time sharing is turned on. "Stop sharing" turns the link off at once. Sharing the same item again gives it a new link, so an old link never starts working again.

Items shared with an older version of Plan AI keep their old link, which is built from the item's id. They get a token link the next time someone stops sharing and shares them again.

Every share and unshare is written to the workspace's audit log.

## Previews stay inside Plan AI

Word and PowerPoint files are previewed as the text Plan AI extracts from them. They are not sent to an online viewer.

## Who can open a workspace

Every request that reaches a workspace checks that the user is a member of it. This includes requests to the AI assistant.

Platform admins (users with the global `ADMIN` role) have no access to customer workspaces. The operator of an install can turn on support access with `PLATFORM_ADMIN_SUPPORT_ACCESS=true`. With it on, every access by a platform admin is written to that workspace's audit log.

These are rules in the application. The people who run the servers can still reach the database directly, as with any hosted service.

## Restricted projects

A project is open to the whole workspace by default. A workspace owner or the person who created the project can restrict it. A restricted project is seen only by the workspace owners, its creator and the people added to it. Workspace admins who were not added do not see it.

Everything that belongs to the project follows it: its meetings, transcripts, tasks, files, notes, chats and the documents, slides and diagrams made from its files. To anyone else they do not exist. They are left out of lists, search, the AI assistant, the knowledge base, MCP and the weekly emails, and opening one by its id answers "not found".

The rule is applied in one place, in the layer that talks to the database, so a new screen or endpoint gets it without extra work. Each change of who sees a project is written to the audit log.

Limits to know about:

*   A meeting saved without a project is visible to the workspace, as before. Put sensitive meetings in a restricted project.
*   A document generated from a restricted meeting is kept in that project and hidden with it. Slides and diagrams are hidden when they use the project's files.
*   Tasks of a restricted project still sync to a connected tool (Jira, Linear, Trello and the like) when sync is on, and are then visible there.
*   With support access turned on, a platform admin does not see restricted projects.

## Audit log

Each workspace keeps an audit log. Owners and admins can read it.

It records invitations, joins, removals and role changes. It records settings changes with the names of the settings that changed, never the key values. It records ownership transfers, exports and the deletion of the workspace. It records the deletion of projects, meetings and meeting audio. It records when documents, presentations and diagrams are shared or unshared, and when an integration is disconnected. It also records task edits made by the AI assistant. It records who opens a meeting, gets its audio, sends its notes by email or translates it, including reads through MCP. Opening a meeting is written once per person and meeting every 30 minutes.

Each entry keeps who did it, their IP address and their browser's user agent. Entries are kept when the user or the workspace is deleted.

## Sign-in rules

A workspace owner can set rules for who may use the workspace. The owner can allow only some email domains. The owner can require two-step verification. The owner can also require one sign-in provider: Google, Microsoft, Apple, email and password, or a SAML or OIDC provider. The backend enforces these rules on every request, not only at sign-in. [MCP](/features/mcp-server) tokens follow the email domain rule; the two-step and provider rules apply to the sign-in that creates the token.

Single sign-on with SAML or OIDC and two-step verification with an authenticator app (TOTP) need Firebase Identity Platform enabled on the Firebase project behind the install. Without it, members cannot meet those rules. If you need them on the cloud version, ask us first.

## Sessions and member removal

The backend checks the state of each Firebase account again when its last check is more than a minute old. An account that is disabled, or whose sessions are revoked, loses access within 60 seconds.

Removing a member from a workspace also revokes their [MCP](/features/mcp-server) tokens and ends their open MCP sessions.

## Data export and deletion

A workspace owner can export the whole workspace as JSON. The export holds meetings, transcripts, tasks, documents, chats and the audit log. Files are included as links that stay valid for 12 hours.

The owner can also delete the workspace. A workspace with a paid subscription has to cancel it first.

Deleting a meeting, project, context file, chat, voice profile, account or workspace also deletes its files in storage and its search vectors. Each user can delete their own voice profile. A user who owns a workspace with other members cannot delete their account until they transfer the ownership.

## Your AI keys and integration tokens

With BYOK, the AI runs under your own OpenRouter and Deepgram accounts, so your agreements with those providers apply. Keys are stored in your workspace and are never sent back to the browser: the dashboard shows a masked value. See [BYOK Architecture](/security/byok-architecture).

Workspace API keys and the tokens of connected integrations (Jira, Linear, Trello, Asana, Notion, Twenty, Google Drive, OneDrive, the calendars) can be encrypted in the database with AES-256-GCM. This happens only when the backend has `SECRETS_ENCRYPTION_KEY` set and the migration script `yarn secrets:encrypt` has run. Without the key, they are stored in plain text and the backend logs a warning. With it, the key lives in the backend's environment and not in the database, so a copy of the database alone does not reveal them. Self-hosted installs set their own key and can rotate it (see [Environment Variables](/self-hosting/environment-variables)).

## AI provider privacy settings

Requests to OpenRouter only go to providers that do not collect prompts for training (`data_collection: deny`). With `OPENROUTER_ZDR=true`, they only go to endpoints with zero data retention. Requests to Deepgram opt out of Deepgram's Model Improvement Program (`mip_opt_out`).

Slide images are made through OpenRouter with the same key and the same routing rule as the rest of the workspace's AI. They are stored as private files. There is no fallback to another image provider. A private install with `LLM_PROVIDER=local` makes no slide images.

These settings travel with each request. What a provider does with the data is set by its own terms. The operator of an install can change both defaults (see [Environment Variables](/self-hosting/environment-variables)).

## Connecting integrations

Every OAuth connection (Google Drive, OneDrive, Linear, Notion, the calendars) carries a signed state that expires after 10 minutes, so nobody can attach their own account to someone else's workspace. Calendars go one step further: the connection is confirmed with the session of the person who started it. Disconnecting Google Calendar also removes Plan AI's access from the Google account.

## Network protections

Some features make the server fetch a URL that a user can influence: importing a website, the image proxy, the assistant's web tool, and a self-hosted Jira or Twenty. These fetches cannot reach private or internal networks. The check runs when the connection opens and again on every redirect. A private install that needs an internal Jira or Twenty lists those hosts in `SSRF_ALLOWED_HOSTS`.

The image proxy only answers signed-in users. The assistant's web tool only opens links the user typed or links that a web search returned. Web searches go to DuckDuckGo and carry only the search query.

## Error reports

Error reports sent to Sentry carry no request bodies, email addresses, IP addresses or auth headers. The backend only sends them when `SENTRY_DSN` is set.

## In transit

The web app and the mobile app talk to the backend over HTTPS. Production builds of the mobile app refuse plain HTTP. Only development builds pointed at a local backend allow it. Files are read through signed HTTPS links.

The desktop recorder also connects over HTTPS, but the versions released so far do not check the server's TLS certificate. The recorder checks certificates from the next recorder release.

In a private install, the Docker Compose file publishes every port on 127.0.0.1 only. TLS is the job of the proxy you put in front of the backend and the web app.

## What we do not have yet

Plan AI has no SOC 2 report, because no audit has been done. It has no ISO 27001 certification and no penetration test report. There is no SCIM provisioning. There is no standard DPA template yet. We make no data residency promise beyond the region chosen for the Firebase and Google Cloud project.

## Reporting a vulnerability

Email security@blueberrybytes.com. Please do not open a GitHub issue for it. The full policy is in [SECURITY.md](https://github.com/blueberrybytes/plan-ai/blob/main/SECURITY.md).
