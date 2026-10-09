# API and Webhooks

Two ways to connect your own systems to Plan AI.

The **API** lets your system ask: list projects, meetings and tasks, read one meeting with its transcript, create or change a task.

**Webhooks** work the other way round. Plan AI calls your server when something happens: a meeting is ready, a task changes, a document is created.

The usual setup uses both. A webhook tells you that meeting `abc` is ready, and your server then reads it through the API.

## What you do not get

The API gives text and data. It does not give audio, and it does not give files (uploaded documents, slides, exports). Webhook payloads never carry the transcript text or a link to the audio. Read the transcript through the API with your token.

## The API

### Create a token

The API uses the same personal tokens as the [MCP server](/features/mcp-server). Open **Integrations**, go to the **Plan AI MCP** tab and create a token.

The full token is shown once, when you create it. If you lose it, revoke it and create a new one.

A token belongs to one person and one workspace. It sees what that person sees in that workspace, and nothing else. If that person is not part of a restricted project, the token does not see the project, its meetings or its tasks. A token stops working when it is revoked or when its owner leaves the workspace.

A token can create and change tasks. Treat it like a password.

### Base URL and authentication

```
https://api.plan-ai.blueberrybytes.com/api/v1
```

If you host Plan AI yourself, use your own backend address with the same `/api/v1` path.

Send the token in the `Authorization` header of every request:

```bash
curl https://api.plan-ai.blueberrybytes.com/api/v1/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Only personal tokens work on `/api/v1`. The rest of the Plan AI backend does not accept them.

A machine-readable description (OpenAPI 3) is at `GET /api/v1/openapi.json`. It needs no token.

### Who am I

`GET /me` returns the user and the workspace of the token.

```bash
curl https://api.plan-ai.blueberrybytes.com/api/v1/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "user": { "id": "cm1u...", "email": "ana@example.com", "name": "Ana" },
  "workspace": { "id": "cm1w...", "name": "Acme" },
  "role": "MEMBER"
}
```

### Projects

`GET /projects` lists the projects, newest first. It takes `limit` and `cursor` (see [Pagination](#pagination)).

```bash
curl "https://api.plan-ai.blueberrybytes.com/api/v1/projects?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "data": [
    {
      "id": "cm1p...",
      "title": "Website redesign",
      "description": null,
      "status": "ACTIVE",
      "visibility": "WORKSPACE",
      "meetingCount": 12,
      "taskCount": 48,
      "url": "https://plan-ai.blueberrybytes.com/projects/cm1p...",
      "createdAt": "2026-09-01T08:30:00.000Z",
      "updatedAt": "2026-10-02T14:10:00.000Z"
    }
  ],
  "nextCursor": null
}
```

`status` is `ACTIVE`, `COMPLETED` or `ARCHIVED`. `visibility` is `WORKSPACE` or `RESTRICTED`.

`GET /projects/{id}` returns one project in the same shape.

```bash
curl https://api.plan-ai.blueberrybytes.com/api/v1/projects/PROJECT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Meetings

`GET /meetings` lists the meetings, newest first, without the transcript text.

