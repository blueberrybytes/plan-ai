# TESTING — Scaling Fixes Verification Checklist

> **Date:** May 27, 2025  
> **Scope:** All CRITICAL + HIGH fixes from `SCALING.md`  
> **Pre-requisite:** Run `yarn update` from root to apply the Prisma migration (new indexes).

---

## 1. Worker lockDuration & Shared Redis

These changes prevent stalled job duplication and reduce Redis connections.

### Transcript Generation Worker (lockDuration: 10 min)
- [ ] Create a standalone transcript with 3+ minutes of content
- [ ] Verify transcript processes fully (status goes PENDING → EXTRACTING_TASKS → COMPLETED)
- [ ] Check Railway logs — no `stalled` warnings during processing
- [ ] Verify tasks are created (not duplicated)

### Task Refinement Worker (lockDuration: 5 min)
- [ ] Enable agentic investigation on a transcript with a GitHub repo connected
- [ ] Verify refinement completes (metadata shows `refinedAt` timestamp on tasks)
- [ ] No duplicate task enrichment (check task descriptions aren't doubled)

### Context Document Worker (lockDuration: 3 min)
- [ ] Upload a PDF to a project's knowledge base
- [ ] Verify it processes (keywords extracted, file indexed in Qdrant)
- [ ] Upload a second file — verify no stalled job from the first

### GitHub Context Worker (lockDuration: 5 min)
- [ ] Connect a GitHub repo to a project
- [ ] Trigger sync — verify repo files appear in the context
- [ ] Check no duplicate files appear

### Pricing Sync Worker (lockDuration: 1 min)
- [ ] Verify OpenRouter pricing data loads on workspace settings page
- [ ] Check token usage analytics show model costs

### Redis Connection Count
- [ ] In Railway Redis dashboard, verify active connections ≤ 10 (was ~18+ before)

---

## 2. CORS (env-var driven)

### Local Development (no CORS_ORIGINS set)
- [ ] Start backend without `CORS_ORIGINS` in `.env`
- [ ] Frontend on `localhost:3000` can make API calls normally
- [ ] Recorder app can make API calls normally
- [ ] No CORS errors in browser console

### Production (CORS_ORIGINS set)
- [ ] Set `CORS_ORIGINS=https://plan-ai.blueberrybytes.com` in Railway env
- [ ] Verify production frontend works normally
- [ ] Verify requests from unauthorized origins are blocked (open browser console on a different domain, try `fetch('https://api.planai.dev/api/healthcheck')`)

---

## 3. Database Indexes (Prisma Migration)

> **⚠️ IMPORTANT:** Run `yarn update` to create the migration before testing.

### Verify Migration Applied
- [ ] `yarn update` completes without errors
- [ ] Check `prisma migrate status` shows no pending migrations

### Performance Spot-Checks
- [ ] Transcript list page loads fast (index on `userId`, `createdAt`)
- [ ] Task board loads fast (index on `createdAt`)
- [ ] AI Usage analytics page with 90-day filter loads fast (composite index on `workspaceId + createdAt`)
- [ ] Chat threads list loads in order (index on `createdAt`)

---

## 4. N+1 Query Fixes (Batched Operations)

### Auto-Doc Generation
- [ ] Create a transcript with `createDoc: true`
- [ ] After doc generates, check all tasks have `metadata.publicDocUrl` set
- [ ] Verify doc URL is the same on all tasks (batch worked correctly)

### Auto-Slides Generation
- [ ] Create a transcript with `createSlides: true`
- [ ] After slides generate, check all tasks have `metadata.publicSlidesUrl` set
- [ ] Verify slides URL is the same on all tasks

### Task Refinement (Batched)
- [ ] Trigger a transcript with agentic investigation enabled
- [ ] After refinement, verify enriched tasks have `metadata.refinedAt`
- [ ] Verify `metadata.preRefinementDescription` is preserved (audit trail)

### Task Dependencies (Batched)
- [ ] Create a transcript that generates tasks with dependencies
- [ ] Verify `TaskDependency` records exist in DB
- [ ] Verify dependency links show correctly on task board

---

## 5. Unbounded Query Limits

### Context Listing
- [ ] Workspace with < 100 contexts — all show up
- [ ] (If possible) workspace with 100+ contexts — only 100 returned, no crash

### Transcript Detail
- [ ] Open a transcript with many tasks — verify tasks load (capped at 200)
- [ ] Open a transcript with documents — verify docs load (capped at 50)

---

## 6. External API Timeouts (15s default, 30s for slow ops)

### Integration OAuth Flows
- [ ] Connect Jira — OAuth exchange works
- [ ] Connect Linear — OAuth exchange works
- [ ] Connect Asana — OAuth exchange works
- [ ] Connect Trello — verify credentials works
- [ ] Connect Notion — OAuth exchange works
- [ ] Connect Microsoft/OneDrive — OAuth exchange works

### Integration Sync (Auto-Sync Tasks)
- [ ] Create transcript with Jira sync enabled → tasks sync to Jira
- [ ] Create transcript with Linear sync enabled → tasks sync to Linear
- [ ] Create transcript with Trello sync enabled → cards created
- [ ] Create transcript with Asana sync enabled → tasks created
- [ ] Create transcript with Notion sync enabled → pages created

### Cloud Export
- [ ] Export transcript to Google Drive → file appears
- [ ] Export transcript to OneDrive → file appears

### Other External Calls
- [ ] Send workspace invitation email (Resend API) — email arrives
- [ ] Generate image for slides (OpenRouter Flux) — image renders
- [ ] GitHub repo sync triggers GitNexus analysis — completes without hanging
- [ ] Voice profile verification — match/no-match result returns

### Timeout Behavior (Hard to test, but verify gracefully)
- [ ] If an external API is down, the request fails with a timeout error (not hanging forever)
- [ ] Check Railway logs for any `AbortError` or `timeout` messages after failed external calls

---

## 7. Voice-AI Fixes

### Streaming Downloads
- [ ] Upload a voice profile (audio file)
- [ ] Run voice verification between profile and meeting recording
- [ ] Verify result returns `{match, score, threshold}`
- [ ] Check server memory doesn't spike during large file downloads (if monitoring available)

### Request Timeout (180s)
- [ ] Normal verification requests complete well under 180s
- [ ] (Edge case) If Voice AI hangs, it should return 504 after 180s

### SpeechBrain Off Main Thread
- [ ] Verify `/health` endpoint responds while a `/verify` is in progress
- [ ] No `asyncio` blocking warnings in voice-ai logs

---

## 8. Repomix Script

### Single File Output
- [ ] Run `yarn repomix:single`
- [ ] Verify `repomix_output/plan-ai-full.xml` is created
- [ ] File contains code from all 4 apps (backend, frontend, recorder, mobile)
- [ ] File does NOT contain `node_modules`, `.venv`, or `.git` content

### Existing Multi-File (Regression)
- [ ] Run `yarn repomix`
- [ ] Verify 4 separate XML files still generated in `repomix_output/`

---

## 9. Regression Tests

### Core Flows (Must Not Break)
- [ ] Sign up / Sign in (email + Google + Apple + Microsoft)
- [ ] Create a project
- [ ] Record a meeting (desktop recorder)
- [ ] Record a meeting (mobile app)
- [ ] Upload audio file (web)
- [ ] Create standalone transcript (paste text)
- [ ] AI assistant chat (home + project-scoped)
- [ ] Generate document from prompt
- [ ] Generate presentation from prompt
- [ ] Generate diagram from prompt
- [ ] Kanban board drag-and-drop
- [ ] AI Task Coach (improve description, generate AC, estimate points)

### Type Safety
- [ ] `yarn typecheck:all` passes with 0 errors

---

## Quick Smoke Test Order

For a fast verification pass, test in this order:

1. `yarn update` (migration + types)
2. `yarn typecheck:all` (compilation)
3. `yarn dev` (start all services)
4. Create a standalone transcript with text → verify tasks generated
5. Check task board → verify tasks are there, no duplicates
6. Open AI Usage → verify analytics page loads
7. Check workspace settings → verify integrations page loads
8. Run `yarn repomix:single` → verify output file

## 10. New Environment Variables (This Branch)

> Only the **new** env vars introduced by the scaling/security changes.  
> Add these to your Railway / Docker config before deploying.

| Variable | Service | Required | Default | Description |
|----------|---------|:--------:|---------|-------------|
| `CORS_ORIGINS` | Backend API | No | `""` (allows all) | Comma-separated list of allowed origins. **Set in production** (e.g. `https://plan-ai.blueberrybytes.com`). Leave empty for local dev. |
| `VOICE_AI_API_KEY` | Backend API **+** Voice AI | No | `""` (disabled) | Shared secret between backend → voice-ai. **Must be identical on both services.** Leave empty for local dev. |
| `VOICE_REQUEST_TIMEOUT` | Voice AI only | No | `180` | Max request duration in seconds. Returns 504 if exceeded. |

### Where to set them

```
# Backend API (Railway / plan-ai/backend/.env)
CORS_ORIGINS="https://plan-ai.blueberrybytes.com"
VOICE_AI_API_KEY="your-shared-secret"

# Voice AI (Railway / plan-ai/voice-ai env)
VOICE_AI_API_KEY="your-shared-secret"      # ← must match backend
VOICE_REQUEST_TIMEOUT=180                   # ← optional, 180s default
```

