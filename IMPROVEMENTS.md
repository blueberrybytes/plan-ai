# Plan AI — Features & Improvements

A prioritized backlog of potential features and improvements for the platform.

---

## 🚀 Features

### Sessions & Transcripts

- **Real-time transcription** — Integrate a live audio-to-text service (e.g. Deepgram or Whisper via WebSocket) so users can record meetings directly in the app instead of uploading files.
- **Session templates** — Let users save a session structure (agenda, context, persona) as a reusable template.
- **Transcript search** — Full-text search across all transcripts in a session or globally.
- **Bulk transcript upload** — Upload multiple files at once and merge them into a single session.

### Tasks

- **Task export** — Export tasks to Jira (integration already exists), Linear, or GitHub Issues.
- **Due date reminders** — Email or in-app notifications for tasks with approaching due dates.
- **Task comments/notes** — Allow users to add freeform notes to a task.
- **Recurring tasks** — Support tasks that regenerate on a schedule.

### Slides / Presentations

- **Slide themes marketplace** — Let users browse and apply community-built themes.
- **Collaborative editing** — Real-time multi-user editing on a presentation.
- **PowerPoint export** — Export presentations to `.pptx`.
- **Presentation analytics** — Track views and time-spent per slide on public presentation URLs.

### AI / Chat

- **Meeting summary email** — After a session, auto-send a summary email with key takeaways and tasks.
- **Follow-up question suggestions** — After transcript analysis, suggest clarifying questions.
- **Multi-model support** — Let users pick the AI model (GPT-4o, Claude, Gemini) per session or globally.

---

## 🛠️ Improvements

### UX

- **Undo/redo for deletions** — Soft deletes with a "restore" option so users can undo accidental deletions.
- **Keyboard shortcuts** — Power-user shortcuts (e.g. `N` to create a session, `Cmd+K` for quick nav).
- **Drag-and-drop task reordering** — Improve the task board with drag-and-drop support.
- **Infinite scroll** — Replace paginated lists with infinite scroll on sessions and transcripts.

### Developer / Quality

- **End-to-end tests** — Add Playwright tests for critical flows (login, create session, upload transcript).
- **Page-level error boundaries** — Add per-page error boundaries so one crash doesn't take down the whole app.
- **Optimistic updates** — Apply RTK Query optimistic updates so the UI feels instant.
- **Rate limiting** — Add `express-rate-limit` to protect expensive AI endpoints from abuse.
- **AI response streaming** — Stream AI responses via SSE instead of waiting for the full payload.

### Backend

- **Soft deletes** — Add a `deletedAt` field to sessions/transcripts so data is recoverable.
- **Audit logging** — Track who changed what and when per resource.
- **Webhooks** — Allow integrations to subscribe to events like `transcript.analyzed` or `task.created`.
- **Global JSON error handler** — Ensure all unhandled backend errors return JSON (not raw HTML).
