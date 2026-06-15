# Plan AI Improvements Roadmap

This document outlines the high-priority features, technical debt, and quality-of-life improvements planned for the Plan AI ecosystem (Web, Desktop Recorder, and Mobile App).

## 0. Integrations must be for the Workspace
Only ADMIN or OWNER of the workspace can create integrations. And an integration. Members can oly see not edit or delete integratios 

## 1. Asynchronous Task Generation & Resiliency
**Problem:** Extracting tasks from transcripts via AI can take significant time, especially for long meetings. If the generation fails or the connection drops during this window, the user is left without tasks and no easy way to try again.
**Solution:**
- Decouple the task generation step from the immediate recording upload flow using background jobs (e.g., BullMQ).
- Implement a robust polling or WebSocket mechanism on the Desktop and Mobile apps to reflect the "Processing" state.
- Add a "Retry Generation" button in the UI for users if an AI extraction job fails due to rate limits or timeouts.

## 2. Universal Search for Recordings
**Problem:** As users accumulate dozens of meetings, finding a specific past recording becomes difficult without a search mechanism.
**Solution:**
- Add a persistent search bar to the Desktop Recorder and Mobile App interfaces.
- Enable fuzzy searching across meeting titles, dates, and transcript contents.
- Consider utilizing the existing Qdrant vector database or basic PostgreSQL text search to instantly retrieve relevant historical meetings.

## 3. Official Marketplace Applications (Jira, Linear, Trello)
**Problem:** Currently, integrations may rely on personal API keys, basic authentication, or generic OAuth workflows, which can feel unpolished for enterprise users.
**Solution:**
- Register official "Plan AI by Blueberrybytes" applications in the Atlassian Marketplace (Jira), Linear App Directory, and Trello Power-Ups.
- Transition the backend to use secure, official OAuth 2.0 flows tied to these registered applications.
- This will increase brand trust, simplify the user onboarding experience, and ensure compliance with strict corporate IT policies.

## 4. Notion Integration (Knowledge Base Sync)
**Problem:** While Plan AI is excellent at extracting actionable tasks, many meetings result in long-term decisions, wikis, or general knowledge that belongs in a documentation hub rather than an issue tracker.
**Solution:**
- Build an official integration with the Notion API.
- Allow users to automatically export full formatted transcripts, executive summaries, and action item lists directly into a selected Notion Database or Page.
- Enable a "Sync to Notion" toggle alongside the existing Jira/Linear/Trello options in the recording flow.

## 5. If transcript generation fails
**Problem:** If transcript generation fails, the user is left without tasks and no easy way to try again.
**Solution:**
- Add a "Retry Generation" button in the UI for users if an AI extraction job fails due to rate limits or timeouts. We need to store somehow that htis failed so in the recorder ui and mobile we can retry