| Parameter | Meaning |
| --- | --- |
| `projectId` | Only meetings of this project. |
| `since` | Only meetings created at or after this date (ISO 8601). |
| `limit`, `cursor` | See [Pagination](#pagination). |

```bash
curl "https://api.plan-ai.blueberrybytes.com/api/v1/meetings?since=2026-10-01T00:00:00Z" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "data": [
    {
      "id": "cm1m...",
      "title": "Kickoff with the client",
      "status": "ready",
      "summary": "We agreed on the scope and the first delivery date.",
      "durationSeconds": 1840,
      "speakerCount": 3,
      "language": "en",
      "source": "RECORDING",
      "project": { "id": "cm1p...", "title": "Website redesign" },
      "url": "https://plan-ai.blueberrybytes.com/recordings/cm1m...",
      "recordedAt": "2026-10-02T09:00:00.000Z",
      "createdAt": "2026-10-02T09:31:00.000Z",
      "updatedAt": "2026-10-02T09:35:00.000Z"
    }
  ],
  "nextCursor": null
}
```

`status` is `processing`, `ready` or `failed`. The summary and tasks are there once it is `ready`. `project` is `null` for a meeting that is in no project.

`GET /meetings/{id}` returns the same fields plus the speakers, the tasks linked to the meeting and the transcript.

```bash
curl https://api.plan-ai.blueberrybytes.com/api/v1/meetings/MEETING_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "id": "cm1m...",
  "title": "Kickoff with the client",
  "status": "ready",
  "summary": "We agreed on the scope and the first delivery date.",
  "durationSeconds": 1840,
  "speakers": [
    {
      "label": "Speaker 0",
      "name": "Ana",
      "role": "Project manager",
      "speakingTimeSeconds": 760,
      "utteranceCount": 41
    }
  ],
  "tasks": [
    {
      "id": "cm1t...",
      "title": "Send the offer",
      "status": "BACKLOG",
      "priority": "HIGH",
      "assigneeEmail": "ana@example.com"
    }
  ],
  "transcript": {
    "text": "Speaker 0: Thanks for joining...",
    "utterances": [
      { "speaker": "Speaker 0", "start": 0.4, "end": 3.1, "text": "Thanks for joining." }
    ]
  }
}
```

(The other fields of the list are there too. They are left out of this example.)

`start` and `end` are seconds from the start of the recording. `speaker` in an utterance matches `label` in `speakers`. A meeting saved as text has `text` and an empty `utterances` list.

Each read of a meeting through the API is written to the workspace audit log, at most once every 30 minutes per person and meeting.

### Tasks

`GET /tasks` lists the tasks, newest first.

| Parameter | Meaning |
| --- | --- |
| `projectId` | Only tasks of this project. |
| `status` | `BACKLOG`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED` or `ARCHIVED`. |
| `assignee` | Only tasks assigned to the member with this email. |
| `updatedSince` | Only tasks changed at or after this date (ISO 8601). |
| `limit`, `cursor` | See [Pagination](#pagination). |

```bash
curl "https://api.plan-ai.blueberrybytes.com/api/v1/tasks?status=IN_PROGRESS&assignee=ana@example.com" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "data": [
    {
      "id": "cm1t...",
      "title": "Send the offer",
      "description": "Include the two options we discussed.",
      "acceptanceCriteria": null,
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "type": "TASK",
      "dueDate": "2026-10-15T00:00:00.000Z",
      "completedAt": null,
      "assignee": { "id": "cm1u...", "name": "Ana", "email": "ana@example.com" },
      "project": { "id": "cm1p...", "title": "Website redesign" },
      "parentId": null,
      "url": "https://plan-ai.blueberrybytes.com/projects/cm1p...?task=cm1t...",
      "createdAt": "2026-10-02T09:35:00.000Z",
      "updatedAt": "2026-10-03T11:02:00.000Z"
    }
  ],
  "nextCursor": null
}
```

`priority` is `LOW`, `MEDIUM`, `HIGH` or `URGENT`. `type` is `TASK`, `BUG`, `STORY` or `EPIC`.

`GET /tasks/{id}` returns one task with two more fields: `subtasks` (id, title and status of each) and `meetingIds` (the meetings the task is linked to).

```bash
curl https://api.plan-ai.blueberrybytes.com/api/v1/tasks/TASK_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

`POST /tasks` creates a task. `projectId` and `title` are required.

```bash
curl -X POST https://api.plan-ai.blueberrybytes.com/api/v1/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "PROJECT_ID",
    "title": "Call the client about the invoice",
    "priority": "HIGH",
    "dueDate": "2026-10-20T00:00:00Z",
    "assigneeEmail": "ana@example.com"
  }'
```

The answer is `201` with the new task, in the shape of `GET /tasks/{id}`.

| Field | Notes |
| --- | --- |
| `projectId` | Required on create. Cannot be changed afterwards. |
| `title` | Required on create. Up to 500 characters. |
| `description`, `acceptanceCriteria` | Text, or `null`. |
| `status`, `priority`, `type` | The values listed above. A new task is `BACKLOG`, `MEDIUM`, `TASK` unless you say otherwise. |
| `dueDate` | ISO 8601 date, or `null` for none. |
| `assigneeEmail` | Email of a member of the workspace, or `null` for nobody. |

A field that is not in this table is refused with `400`.

`PATCH /tasks/{id}` changes a task. Send only the fields you want to change.

```bash
curl -X PATCH https://api.plan-ai.blueberrybytes.com/api/v1/tasks/TASK_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "COMPLETED" }'
```

The answer is the task after the change. Tasks created or changed through the API behave like tasks changed in the app: closing one sets `completedAt`, and your webhooks receive `task.created` and `task.updated`.

### Pagination

List endpoints return `data` and `nextCursor`. `limit` goes from 1 to 100 and is 25 when you leave it out.

When `nextCursor` is not `null` there are more rows. Pass it back as `cursor` to get the next page, with the same filters:

