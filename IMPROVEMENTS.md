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

## 26 Managed plan AI allowances — concrete caps + economics

**Problem:** The Managed tiers (€29 Pro, €65 Business) currently have no enforced AI allowance. A heavy customer recording 8 hours/day on Claude Sonnet would burn €100+/month of OpenRouter credit on a €29 plan — we'd lose money on every seat. We need (a) a concrete per-seat allowance, (b) a default-model policy that protects margin, and (c) transparent messaging so customers understand what they're getting.

### Target economics (per €10 of revenue)

For sustainable bootstrapped SaaS at ~75% gross margin:

| Line | Pro Managed (€29) | Business Managed (€65) |
|---|---|---|
| **AI budget (Deepgram + OpenRouter)** | **€1.20** | **€2.00** |
| Infrastructure (Postgres, Redis, Qdrant, hosting, Firebase, storage) | €1.00 | €0.80 |
| Stripe + tax | €0.25 | €0.20 |
| Plan AI margin | €7.55 | €7.00 |

**TL;DR:** ~10–15% of revenue returns to the customer as actual AI cost. The other 85–90% covers infra, fees, support, runway. This is normal SaaS (Fathom ~80% GM, Granola ~85%, Loom pre-Atlassian ~75%).

### Concrete per-seat allowances

```ts
// suggested constant — wire into subscriptionGuard + usageLimitGuard
const ALLOWANCE_PER_SEAT = {
  PRO_MANAGED: {
    monthlyTokens: 5_000_000,           // ~$1.25 @ Gemini Flash blended
    monthlyRecordingMinutes: 300,       // 5 h × $0.0058/min = $1.74
    monthlyGenerations: 30,             // docs + slides + diagrams combined
  },
  BUSINESS_MANAGED: {
    monthlyTokens: 15_000_000,
    monthlyRecordingMinutes: 900,       // 15 h
    monthlyGenerations: 100,
  },
  // BYOK plans: no caps. The customer pays their own OpenRouter + Deepgram
  // bill directly. We don't need to enforce limits — their wallet does.
  PRO_BYOK: null,
  BUSINESS_BYOK: null,
};
```

Workspace total allowance = `subscriptionSeats × ALLOWANCE_PER_SEAT[tier]`.

### Why these numbers

- **Deepgram is the floor.** 1 h of audio = $0.35. Typical engineering team records ~10 meetings × 30 min = ~5 h/seat/month → $1.75 just in transcription. Unavoidable.
- **LLM cost depends drastically on model choice** — see model selection policy below.
- **95th percentile rule.** Set caps so 95% of real users fit comfortably. The 5% that overshoot get throttled or upgraded.

### Model selection policy for Managed plans

**Default model for Managed tiers: Gemini 2.0 Flash** (~$0.25/M tokens blended). Premium models (Claude Sonnet at ~$9/M, GPT-4o at ~$5/M) would blow the budget instantly — 5M tokens × $9 = $45, vs a €29 plan with €1.20 of budget. Math doesn't work.

Options for offering premium models on Managed:
1. **Block premium models entirely on Managed plans** — simplest, ships fastest. Customers who want premium switch to BYOK.
2. **"Premium model add-on" line item** — extra €X/month enables Sonnet/GPT-4o on Managed. Stripe metered billing.
3. **Pass-through metered billing** — premium model usage logged and billed at end of month at cost + small markup. Complex but fair.

**Recommendation:** start with option 1 (block premium on Managed). Premium-model demand is small enough that BYOK is the right channel for it.

### Cost per 1M tokens reference (for pricing decisions)

| Model | Blended price / 1M tokens | Cost for 5M tokens (Pro Managed budget) |
|---|---|---|
| Gemini 2.0 Flash | $0.25 | $1.25 ✅ |
| GPT-4o mini | $0.30 | $1.50 ✅ |
| Claude Haiku | $0.50 | $2.50 ⚠️ tight |
| GPT-4o | $5.00 | $25 ❌ underwater |
| Claude Sonnet 3.5 | $9.00 | $45 ❌ disaster |

### Stripe-fee gotcha for BYOK tier

Small ticket sizes are barely profitable after Stripe fees. €6 BYOK pays ~5% to Stripe (the fixed €0.25 dominates). Net is ~€5.70 — minus infra (~€1) = ~€4.70 margin. Still positive, but **BYOK is effectively a loss-leader to demonstrate value before upselling to Managed**. Don't expect BYOK to fund growth; it's a top-of-funnel customer-acquisition tool.

### Implementation checklist

**Backend:**
- Define `ALLOWANCE_PER_SEAT` constant (probably in a new `constants/allowances.ts` file).
- Extend `usageLimitGuard.ts` to enforce all three caps (tokens, recording minutes, generations).
- Throttle behavior: when over allowance, return **429 Too Many Requests** with `{ code: "allowance_exceeded", reason: "tokens" | "recording" | "generations" }` — distinct from 402 subscription-required.
- Audio WebSocket (`audioStream.ts`): check recording minutes consumed before opening Deepgram for the *new* recording. Refuse to start if over cap; emit `ALLOWANCE_EXCEEDED` error message + close.
- Expose `usage / allowance` ratios via `/api/billing/usage-limits` (already scaffolded in the BSL Stripe branch — extend to include `recording` and `generations`).

**Frontend:**
- Allowance progress bars on `/usage` (see item #25) consuming the new endpoint.
- Toast on 429 (separate from the 402 subscription toast) with copy: *"Monthly allowance reached. Upgrade to Business or switch to BYOK."*
- Pricing page transparency: add a footnote to each Managed card:
  > *"Pro Managed includes 5M tokens + 5 hours of recording + 30 generations per seat per month — covers ~95% of engineering team usage. Heavier? Switch to Business or BYOK."*

**Docs:**
- `/docs/setup/openrouter` and `/docs/setup/deepgram` already explain BYOK provisioning. Add a sibling page `/docs/pricing/allowances` explaining the Managed caps in plain English.

### Premium-model strategy (separate decision)

If/when premium-model demand becomes real, decide:
- Allow Claude Sonnet / GPT-4o on Managed plans with a per-call surcharge?
- Or restrict premium models to BYOK plans only (current default)?

Don't decide this until you have ≥20 paying Managed customers and real data on what they ask for.

**Scope:** 2 days. Backend enforcement (~1 day), frontend bars + 429 toast (~0.5 day), docs + pricing copy (~0.5 day). Should ship before the influencer launch so you don't accidentally take on a heavy user who costs more than their subscription.

 