## 6. Backend Scaling Bottlenecks (Infrastructure)
**Problem:** As concurrent users grow, the current infrastructure has a few architectural weak points that will fail under heavy load.
**Solutions to Implement:**
- **Redis Memory Exhaustion:** BullMQ currently stores massive payloads (like raw transcript texts and context strings) directly in Redis. If hundreds of large meetings are uploaded simultaneously, Redis RAM will OOM. **Fix:** Upload payloads to S3/Cloud Storage and pass a lightweight reference ID into the BullMQ job.
- **Database Connection Limits:** Prisma opens direct connections to PostgreSQL. Sudden bursts of background workers and API requests will exhaust connections. **Fix:** Implement Prisma Connection Pooling (PgBouncer) or use Railway's built-in connection pooler for serverless scaling.
- **Vector Database (Qdrant) Costs:** Storing massive codebase vectors for thousands of users will become expensive as Qdrant requires high RAM for fast RAG search. **Fix:** Optimize vector embeddings by discarding noisy code (e.g. minified files, lockfiles) and experiment with quantization.
- **External API Rate Limiting:** Even with background queues, hammering Deepgram or OpenRouter with 500 concurrent requests will trigger HTTP 429 Too Many Requests. **Fix:** Implement rate-limit aware job concurrency in BullMQ, dynamically throttling workers when APIs respond with 429s.
- **Workers share the API container (ladybug CPU):** All BullMQ workers are imported by `server.ts`, so CPU-heavy jobs — especially `gitnexus analyze` (minutes of tree-sitter/KuzuDB per repo sync, see #28) — compete with the API AND the live-audio WebSockets on the same vCPUs. Fine at current volume (analyze is a child process, queue concurrency 1, runs only on repo sync). **Fix when syncs start colliding with live recordings:** split workers into a dedicated Railway service — same codebase, a worker-only entrypoint (no Express) pointing at the same Redis. ~30 lines + one service; no redesign. Ladybug artifacts themselves scale horizontally for free (immutable blobs in Storage).

## 7. Context Graph Visualization (The Commercial "WOW" Effect)
**Problem:** The AI processing (GitNexus RAG) happens in the background, making it feel like a "black box" to the user. To sell this to technical leads and CTOs, we need a visual proof of work that generates immediate trust and a "WOW" factor during demos.
**Solution:**
- Do NOT render the entire codebase graph (500k+ nodes will cause the browser to OOM and create a visual "hairball").
- Instead, implement a **"Local Context Graph"** button under each generated ticket in the UI.
- When clicked, open a WebGL interactive canvas (using `react-force-graph-2d` or `cytoscape.js`).
- Render only the **exact path** of nodes (10-30 files/functions) that the AI investigated to generate that specific ticket. 
- Example: `Ticket` -> `userController.ts` -> `AuthService` -> `schema.prisma`. 
- **Impact:** Negligible performance cost in React, but massive commercial impact. It visually proves the AI's "train of thought" and architectural understanding.

## 8. Missing translations in a lot of pages that are hardcoded

---

## 9. Calendar Integration (Google Calendar / Outlook)
**Priority:** 🔥 High — Biggest friction killer  
**Problem:** Users must manually start recordings, name meetings, and assign projects. This creates adoption friction and means meetings that aren't manually triggered are lost forever.  
**Solution:**
- Integrate with Google Calendar API and Microsoft Graph Calendar API using existing OAuth credentials.
- Auto-detect upcoming meetings and pre-populate the title, participants, and project association.
- Optionally auto-start the desktop recorder when a calendar event begins (with user opt-in).
- Pre-fill the recording screen with event metadata (attendees, agenda, linked project).
- **Unlocks:** Email-to-participants, follow-up tracking, and speaker identification from attendee lists.

## 10. Email Meeting Notes to Participants
**Priority:** 🔥 High — Viral growth driver  
**Problem:** After a meeting is processed, only the person who recorded it sees the summary and tasks. Other attendees have no visibility unless they log into Plan AI.  
**Solution:**
- After transcript processing completes, auto-send a polished email with the summary + action items to all meeting attendees (pulled from the calendar invite).
- Use the existing Resend integration for delivery.
- Include a "View Full Transcript" deep-link back to the Plan AI web dashboard.
- Allow users to customize the email template and opt-out specific meetings.
- **Impact:** This is how the tool goes viral within a team — coworkers who never installed Plan AI start receiving valuable meeting notes and want to adopt it themselves.

## 11. Follow-up Reminders & Cross-Meeting Tracking
**Priority:** 🔥 High — Retention hook  
**Problem:** Action items from meetings are extracted but there's no mechanism to track whether they were completed before the next meeting. Tasks get lost between sessions.  
**Solution:**
- Track task completion status across recurring meetings (linked via calendar events).
- At the start of a recurring meeting, surface a "Pending from last time" panel showing unresolved tasks.
- Send automated reminder notifications (email / push) to task assignees before the next occurrence.
- Build a "Meeting Health" score: % of action items completed between sessions.
- **Impact:** This transforms Plan AI from a "recording tool" into a true accountability system.

## 12. Semantic Search Across All Transcripts
**Priority:** 💪 Medium — Differentiator  
**Problem:** Users accumulate hundreds of meetings but can only search by title or date. Finding "what did we decide about the pricing model 3 weeks ago?" is impossible.  
**Solution:**
- Leverage the existing Qdrant vector database to index all transcript content.
- Build a semantic search endpoint that returns relevant transcript snippets ranked by meaning, not just keyword match.
- Surface results with timestamps and speaker attribution so users can jump to the exact moment.
- Add a global search bar across Web, Recorder, and Mobile apps.
- **Impact:** Nobody else does cross-meeting semantic search well. This is a genuine competitive moat.

## 13. Meeting Templates / Personas per Meeting Type
**Priority:** 💪 Medium — Power user feature  
**Problem:** A daily standup, a client discovery call, and a retrospective all produce very different types of tasks. The current one-size-fits-all AI extraction doesn't optimize for each format.  
**Solution:**
- Create meeting type templates: Standup (extract blockers + updates), Retro (extract action items + wins), Client Call (extract requirements + follow-ups), 1:1 (extract feedback + goals).
- Allow users to associate a template with a recurring calendar event so it auto-applies.
- Customize the AI extraction prompt per template to produce domain-specific task structures.

## 14. Slack / Microsoft Teams Bot
**Priority:** 💪 Medium — Team awareness  
**Problem:** Only the recorder user sees the output. The rest of the team has no awareness unless they check the web dashboard.  
**Solution:**
- Build a Slack bot and Teams bot that posts the meeting summary + task list to a configured channel after processing.
- Allow per-project channel mapping (e.g., "Engineering Standup" → #engineering).
- Include interactive buttons: "View Transcript", "Assign to me", "Mark Done".
- **Impact:** Gets the *entire team* engaged with Plan AI output, not just the person who recorded.

## 15. Speaker Labels / Voice Fingerprinting
**Priority:** 🧹 Polish  
**Problem:** Transcripts show "Speaker 1", "Speaker 2" which makes reading difficult. Users can't tell who said what without cross-referencing.  
**Solution:**
- Map speakers to real names using calendar attendee lists (from Calendar Integration).
- Optionally build voice fingerprinting: after a few meetings, auto-recognize returning speakers by their voice profile.
- Allow manual speaker labeling in the transcript viewer that persists for future meetings.

## 16. Dashboard Analytics
**Priority:** 🧹 Polish — Enterprise selling point  
**Problem:** Managers and team leads can't quantify meeting culture or justify the tool's ROI to their organization.  
**Solution:**
- Track metrics: meetings per week, average duration, tasks generated per meeting, task completion rate, talk-time ratio per speaker.
- Build a "Meeting Health" dashboard in the web app with trend charts.
- Export weekly/monthly reports as PDF or email digest.
- **Impact:** This is the feature that sells Plan AI to enterprise — managers love data about their team's meeting culture.

## 17 On meetings
we can add also the pain points if exists of the client and things that client consider important

## 18 Error on Sync task
If after a meet a sync fails to Jira, Linear or whatever we need to somehow store the error and show in the UI

## 19 Improve location
Use latitude and longitude to place like Barcelona.

## 20 Add doc/slides public meet to the ticket
✅ **Done** — Public doc/slides URLs are now written to task metadata and displayed on web, Electron, and mobile. All 5 ticketing integrations (Linear, Jira, Trello, Notion, Asana) include the links in the ticket description when available.

## 21 Refactor of Recorder when generating tasks (UI overhaul)
✅ **Done** — Removed AI model selector, reorganized layout into 3 grouped card sections (Project & Task Strategy, Sync to Integrations, Generate Assets) with 2-column checkbox grids, reduced top padding, wider max-width.

## 22 Show integration metadata & badges on task details (Web/Recorder/Mobile)
✅ **Done** — All three apps (Web, Recorder, Mobile) now show clickable integration badges (Jira, Linear, Trello, Notion, Asana) with external links from `task.metadata`, plus public doc/slides chips.
**Remaining:** Cloud storage badges (Google Drive, OneDrive) are not yet shown on task detail views — these are transcript-level metadata, not task-level.

## 23 Sequence doc/slides generation before ticket sync
**Problem:** `autoSyncTasks` fires concurrently with doc/slides generation, so the initial auto-created tickets (Jira, Linear, etc.) don't include the public doc/slides links — they only appear on manual re-sync.
**Solution:** Restructure `processPendingTranscript` so that doc/slides generation runs first (awaited), then `autoSyncTasks` fires after metadata is populated. Trade-off: initial processing becomes slightly slower (sequential instead of parallel), but guarantees links are always on the ticket from the start.

## 24 Plan AI should be connected to claude code so you can ask

## 25 AI Usage page — per-track redesign (BYOK vs Managed)
**Problem:** The current `/usage` page is one-size-fits-all. After the BSL-1.1 / Stripe rollout, the page partially branches on workspace role × subscription track (BYOK admins now see estimated cost — which is genuinely *their* OpenRouter bill), but the experience still isn't tailored to what each plan actually needs:

- **BYOK** users care about **cost** (their wallet) and **per-feature/per-user breakdown** (find the expensive call paths).
- **Managed** users care about **allowance consumption** (am I close to my fair-use cap?) and **capacity planning** (which team members are heavy?). Cost in € is meaningless because it's a flat per-seat fee.
- **Regular MEMBERs** care about **their own** usage — not the workspace aggregate.
- **Plan AI internal admins** need everything for support.

**Solution — three distinct views:**

### A. Personal Usage (every member, default route)
- "My tokens this month" (single big number)
- Where they went: feature chips (Chat: X, Docs: Y, Slides: Z, …)
- Recent activity log filtered to the current user
- No cost, no aggregate workspace data
- Same UI for BYOK and Managed

### B. Workspace Usage (OWNER/ADMIN only, gated tab) — branches on `subscription.track`

**For BYOK workspaces:**
- Total workspace tokens
- 💰 **Estimated cost (USD)** — explicit "estimated, not invoiced" footnote
- Cost breakdown by feature (Chat $4.20, Transcripts $12.80…)
- Cost breakdown by user (find the heavy spenders)
- Deep link: **"Open OpenRouter dashboard for actual billing →"**
- Disclaimer: *"OpenRouter is the source of truth. Estimates can drift from the actual invoice when pricing changes mid-month."*

**For Managed workspaces:**
- Total workspace tokens
- **Allowance progress bar:** `4.2M / (seats × ALLOWANCE_PER_SEAT) tokens used` (define `ALLOWANCE_PER_SEAT` — suggested 5M/seat/month for Pro Managed, 15M/seat/month for Business Managed; stored on `Workspace.monthlyTokenLimit` already)
- Breakdown by feature + by user (capacity planning, not money)
- Footer: *"All AI costs included in your Managed plan. No surprise bills."*
- Warning banner when >85% of allowance consumed
- Throttle / 429 when allowance exhausted (backend enforcement — wire into `usageLimitGuard`)

### C. Plan AI Admin (existing `/admin/users/:id/usage`)
- Unchanged — sees everything across any workspace.

**Polish to fix at the same time:**
- Polling interval: currently 5s. Drop to 30–60s for normal users; keep 5s only when the page is in foreground AND has filters active.
- "Total Est. Cost" is hardcoded `$` — keep USD (OpenRouter charges USD globally) but make the currency explicit in the label: *"Est. cost (USD)"* to avoid confusion with Plan AI's EUR billing.
- "Blueberry Tokens" label — clarify what it means for end users (currently the page already uses *"Usage Units"* for non-admins, which is better). Decide on one canonical name in the i18n.

**Backend changes required:**
- `aiUsageController.getUsageMetrics` should accept a `scope` query: `"personal" | "workspace"`. Personal scopes the query to `userId = caller`; workspace scopes to `workspaceId` and requires OWNER/ADMIN.
- `subscriptionTrack` already exposed via `/api/billing/subscription` — frontend reads it from there.
- Define `ALLOWANCE_PER_SEAT` per tier in code (or in env) and surface remaining allowance via `/api/billing/subscription` for the Managed bar.

**Frontend changes required:**
- Split `AiUsage.tsx` into `PersonalUsage.tsx` (current member view) and `WorkspaceUsage.tsx` (admin view), each ~200 lines instead of one 600-line component.
- Tabbed layout on `/usage` — Personal default, Workspace tab visible only when OWNER/ADMIN.
- Reuse the `canSeeCost` / `canSeeProviderModel` / `canSeeTokenSplit` gating helpers added in the BSL Stripe branch.

**Scope:** ~1 day of focused work. Non-blocking for Stripe launch — the current incremental fix (BYOK admins see cost) is good enough until the first 20 paying customers, at which point capacity-planning UX becomes table stakes.

## 26 Managed plan AI allowances
Implementation checklist for per-seat usage limits (tokens / recording minutes / generations)
enforced via `usageLimitGuard` + 429 responses, with allowance progress bars on `/usage`.
Detailed numbers live in a private planning doc.

## 27 AI ticket generation — quality + UX polish (from QA harness findings)

**Context:** A QA harness was built at `plan-ai/backend/src/scripts/qaTaskGeneration.ts` that runs the production `processPendingTranscript()` against 4 synthetic transcripts. The core value works — tickets are code-aware, scoped, and prioritized — but the QA run surfaced 4 fixable issues that affect perceived quality.

### 27.1 EPIC tickets have `type: STORY` instead of `type: EPIC`
**Observed:** When the AI uses the AGILE_SLICE_AND_DICE prompt mode and creates an EPIC ("EPIC: Implement Pause/Resume Functionality…"), the ticket's `type` field is `STORY`, not `EPIC`. Engineering teams using Jira/Linear expect distinct EPIC types so they roll up in dashboards correctly.

**Cause:** Either the Prisma `TaskType` enum is missing `EPIC`, or the prompt schema/instructions don't tell the LLM to use it.

**Fix:**
1. Audit `TaskType` enum in `schema.prisma` — add `EPIC` if missing.
2. Update the LLM schema (`TranscriptTaskRawSchema` in `projectTranscriptService.ts`) so the type union includes EPIC.
3. Update the persona prompt: *"When you generate an EPIC parent task, set `type: EPIC`. Subtasks remain TASK/STORY/BUG."*
4. Sync integrations: when syncing EPICs to Jira/Linear, map our `EPIC` to their native epic type.

**Scope:** ~3 hours.

### 27.2 EPIC story points don't equal sum of subtasks
**Observed:** A transcript produced an EPIC with `storyPoints: 8` and 5 subtasks with `storyPoints: 5+3+3+1+2 = 14`. Engineering teams typically expect the EPIC to equal the sum of children.

**Fix:** In the prompt's AGILE_SLICE_AND_DICE section, add: *"The EPIC's storyPoints MUST equal the sum of subtask storyPoints. Compute the sum after deciding on each subtask's points."*

**Scope:** 1 line prompt change. Verify with a re-run of transcripts 02 and 03.

### 27.3 Acceptance criteria returned as bullet-prefixed strings, not arrays
**Observed:** Every ticket has `acceptanceCriteria` as a single string like `"- Foo\n- Bar\n- Baz"` instead of `["Foo", "Bar", "Baz"]`. This works for markdown UIs but breaks Jira/Linear integrations that expect arrays. The QA harness's renderer now normalizes this client-side (`normalizeAcceptanceCriteria`), but the underlying data is messy.

**Fix:** Strengthen the schema hint. In `TranscriptTaskRawSchema`, the `acceptanceCriteria` field should be `z.array(z.string())` (not string), and the prompt should explicitly say: *"acceptanceCriteria MUST be a JSON array of distinct strings. NEVER use markdown bullets inside the array."*

**Scope:** 30 min — change schema + retest.

### 27.4 Support-action tasks mixed with engineering tasks
**Observed:** Transcript 01 produced a ticket "Apply Courtesy Flags and Communicate with Affected Customers" — a support task, not engineering. Customers who push this directly to Jira will have non-eng work polluting their engineering board.

**Fix options:**
1. **Add `category` field** to tasks: `engineering | support | design | ops | research`. Frontend can filter what to surface in the engineering view vs an "action items" panel.
2. **Skip non-engineering action items entirely** when the persona is "DEVELOPER". Add to prompt: *"Only generate tickets for engineering work. Skip pure support actions (e.g., contacting customers, setting flags via admin UI) — those belong in meeting notes, not the ticket board."*

**Recommendation:** Option 1 (more flexible — different customers want different things).

**Scope:** Backend 2 hrs (add `category` field, prompt update), Frontend 2 hrs (filter UI).

### 27.5 Latency variance (73s → 153s per transcript)
**Observed:** Run 1 = 73s, Run 4 = 153s. The slow runs correlate with refactor transcripts that trigger more GitNexus tool calls (`gitnexus_query`, `gitnexus_context`). Mean ~100s.

This is **mostly acceptable** for a 1-hour meeting workflow (user comes back after the meeting and tickets are ready), but feels slow if a user records a short 5-min standup.

**Fix options:**
1. Cap the number of GitNexus tool calls (currently unlimited)
2. Parallelize tool calls when the LLM requests multiple lookups
3. Switch the agentic loop to a smaller/faster model for the tool-call phase, then escalate to the final reasoning model only for the JSON synthesis

**Scope:** 1-2 days exploration. Not urgent unless customer feedback complains.

### 27.6 Heuristic counters in QA harness were broken (already fixed in branch)
The original QA script's quality counters under-reported file/symbol mentions because the regex was too strict. Already fixed in `qaTaskGeneration.ts` by:
- Loosening file regex to match names mid-sentence
- Adding multi-shape symbol detection (backticked identifiers, camelCase, dot-paths, method calls)
- Normalizing acceptance criteria before counting

Re-running the 4 transcripts should now show `Files: 3-5/6` and `Syms: 4-6/6` per run (instead of `0-2` and `0`).

 

## 28.5 Live transcript translation toggle (recorder)
**Problem:** users who don't fully master the meeting's language struggle to follow the live transcript (field feedback 2026-06-11).
**Solution:** per-recording toggle that translates each CONSOLIDATED final block (not interims) to the user's language via a cheap model (Gemini Flash — cents per meeting), rendered in dimmed text under the original. Post-freeze feature.

## 28 Per-Repo GitNexus Analysis ("Ladybug per repo")

### Context
When a GitHub repo (e.g. `somelye`) is connected to a project, the MCP fallback in task refinement
currently queries the GitNexus index of **plan** (the Plan AI codebase itself) — completely wrong
context for any other project. This is actively harmful: tickets about somelye's responsiveness
receive Plan AI architectural context injected into the acceptance criteria.

### Architecture — Option C: persistent ladybug, CLI queries (no per-repo MCP server)

**Key decisions:**
- **Persistent, not on-demand** — generate once when the repo is connected/re-synced; Railway's
  filesystem is ephemeral so on-demand re-analysis each request would be too slow (minutes).
- **CLI not MCP** — `gitnexus query / context` shell commands work against a local `.gitnexus/`
  directory without needing to start a per-repo MCP server process.
- **Firebase Storage** — consistent with how repomix XML is already stored; survives restarts.

#### A. Generate on repo connect/re-sync (`githubContextWorker`)
```
Download tarball → extract to tmpDir
├── Repomix → Qdrant                  ← already done ✅
└── npx gitnexus analyze (in tmpDir)  ← NEW: generates .gitnexus/ graph
        ↓
    tar .gitnexus/ → Buffer
        ↓
    Upload to Firebase Storage:
        gitnexus/{contextId}/{contextFileId}.tar.gz
        ↓
    Store in ContextFile.metadata.gitnexusStoragePath
```

#### B. Query during task refinement (`projectTranscriptService`)
```
investigateRepoWithCache() result:
  ├── "success"      → use repomix text, skip MCP ✅
  ├── "no_repo"      → MCP fallback is OK (no connected repo exists)
  ├── "repo_not_ready" (chunks in Qdrant = 0) → check gitnexusStoragePath:
  │       ↓ exists → download .gitnexus/ → tmpDir → CLI queries:
  │           execAsync(`npx gitnexus query "responsive components"`, { cwd: tmpDir })
  │           execAsync(`npx gitnexus context "WineList"`, { cwd: tmpDir })
  │           → aggregate output → investigation context
  │       ↓ missing → skip enrichment entirely (DO NOT fall back to plan MCP)
  └── "too_large"    → try CLI queries on the ladybug if available, otherwise skip
```

#### C. Cleanup on repo disconnect/delete (`contextService.removeFileFromContext`)
```
removeFileFromContext()
  ├── deleteVectorsByFile(contextId, fileId)      ← already done ✅
  └── If metadata.gitnexusStoragePath exists:     ← NEW
        delete from Firebase Storage
```

### MCP fallback fix (prerequisite — do first)
Change `investigateRepoWithCache` return type to a discriminated union so the caller knows
WHY repomix returned nothing and can decide correctly whether MCP is appropriate:

```ts
type RepoInvestigationResult =
  | { status: "success"; text: string }        // repomix worked → skip MCP
  | { status: "no_repo" }                      // no connected repo → MCP OK
  | { status: "repo_not_ready" }               // repo connected, Qdrant empty → NO MCP
  | { status: "too_large" }                    // repo too big for injection → try CLI
```

### D. Auto-sync on commit (GitHub Webhooks)
**Already implemented ✅** — `githubIntegrationService.handlePushEvent` already:
- Receives `push` events via `POST /api/github/webhook`
- Finds all contexts linked to the pushed repo + branch via `metadata.githubRepoFullName`
- Enqueues a `githubContextQueue` job per context with deduplication (`push-resync-{contextId}-...`)
- Skips if the push is to a non-tracked branch

**What needs to change:** Lines 388–423 of `githubIntegrationService.ts` call a remote
`GITNEXUS_MCP_URL/api/analyze` endpoint (which doesn't exist yet). Replace that stub with
the local CLI approach described in section B above (run `gitnexus analyze` in tmpDir,
tar `.gitnexus/`, upload to Firebase Storage).

### Files to touch
| File | Change |
|------|--------|
| `workers/githubContextWorker.ts` | Run `gitnexus analyze` after repomix; tar + upload `.gitnexus/`; store path in metadata |
| `services/projectTranscriptService.ts` | Change return type of `investigateRepoWithCache`; add CLI query path; block wrong MCP fallback |
| `services/contextService.ts` | Delete `gitnexusStoragePath` from Firebase Storage in `removeFileFromContext` |
| `schema.prisma` | No changes needed — `metadata` JSON on `ContextFile` is sufficient |

### D. Ladybug lifecycle (applies to cloud AND local)

**Persist, never on-demand.** `gitnexus analyze` takes minutes on a real repo; a task-refinement
request can't wait for that. The ladybug is generated exactly once per sync and only re-generated
when the repo content changes:

| Event | Action |
|-------|--------|
| Repo connected (first sync) | `gitnexus analyze` → persist ladybug |
| Repo re-synced (new tarball) | Re-run `analyze` → **overwrite** the previous ladybug (it describes stale code) |
| Task refinement query | Download/locate ladybug → CLI queries only (seconds, no re-analysis) |
| Repo disconnected / ContextFile deleted | Delete ladybug (Firebase Storage object or local dir) — same hook as `deleteVectorsByFile` |
| Project/Context deleted | Cascade: delete every ladybug under `gitnexus/{contextId}/` |

**Local / self-hosted mode:** same flow, different storage backend. Locally the filesystem is
persistent, so skip the tar+upload round-trip and keep the ladybug on disk:

```
{DATA_DIR or ~/.plan-ai}/gitnexus/{contextId}/{contextFileId}/.gitnexus/
```

- Worker writes the analyze output there directly (no tarball, no Firebase).
- Task refinement runs the CLI with `cwd` pointing at that dir — zero download latency.
- Cleanup = `rm -rf` of that directory on disconnect (same service hook).
- Abstract behind a tiny `LadybugStore` interface (`save / getLocalPath / delete`) with two
  implementations: `FirebaseLadybugStore` (Railway) and `FsLadybugStore` (local). Pick via env
  (e.g. presence of `FIREBASE_STORAGE_BUCKET`), mirroring how repomix storage already branches.

**Why not on-demand even locally?** Cheap disk vs minutes of CPU per question. The only cost of
persisting is staleness, and re-sync already solves that (analyze is re-run on every sync). A
`metadata.gitnexusAnalyzedAt` timestamp makes staleness visible in the UI if needed.

### E. GitHub webhooks (keep the ladybug fresh)
✅ **Already covered** — `githubIntegrationService.handlePushEvent` listens for `push` webhooks and
re-enqueues the sync job (`github-push-resync`, branch-aware, deduped by jobId). Since ladybug
generation lives INSIDE `githubContextWorker`, every push automatically regenerates the ladybug —
no extra webhook work needed. (The legacy Step 2 remote `GITNEXUS_MCP_URL` re-analysis remains
env-gated behind `USE_GITNEXUS` and can be retired once ladybug is proven.)

### Implementation status (2026-06-11)
✅ **Implemented** in `plan-ai/backend`:
- `services/ladybugService.ts` — analyze + persist (Firebase tar.gz, or `LADYBUG_DATA_DIR` dir for
  local/self-hosted) + restore + delete + AI-SDK tools (`query_codebase`/`get_symbol_context`/
  `get_impact_analysis`, same names as the MCP tools so the investigation prompt is unchanged)
  wrapping `npx gitnexus query|context|impact` via `execFile` (no shell injection from LLM input).
- `workers/githubContextWorker.ts` — generates the ladybug after Qdrant indexing (best-effort,
  never fails the sync); descriptor stored in `ContextFile.metadata.ladybug`.
- `services/projectTranscriptService.ts` — `investigateRepoWithCache` now returns a discriminated
  union (`success | not_needed | no_repo | repo_not_ready | too_large | error`). Plan-MCP fallback
  is ONLY used for `no_repo`; when a repo is connected but repomix missed, the repo's ladybug is
  used — or enrichment is skipped. The wrong-codebase MCP fallback is gone.
- `services/contextService.removeFileFromContext` — deletes the ladybug (covers manual delete AND
  the worker's pre-emptive cleanup on re-sync).
- Env knobs: `LADYBUG_DISABLED=true` (skip generation/queries), `LADYBUG_DATA_DIR` (fs store).
- **Hybrid repomix+graph** (`ladybugService.getStructuralContext`): on the repomix-success path, a
  one-shot `gitnexus query` (driven by the meeting objective/snippet) injects the related execution
  flows into the prompt BETWEEN the repo code and the transcript — after the repo block so the
  Gemini implicit-cache prefix (system+repo) stays stable. Best-effort: any failure → repomix-only.
  Log marker: `[TaskRefinement] 🧭 Hybrid graph context: N chars in Xms`.

**Verified against the real CLI:** `gitnexus query/context/impact/index` exist (query supports
`--goal/--limit`). Caveats handled: `analyze` requires a git repo (GitHub tarballs have none → the
worker creates a throwaway `git init+commit`); restored indexes are registered via `gitnexus index .`.

### Remaining / testing
- Re-sync somelye → check Bull Board for `[Ladybug] ✅ Index ... persisted`
- Trigger a transcript → repomix path should show `🧭 Hybrid graph context: N chars`; if repomix
  misses, expect `ladybug:ready` + `mcp:success source=ladybug` phases
- Measure `analyze` duration on Railway (timeout is 10 min; `npx` downloads gitnexus on first run —
  consider adding `gitnexus` to backend devDependencies if cold-start is too slow)
- Watch hybrid latency: each transcript now restores the ladybug tar from Firebase for the graph
  query (~1-5s + CLI). If it hurts, cache the restored workDir per fileId for the process lifetime.