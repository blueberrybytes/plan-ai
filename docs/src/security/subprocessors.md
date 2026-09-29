# Subprocessors

These are the companies that process data for the cloud version of Plan AI at plan-ai.blueberrybytes.com. For each one, the table says what it does for Plan AI and what it receives.

A private install uses fewer of them. See [What still leaves the machine](/self-hosting/private-stack#what-still-leaves-the-machine).

## Cloud version

| Company | What it does for Plan AI | What it receives |
| --- | --- | --- |
| Railway | Hosts the API, the web app, Postgres, Redis and Qdrant. | Everything the backend stores: accounts, workspace settings and keys, meetings, transcripts, tasks, documents, chats and search vectors. |
| Google (Firebase and Google Cloud) | Sign-in (Firebase Authentication) and file storage (Firebase Storage). Optional server logging. | Accounts and email addresses. Recordings, voice profiles, context files, chat attachments and slide images. Server logs, only when logging to Google Cloud is turned on. |
| Google Analytics for Firebase | Usage analytics in the web app. | The Firebase user id, the account creation and last sign-in times, and page views. No email address. |
| OpenRouter | Routes requests to the language models, the embeddings model and the image model. | Transcripts, chat messages, documents and files attached to the chat, text to index for search, and the prompts for slide images. With BYOK this runs under your own OpenRouter key. |
| Model providers reached through OpenRouter (Google, OpenAI, Anthropic, and Black Forest Labs for slide images) | Run the models. | The content of the requests routed to them. Plan AI only routes to providers that do not collect prompts for training. |
| Deepgram | Transcription. | Meeting audio, live during the recording and the full recording after it, read through a signed link. Requests opt out of Deepgram's Model Improvement Program. |
| Resend | Sends email: meeting notes you choose to send, and invitations. | The recipients' email addresses and the content of the email. |
| Sentry | Error reports from the backend and the apps. | Error messages and stack traces. No request bodies, email addresses, IP addresses or auth headers. |
| Stripe | Billing. | The billing email address and the subscription. Card details are entered on Stripe's own checkout page. |
| Microsoft Clarity | Visitor analytics on the landing page only, not inside the app. | Clicks, scrolls and page content of the marketing pages, for visitors who are not signed in. |
| DuckDuckGo | Web searches made by the AI assistant. | The search query only. The assistant writes the query, so it can contain words from the chat. |
| mermaid.ink | Draws diagram images in the Telegram prospect flow only. | The diagram code of a proposal made for a prospect. Never meeting notes. |

## Integrations you connect

Jira, Linear, Trello, Asana, Notion, Twenty, GitHub, Google Drive, Google Calendar, Microsoft OneDrive and Outlook are only used when someone in your workspace connects them. They receive what your workspace sends them, for example a task pushed to Jira or a meeting note written to Twenty. The calendars are read-only: Plan AI reads events and writes nothing back. Their own terms apply to what they receive.

## Changes

This list was last checked on 29 September 2026.