```bash
curl "https://api.plan-ai.blueberrybytes.com/api/v1/tasks?limit=100&cursor=NEXT_CURSOR" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Lists are ordered by creation date, newest first. The cursor is an opaque string: do not build or change it.

### Dates

All dates are ISO 8601 strings in UTC, like `2026-10-02T09:31:00.000Z`.

### Errors

Errors have one shape:

```json
{ "error": { "code": "not_found", "message": "Task not found." } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_request` | A parameter or the body is not valid. The message says which one. |
| 401 | `unauthorized` | The token is missing, wrong or revoked. |
| 404 | `not_found` | No such row in this workspace, or the token's user cannot see it. |
| 429 | `rate_limited` | Too many requests. |
| 500 | `internal_error` | Something failed on our side. |

A row of another workspace and a row of a restricted project you are not part of both answer `404`, like a row that does not exist.

One exception: a body that is not valid JSON is refused before it reaches the API, with status `400` and the body `{ "message": "..." }`.

### Rate limits

100 requests per minute per IP address. Past that the API answers `429` until the minute is over. The `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` response headers tell you where you stand.

## Webhooks

### Add a webhook

Open **Integrations** and go to the **Webhooks** tab. Only workspace owners and admins can manage webhooks.

Click **Add webhook** and fill in:

- **URL**: where Plan AI sends the calls. It must start with `https://` and must be reachable from the internet. Addresses inside a private network are refused.
- **Description**: optional, a note for your team.
- **Events**: tick the ones you want. Tick none to receive all of them.

After you save, Plan AI shows the **signing secret** once. Copy it: your server needs it to check the calls, and it cannot be shown again. If you lose it, use **Rotate secret**. The old secret stops working at once.

A workspace can have up to 10 webhooks.

**Send test event** sends a `ping` event to the URL. **Deliveries** shows the last 50 calls to that URL: the event, whether it worked, how many tries it took, the status code your server answered, the error if there was one, and the payload that was sent. **Redeliver** sends one of them again. If the project of an event was made restricted afterwards, its payload is no longer shown and it cannot be sent again.

### Events

| Event | Sent when |
| --- | --- |
| `meeting.processed` | A meeting finished processing and is ready to read. |
| `meeting.deleted` | A meeting was deleted. |
| `task.created` | A task was created in the app, through the API or MCP, or by Plan AI from a meeting. |
| `task.updated` | The status, assignee, title or due date of a task changed. |
| `task.deleted` | A task was deleted. |
| `document.created` | Plan AI finished generating a document. |

Things to know:

- **Restricted projects.** A webhook belongs to the workspace, not to a person. Events about a restricted project (its meetings, its tasks, its documents) are never sent.
- `meeting.processed` is sent again when a meeting is processed again.
- A meeting saved as transcript only sends `meeting.processed` too. It normally has no summary and no tasks.
- `task.updated` is not sent when only other fields change (description, priority, type).
- Changes made by accepting a daily report do not send task events.
- Deleting a project or a whole workspace deletes its meetings and tasks without sending an event for each one.
- `document.created` is sent when Plan AI generates a document from a prompt or from a meeting. Blank documents and documents the assistant writes in the chat do not send it.

### The request

Plan AI sends a `POST` with a JSON body:

```json
{
  "id": "whd_3f9a1c0b7d2e4a6b8c0d1e2f",
  "event": "task.updated",
  "createdAt": "2026-10-03T11:02:00.412Z",
  "workspaceId": "cm1w...",
  "data": { }
}
```

`id` identifies the delivery. It stays the same across retries and when you redeliver, so you can use it to ignore a call you already handled.

These headers come with every call:

| Header | Value |
| --- | --- |
| `X-PlanAI-Event` | The event name, for example `task.updated`. |
| `X-PlanAI-Delivery` | The delivery id, same as `id` in the body. |
| `X-PlanAI-Timestamp` | When this try was sent, in Unix seconds. |
| `X-PlanAI-Signature` | `sha256=` followed by the signature in hex. |

Answer with any `2xx` status within 10 seconds. Anything else counts as a failure. Do slow work after you answer.

Events can arrive out of order, and the same delivery can arrive more than once.

### Payloads

`data` for **`meeting.processed`**:

```json
{
  "id": "cm1m...",
  "title": "Kickoff with the client",
  "summary": "We agreed on the scope and the first delivery date.",
  "durationSeconds": 1840,
  "speakerCount": 3,
  "language": "en",
  "source": "RECORDING",
  "recordedAt": "2026-10-02T09:00:00.000Z",
  "createdAt": "2026-10-02T09:31:00.000Z",
  "project": {
    "id": "cm1p...",
    "title": "Website redesign",
    "url": "https://plan-ai.blueberrybytes.com/projects/cm1p..."
  },
  "tasks": [
    { "id": "cm1t...", "title": "Send the offer", "status": "BACKLOG", "priority": "HIGH" }
  ],
  "url": "https://plan-ai.blueberrybytes.com/recordings/cm1m..."
}
```

`project` is `null` for a meeting in no project. There is no transcript text and no audio link: read the meeting with `GET /meetings/{id}`.

`data` for **`task.created`** and **`task.updated`**:

```json
{
  "id": "cm1t...",
  "title": "Send the offer",
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "type": "TASK",
  "dueDate": "2026-10-15T00:00:00.000Z",
  "completedAt": null,
  "assigneeEmail": "ana@example.com",
  "project": {
    "id": "cm1p...",
    "title": "Website redesign",
    "url": "https://plan-ai.blueberrybytes.com/projects/cm1p..."
  },
  "url": "https://plan-ai.blueberrybytes.com/projects/cm1p...?task=cm1t...",
  "createdAt": "2026-10-02T09:35:00.000Z",
  "updatedAt": "2026-10-03T11:02:00.000Z",
  "changed": ["status"]
}
```

`changed` is only in `task.updated`. It lists what changed: `status`, `assignee`, `title`, `dueDate`. The other fields are the task after the change.

`data` for **`meeting.deleted`** and **`task.deleted`**:

```json
{
  "id": "cm1t...",
  "title": "Send the offer",
  "project": {
    "id": "cm1p...",
    "title": "Website redesign",
    "url": "https://plan-ai.blueberrybytes.com/projects/cm1p..."
  }
}
```

`data` for **`document.created`**:

```json
{
  "id": "cm1d...",
  "title": "Kickoff notes",
  "status": "DRAFT",
  "project": null,
  "meetingIds": ["cm1m..."],
  "url": "https://plan-ai.blueberrybytes.com/docs/view/cm1d...",
  "createdAt": "2026-10-02T09:40:00.000Z"
}
```

`data` for **`ping`** (the test event):

```json
{ "message": "This is a test event from Plan AI." }
```

The `url` fields point to the web app. They are `null` on a self-hosted install that has not set its web address.

### Check the signature

Anyone who knows your URL can send it a request. Check the signature before you trust one.

The signature is an HMAC SHA-256, in hex, of the timestamp, a dot and the raw body, made with your signing secret:

```
HMAC_SHA256(secret, X-PlanAI-Timestamp + "." + raw body)
```

Use the body exactly as it arrived, before any JSON parsing. Parsing and writing it again can change it and the signature will not match.

It is also a good idea to refuse calls whose timestamp is more than a few minutes old. Each try is signed again with a new timestamp, so a retry is never old.

Node:

```js
const crypto = require("crypto");

// rawBody: the request body as a string or Buffer, not parsed.
function isFromPlanAI(secret, headers, rawBody) {
  const timestamp = headers["x-planai-timestamp"];
  const given = headers["x-planai-signature"] || "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  const same =
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  return fresh && same;
}
```

With Express, keep the raw body: `app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }))`.

Python:

```python
import hashlib
import hmac
import time


# raw_body: the request body as bytes, not parsed.
def is_from_plan_ai(secret: str, headers, raw_body: bytes) -> bool:
    timestamp = headers["X-PlanAI-Timestamp"]
    given = headers.get("X-PlanAI-Signature", "")
    message = timestamp.encode() + b"." + raw_body
    expected = "sha256=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()

    fresh = abs(time.time() - int(timestamp)) < 300
    return fresh and hmac.compare_digest(given, expected)
```

### Retries

A delivery fails when your server answers anything other than `2xx`, does not answer in 10 seconds or cannot be reached. Plan AI follows up to 3 redirects.

A failed delivery is tried again 5 times, waiting about 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. That is 6 tries in about 8 and a half hours. After the last one the delivery is marked as failed. You can still send it again by hand with **Redeliver**.

A test event and a redelivery are tried once.

### When a webhook is turned off

After 20 deliveries in a row that failed all their tries, Plan AI turns the webhook off and stops calling the URL. This is written to the workspace audit log. One delivery that works sets the count back to zero.

Fix your server and turn the webhook on again in the **Webhooks** tab. The count starts from zero. Events that happened while it was off are not sent later.

Failed test events and failed redeliveries do not count.
