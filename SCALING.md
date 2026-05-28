# Plan AI — Scaling Audit Report

> **Date:** May 27, 2026
> **Scope:** Full monorepo — backend, workers, queues, Python voice-ai, infrastructure patterns
> **Current infra:** Railway (single instance)

---

## Executive Summary

| Severity | Count | Top Concern |
|----------|-------|-------------|
| 🔴 CRITICAL | 4 | Redis connection explosion, no job retention, stalled long jobs |
| 🟠 HIGH | 9 | N+1 queries, unbounded queries, no rate limiting, horizontal scaling blockers |
| 🟡 MEDIUM | 10 | Missing indexes, body parser limits, singleton caches, CORS |
| 🟢 LOW | 5 | Security headers, Prisma pool tuning, cleanup patterns |

---

## 🔴 CRITICAL — Fix Before Scaling

### 1. Redis Connection Explosion
**Impact:** Railway Redis has a 100-connection limit. You're using **~18 connections** now. At 2 instances = 36. Add more workers = crash.

Every queue file AND every worker file creates its own `new Redis()` connection independently. Found **18 total `new Redis()` calls**:

| File | Line | Connection Purpose |
|------|------|--------------------|
| [transcriptQueue.ts](plan-ai/backend/src/queue/transcriptQueue.ts) | ~10 | Queue connection |
| [transcriptWorker.ts](plan-ai/backend/src/workers/transcriptWorker.ts) | ~12 | Worker connection |
| [transcriptGenerationQueue.ts](plan-ai/backend/src/queue/transcriptGenerationQueue.ts) | ~10 | Queue connection |
| [transcriptGenerationWorker.ts](plan-ai/backend/src/workers/transcriptGenerationWorker.ts) | ~12 | Worker connection |
| [taskRefinementQueue.ts](plan-ai/backend/src/queue/taskRefinementQueue.ts) | ~10 | Queue connection |
| [taskRefinementWorker.ts](plan-ai/backend/src/workers/taskRefinementWorker.ts) | ~12 | Worker connection |
| [githubContextQueue.ts](plan-ai/backend/src/queue/githubContextQueue.ts) | ~10 | Queue connection |
| [githubContextWorker.ts](plan-ai/backend/src/workers/githubContextWorker.ts) | ~12 | Worker connection |
| [pricingSyncQueue.ts](plan-ai/backend/src/queue/pricingSyncQueue.ts) | ~10 | Queue connection |
| [pricingSyncWorker.ts](plan-ai/backend/src/workers/pricingSyncWorker.ts) | ~12 | Worker connection |
| [contextDocumentQueue.ts](plan-ai/backend/src/queue/contextDocumentQueue.ts) | ~10 | Queue connection |
| [contextDocumentWorker.ts](plan-ai/backend/src/workers/contextDocumentWorker.ts) | ~12 | Worker connection |
| + BullBoard, BullMQ internal event listeners, Prisma... | | |

**Fix:** Create a shared `redisConnection.ts` module that exports a single `IORedis` instance and reuse it across all queues/workers. BullMQ supports sharing connections via `{ connection: sharedRedis }`.

---

### 2. No Job Retention / Redis Memory Leak
**Impact:** Redis memory grows unbounded in production. Every completed/failed job is retained FOREVER.

Checked all queue files — **NONE** have `removeOnComplete` or `removeOnFail` in `defaultJobOptions`:

- [transcriptQueue.ts](plan-ai/backend/src/queue/transcriptQueue.ts) — ❌ No cleanup
- [transcriptGenerationQueue.ts](plan-ai/backend/src/queue/transcriptGenerationQueue.ts) — ❌ No cleanup
- [taskRefinementQueue.ts](plan-ai/backend/src/queue/taskRefinementQueue.ts) — ❌ No cleanup
- [githubContextQueue.ts](plan-ai/backend/src/queue/githubContextQueue.ts) — ❌ No cleanup
- [pricingSyncQueue.ts](plan-ai/backend/src/queue/pricingSyncQueue.ts) — ❌ No cleanup
- [contextDocumentQueue.ts](plan-ai/backend/src/queue/contextDocumentQueue.ts) — ❌ No cleanup

**Fix:** Add to every queue:
```typescript
defaultJobOptions: {
  removeOnComplete: { count: 100 },  // Keep last 100 for debugging
  removeOnFail: { count: 50 },       // Keep last 50 failed for investigation
}
```

---

### 3. Long Jobs Get Stalled & Retried (Duplicate Work)
**Impact:** BullMQ default `lockDuration` is 30 seconds. Transcript processing takes 40-300s. Jobs are marked as "stalled" and **retried**, causing duplicate transcripts, double API costs, and race conditions.

**No worker** configures `lockDuration` or `stalledInterval`:

| Worker | Actual Runtime | Default Lock | Risk |
|--------|---------------|--------------|------|
| transcriptGenerationWorker | 40-300s | 30s | 🔴 Will stall & retry |
| taskRefinementWorker | 60-120s | 30s | 🔴 Will stall & retry |
| githubContextWorker | 10-60s | 30s | 🟠 May stall |
| contextDocumentWorker | 10-30s | 30s | 🟡 Borderline |
| pricingSyncWorker | 5-15s | 30s | ✅ Usually OK |
| transcriptWorker | 5-30s | 30s | 🟡 Borderline |

**Fix:** Set appropriate lock durations:
```typescript
export const transcriptGenerationWorker = new Worker("...", handler, {
  connection,
  concurrency: 1,
  lockDuration: 600000,      // 10 minutes
  stalledInterval: 300000,   // Check every 5 minutes
});
```

---

### 4. No Rate Limiting on API
**Impact:** A single malicious user can DOS the entire backend. No `express-rate-limit` or equivalent found.

Searched [server.ts](plan-ai/backend/src/server.ts) and all middleware files — **zero rate limiting**.

**Fix:** Add `express-rate-limit`:
```typescript
import rateLimit from 'express-rate-limit';
app.use('/api/', rateLimit({ windowMs: 60_000, max: 100 }));
app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 20 }));  // Tighter for LLM
```

---

## 🟠 HIGH — Fix Before Multi-Instance

### 5. N+1 Queries in Loops

Found Prisma queries inside `for` loops in multiple services:

**a) [projectTranscriptService.ts](plan-ai/backend/src/services/projectTranscriptService.ts) — Task enrichment loop (line ~2088-2120)**
```typescript
for (const enrichedTask of object.tasks) {
  const currentTask = await prisma.task.findUnique({ where: { id: enrichedTask.id } }); // N+1!
  await prisma.task.update({ where: { id: enrichedTask.id }, ... }); // N+1!
}
```
**Fix:** Batch with `prisma.$transaction()` and pre-fetch all tasks.

**b) [integrationSyncService.ts](plan-ai/backend/src/services/integrationSyncService.ts) — Syncing tasks to integrations**
Each task sync does individual DB lookups + external API calls in a loop.

**c) [contextService.ts](plan-ai/backend/src/services/contextService.ts) — Keyword extraction per file**
Each uploaded file triggers individual DB writes for extracted keywords.

---

### 6. Unbounded Queries (No LIMIT)

Multiple `findMany()` calls without `take` that will degrade as data grows:

| File | Query | Risk at Scale |
|------|-------|---------------|
| [projectTranscriptService.ts](plan-ai/backend/src/services/projectTranscriptService.ts) | `prisma.task.findMany({ where: { transcriptId } })` | 100s of tasks per transcript |
| [aiUsageService.ts](plan-ai/backend/src/services/aiUsageService.ts) | `prisma.aiUsageLog.findMany({ where: { workspaceId } })` | 10,000s of logs per workspace |
| [transcriptController.ts](plan-ai/backend/src/controllers/transcriptController.ts) | `prisma.transcript.findMany({ where: { workspaceId } })` | 1,000s of transcripts |
| [memoryService.ts](plan-ai/backend/src/services/memoryService.ts) | `prisma.memory.findMany()` | Growing indefinitely |

**Fix:** Add `take` + cursor-based pagination to list endpoints.

---

### 7. Horizontal Scaling Blockers

If you scale to 2+ backend instances, these will break:

**a) In-memory pricing cache** — [pricingCacheService.ts](plan-ai/backend/src/services/pricingCacheService.ts)
Uses `Map` + `setInterval` for cache. Each instance has its own stale copy.
**Fix:** Move to Redis cache.

**b) MCP Client singleton** — [mcpClientService.ts](plan-ai/backend/src/services/mcpClientService.ts)
Each instance creates its own MCP connection. Fine, but duplicates resources.

**c) `setInterval` cron patterns** — Multiple `setInterval` calls in server.ts will run on EVERY instance:
- Pricing cache refresh
- Any scheduled cleanup

**Fix:** Use BullMQ repeatable jobs instead of `setInterval` for cron-like tasks.

---

### 8. Missing Database Indexes

From [schema.prisma](plan-ai/backend/prisma/schema.prisma):

| Model | Missing Index | Queried By |
|-------|--------------|------------|
| `Transcript` | `workspaceId` | Every transcript listing |
| `Transcript` | `projectId` | Project transcript queries |
| `Task` | `transcriptId` | Task-by-transcript lookups |
| `AiUsageLog` | `workspaceId + createdAt` | Usage analytics with date range |
| `ContextDocument` | `contextId` | Knowledge base queries |
| `Memory` | `organizationId` | Memory lookups |
| `ChatThread` | `userId + workspaceId` | User chat history |

> [!IMPORTANT]
> Many of these may already have implicit indexes via Prisma `@relation`, but explicit `@@index` declarations ensure the query planner uses them optimally.

---

### 9. No Timeouts on External API Calls

Multiple external HTTP calls without timeouts — will hang the worker thread if the external service is slow:

| Service | External Call | Timeout |
|---------|--------------|---------|
| [projectTranscriptService.ts](plan-ai/backend/src/services/projectTranscriptService.ts) | Deepgram `/v1/listen` | ❌ None |
| [projectTranscriptService.ts](plan-ai/backend/src/services/projectTranscriptService.ts) | Voice AI `/verify` | ❌ None |
| [integrationSyncService.ts](plan-ai/backend/src/services/integrationSyncService.ts) | Jira/Linear/Trello APIs | ❌ None |
| [webScraperService.ts](plan-ai/backend/src/services/webScraperService.ts) | Any URL scraping | ❌ None |
| [githubContextService.ts](plan-ai/backend/src/services/githubContextService.ts) | GitHub API | ❌ None |

**Fix:** Add `AbortSignal.timeout()` to all `fetch()` calls:
```typescript
const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
```

---

## 🟡 MEDIUM — Improve Before Growth

### 10. File Uploads Fully Buffered in Memory

[server.ts](plan-ai/backend/src/server.ts) uses `multer` with **memory storage** (`multer({ storage: multer.memoryStorage() })`). Large audio files (50MB+) are loaded entirely into Node.js heap memory.

**Impact:** 5 concurrent uploads × 50MB = 250MB memory spike.
**Fix:** Switch to `multer.diskStorage()` for large files, or stream directly to Firebase Storage.

---

### 11. Body Parser Limit Too Generous or Default

Check if `express.json()` has a size limit configured. Default is 100KB, but if overridden:
```typescript
app.use(express.json({ limit: '50mb' }));  // Found in server.ts
```
A 50MB JSON body can cause memory pressure.

**Fix:** Reduce to `10mb` for JSON, keep large limits only on specific upload routes.

---

### 12. CORS Wide Open

[server.ts](plan-ai/backend/src/server.ts) — CORS is configured with `origin: true` (reflects any origin):
```typescript
app.use(cors({ origin: true, credentials: true }));
```

**Fix:** Whitelist production domains:
```typescript
const ALLOWED_ORIGINS = [
  'https://app.planai.dev',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
```

---

### 13. No Helmet / Security Headers

No `helmet` middleware found. Missing headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`.

**Fix:** `app.use(helmet())` — single line, huge security improvement.

---

### 14. Prisma Connection Pool Not Tuned

Default Prisma pool size is `num_cpus × 2 + 1`. On Railway's 32-CPU machine, that's **65 connections** — may exceed your PostgreSQL plan's limit.

**Fix:** Set explicitly in DATABASE_URL:
```
?connection_limit=20&pool_timeout=10
```

---

### 15. Large JSON Metadata Without GIN Indexes

`Transcript.metadata` and `Task.metadata` are `Json` columns queried with `processingStatus` checks. Without a GIN index, Postgres does full table scans on JSON fields.

**Fix:** Add a materialized `processingStatus` column to `Transcript` (denormalize from JSON), or add a GIN index:
```sql
CREATE INDEX idx_transcript_metadata ON "Transcript" USING GIN (metadata jsonb_path_ops);
```

---

### 16. SSE/Streaming Memory Concern

The AI assistant uses Server-Sent Events for streaming responses. If clients disconnect abruptly (mobile network drop), the server-side stream may not be cleaned up properly, leaving dangling connections.

**Fix:** Add `req.on('close', () => stream.abort())` handlers on SSE endpoints.

---

### 17. Singleton Cache Without Eviction

[pricingCacheService.ts](plan-ai/backend/src/services/pricingCacheService.ts) — Uses an in-memory `Map` that grows as more models are cached. No max size or LRU eviction.

**Fix:** Use a bounded cache like `lru-cache` with max 500 entries.

---

### 18. No Retry/Backoff on External APIs

No retry logic on any external API call (Deepgram, OpenRouter, Jira, Linear, Trello, Notion, Asana, GitHub, OneDrive, Google Drive). A single 429 or 503 = permanent failure.

**Fix:** Use a retry wrapper like `p-retry` for all external calls.

---

### 19. Transaction Missing for Multi-Table Writes

[projectTranscriptService.ts](plan-ai/backend/src/services/projectTranscriptService.ts) — Task creation writes to `Task`, `TaskDependency`, and updates `Transcript.metadata` in separate queries without `$transaction`. If the process crashes mid-way, you get partial data.

---

## 🟢 LOW — Nice to Have

### 20. Global Error Handler
The server has Sentry error handling but should add explicit unhandled rejection handling:
```typescript
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
  Sentry.captureException(reason);
});
```

### 21. Worker Error Event Handler
Some workers have `worker.on('failed')` but not `worker.on('error')`. The `error` event fires for unexpected Redis disconnections.

### 22. Docker Health Checks
The voice-ai Dockerfile has no `HEALTHCHECK`. Railway can't auto-restart crashed containers.

### 23. Qdrant Connection Resilience
The Qdrant client creates a single connection at startup. No reconnection logic if Qdrant restarts.

### 24. Deepgram Audio File Size
No validation on audio file size before sending to Deepgram. A 4-hour recording (~500MB) could OOM the worker.

---

## Priority Remediation Roadmap

### Phase 1 — Immediate (prevents production incidents)
1. ✅ Add `removeOnComplete`/`removeOnFail` to all queues (30 min)
2. ✅ Set `lockDuration` on all workers — transcript (600s), task refinement (300s), github context (300s), context doc (180s), pricing sync (60s)
3. ✅ Create shared Redis connection module + migrate all workers to `createWorkerConnection()`
4. ✅ Add `express-rate-limit` — global (100/min) and AI-heavy endpoints (20/min)

### Phase 2 — Before multi-instance (prevents scaling blockers)
5. Move pricing cache to Redis
6. Add timeouts to all external `fetch()` calls
7. Add missing `@@index` to schema.prisma
8. Add pagination to unbounded queries

### Phase 3 — Growth optimization
9. Fix N+1 queries with batch operations
10. Switch multer to disk/stream storage
11. Add retry logic to external APIs
12. Restrict CORS to production domains
13. Add `helmet()` middleware

---

## 🐳 Deployment Architecture Overview

All services are deployed as **independent Docker containers** on Railway:

| Service | Dockerfile | Base Image | Port |
|---------|-----------|------------|------|
| **Backend API** | [backend/Dockerfile](plan-ai/backend/Dockerfile) | `node:22.17.1` + ffmpeg | 8080 |
| **Frontend** | [frontend/Dockerfile](plan-ai/frontend/Dockerfile) | React SPA | 3000 |
| **Voice-AI** | [voice-ai/Dockerfile](plan-ai/voice-ai/Dockerfile) | `python:3.10-slim` + PyTorch | 8000 |
| **GitNexus MCP** | [mcp/Dockerfile](plan-ai/mcp/Dockerfile) | `ghcr.io/abhigyanpatwari/gitnexus:latest` | 4747 |
| **Docs** | [docs/Dockerfile](docs/Dockerfile) | — | — |

---

## 🎤 Voice-AI Python Service — Independent Deployment Audit

> [Dockerfile](plan-ai/voice-ai/Dockerfile) · `python:3.10-slim` + ffmpeg + SpeechBrain
> Runs: `uvicorn main:app --host 0.0.0.0 --port 8000` (single worker)
> Internal URL: `plan-ai-voice.railway.internal:8000`

### 🔴 CRITICAL — Single-Process Blocking

[Dockerfile](plan-ai/voice-ai/Dockerfile) runs uvicorn with **no `--workers` flag**:
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

SpeechBrain inference is **CPU-bound** (not async). The `subprocess.run()` ffmpeg call (line 44-48) and `verification_model.verify_files()` (line 83) both **block the event loop**. With a single process:
- Request 1 starts processing (downloads audio, converts, runs inference) — **30-120s**
- Requests 2, 3, 4 all queue behind it — **complete serialization**
- No concurrency whatsoever

**Fix:** Use multiple workers:
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "3"]
```

> [!WARNING]
> Each worker loads its own copy of the ECAPA-TDNN model (~400MB RAM). 3 workers = ~1.2GB RAM baseline. Size your Railway container accordingly.

---

### 🟠 HIGH — No Authentication

[main.py](plan-ai/voice-ai/main.py) — Zero authentication on any endpoint. Anyone who discovers the Railway URL can:
- Call `/verify` to abuse compute
- Call `/health` to confirm the service exists

Since this is a Railway **internal** service (`plan-ai-voice.railway.internal`), it's only reachable from other Railway services in the same project. But if you ever expose it publicly or move to a different infra, it's wide open.

**Fix:** Add a shared API key:
```python
API_KEY = os.environ.get("VOICE_AI_API_KEY", "")

@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    if request.headers.get("x-api-key") != API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)
```

---

### 🟠 HIGH — No Request Timeout

If SpeechBrain hangs (model deadlock, corrupted audio), the request blocks forever. No timeout configured at any level:
- No uvicorn `--timeout-keep-alive`
- No FastAPI timeout middleware
- No `asyncio.wait_for()` around the inference call

**Fix:** Add timeout middleware or wrap with `asyncio.wait_for()`:
```python
result = await asyncio.wait_for(
    asyncio.get_event_loop().run_in_executor(
        None, verification_model.verify_files, profile_path, meeting_path
    ),
    timeout=120.0  # 2 minutes max
)
```

---

### 🟠 HIGH — Memory Spike on Large Audio

The entire audio file is downloaded into memory via `httpx.AsyncClient`, then written to disk, then read back by SpeechBrain. For a 50-minute recording:
- Raw audio: ~50-100MB in memory (httpx response)
- WAV conversion: creates a 16kHz mono WAV (~50MB on disk)
- SpeechBrain loads the full WAV into a tensor: ~50MB more
- Peak memory: **~200MB per request**

With 3 workers and 2 concurrent requests each = **~1.2GB spike** on top of model memory.

**Fix:** Stream downloads to disk instead of buffering:
```python
async with httpx.AsyncClient(timeout=120.0) as client:
    async with client.stream("GET", url) as response:
        with open(raw_temp.name, "wb") as f:
            async for chunk in response.aiter_bytes(chunk_size=8192):
                f.write(chunk)
```

---

### 🟡 MEDIUM — ffmpeg Blocks the Event Loop

[main.py line 44](plan-ai/voice-ai/main.py#L44-L48):
```python
subprocess.run(["ffmpeg", ...], check=True)  # BLOCKING
```

This is a synchronous call. For large files, ffmpeg can take 30+ seconds. During this time, the entire async event loop is frozen.

**Fix:** Use `asyncio.create_subprocess_exec()`:
```python
proc = await asyncio.create_subprocess_exec(
    "ffmpeg", "-y", "-i", raw_temp.name, "-ac", "1", "-ar", "16000", wav_temp.name,
    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
)
await proc.wait()
```

---

### 🟡 MEDIUM — Docker Image Size / Cold Start

The Docker image includes PyTorch + torchaudio + SpeechBrain + model weights. Expected image size: **~4-6GB**. Railway cold starts (after sleep or redeploy) will take **60-90 seconds** to pull and start.

The Dockerfile pre-downloads the model at build time (line 14), which is good — avoids download at runtime. But the image size is a concern for fast scaling.

**Fix:** Use `python:3.10-slim` (already done ✅), consider multi-stage build to strip build dependencies.

---

### ✅ Horizontal Scaling — Safe

Running 2+ instances of voice-ai is **safe**:
- No shared state — each instance loads its own model
- No database — purely stateless compute
- Temp files are per-request and cleaned up in `finally` blocks
- No in-memory cache

Only concern: model loading RAM × N instances.

---

## 🧠 GitNexus MCP Server — Independent Deployment Audit

> [Dockerfile](plan-ai/mcp/Dockerfile) · `ghcr.io/abhigyanpatwari/gitnexus:latest`
> Runs: `gitnexus serve --host 0.0.0.0 --port 4747` (built into image)
> Storage: Railway Volume mounted at `/data/gitnexus`
> Index: 502K nodes, 965K edges, 1.4 GB `lbug` file
> Local dev: `npx gitnexus serve` via `yarn dev`

### 🔴 CRITICAL — No Reconnection Logic

[mcpClientService.ts](plan-ai/backend/src/services/mcpClientService.ts) — The MCP client connects **once** at startup (line 54). If the GitNexus server restarts (deploy, crash, OOM):
- `this.client` holds a dead connection
- `this.isAvailable` remains `true`
- Every subsequent tool call fails silently
- The only recovery is **restarting the backend**

```typescript
// Line 54-57 — one-shot connection, no retry
await Promise.race([
  this.client.connect(transport),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000)),
]);
```

**Fix:** Add reconnection on tool call failure:
```typescript
private async ensureConnected(): Promise<boolean> {
  if (this.isAvailable && this.client) return true;
  try {
    await this.initialize();
    return this.isAvailable;
  } catch {
    return false;
  }
}
```

Call `ensureConnected()` in `queryContext()` and `getAiTools()` before using the client.

---

### 🟠 HIGH — No Tool Call Timeout

Individual MCP tool calls have **no timeout**. The `queryContext()` method has a 5s timeout (line 79-87), but `getAiTools()` tools (used by the LLM) have **none**:

```typescript
// query_codebase tool — line 131-147
execute: async ({ query, goal }) => {
  const result = await this.client!.callTool({  // NO TIMEOUT
    name: "mcp_gitnexus_query",
    arguments: { query, goal },
  });
  // ...
}
```

If the GitNexus server hangs, the LLM `generateText()` call hangs forever, blocking the entire worker.

**Fix:** Wrap with `Promise.race` timeout:
```typescript
const result = await Promise.race([
  this.client!.callTool({ name: "mcp_gitnexus_query", arguments: { query, goal } }),
  new Promise<null>((_, reject) => setTimeout(() => reject(new Error("MCP tool timeout")), 10000)),
]);
```

---

### 🟠 HIGH — Concurrent Access Bottleneck

The GitNexus MCP server is a **single-process Node.js server**. When multiple transcripts trigger agentic investigation simultaneously:

| Scenario | Concurrent MCP Calls | Risk |
|----------|---------------------|------|
| 1 transcript | 2 tool calls (sequential) | ✅ Fine |
| 3 simultaneous transcripts | 6 tool calls | 🟠 May queue |
| 10 simultaneous transcripts | 20 tool calls | 🔴 Backpressure / timeout |
| + GitHub sync triggering analysis | +1 blocking POST | 🔴 Contention |

The `taskRefinementWorker` has concurrency 1, which helps. But `transcriptGenerationWorker` has concurrency 2, and the main pipeline also calls `mcpClientService.queryContext()` directly.

**Fix:** 
1. Run GitNexus MCP server with clustering: `npx gitnexus serve --workers 4`
2. Add a semaphore/queue on the backend side to limit concurrent MCP calls:
```typescript
import PQueue from 'p-queue';
const mcpQueue = new PQueue({ concurrency: 3 });
// Use: await mcpQueue.add(() => this.client.callTool(...));
```

---

### 🟠 HIGH — Index Staleness Problem

The GitNexus index is a **static snapshot** built at deploy time (or via `npx gitnexus analyze`). As users push code to GitHub:
- The index becomes stale
- Agentic investigation references files/functions that no longer exist
- Generated acceptance criteria may be wrong

Currently, `githubContextWorker` triggers `POST /api/analyze` on each GitHub sync (line 201-208), which re-indexes. But:
- This only works if `USE_GITNEXUS=true` in production
- The analysis blocks the worker while running (~30-60s)
- No timeout on the analysis fetch
- If the GitNexus server is busy with tool calls, the analysis may queue

**Fix:** 
1. Make the re-analysis truly async (fire-and-forget, don't block the worker)
2. Add a webhook from GitHub to trigger re-index on push
3. Add a TTL/staleness indicator so the LLM knows when context may be outdated

---

### 🟡 MEDIUM — Memory Growth with Multiple Repos

Each indexed repository stores symbols, relationships, and execution flows in memory within the GitNexus server. As more users connect GitHub repos:
- 5 repos × ~500K symbols each = 2.5M symbols in memory
- Query time degrades
- OOM risk on small containers

**Fix:** Configure a max repo limit per GitNexus instance, or use disk-backed storage for the index.

---

### 🟡 MEDIUM — No Health Check / Liveness Probe

The GitNexus MCP server has no health check endpoint. Railway can't distinguish between "server is processing" and "server is stuck/dead". The backend MCP client only detects failure when a tool call errors out.

**Fix:** Add `GET /health` to the GitNexus server config or use a TCP health check on port 4747.

---

### 🟠 HIGH — Railway Volume = Single Instance Lock

The [Dockerfile](plan-ai/mcp/Dockerfile) requires a **Railway Volume** at `/data/gitnexus` for the index. Railway Volumes are **attached to a single service instance** — you can't share a volume across replicas.

This means:
- **Horizontal scaling is blocked** — you can't run 2 GitNexus instances sharing the same index
- The index must be on persistent storage (not ephemeral container disk) or else it's lost on redeploy
- Re-analysis via `POST /api/analyze` writes to this volume, so only the attached instance can update

**Fix options:**
1. Use an object store (S3/GCS) for index files + download-on-startup pattern
2. Build the index into the Docker image at CI/CD time (bake it in)
3. Accept single-instance for now, add a read-replica pattern later (primary writes, replicas read a shared store)

---

### ✅ Horizontal Scaling — Partially Safe

Running 2+ GitNexus instances would work IF:
- Each has access to the same index files (shared object store or baked into image)
- The backend distributes requests across instances (load balancer)
- Index updates are propagated to all instances

Currently **NOT safe** because:
- Railway Volume is attached to a single instance
- The backend MCP client connects to a single URL (`GITNEXUS_MCP_URL`)
- No load balancer between multiple GitNexus instances

---

## Updated Executive Summary

| Severity | Count | Top Concern |
|----------|-------|-------------|
| 🔴 CRITICAL | 5 | Redis explosion, no job retention, stalled jobs, voice-ai single-process, MCP no-reconnect |
| 🟠 HIGH | 14 | N+1 queries, no rate limiting, voice-ai no auth/timeout, MCP no tool timeout, MCP concurrency |
| 🟡 MEDIUM | 14 | Missing indexes, CORS, voice-ai ffmpeg blocking, GitNexus memory/staleness |
| 🟢 LOW | 5 | Security headers, Prisma pool, Docker health checks |

## Updated Remediation Roadmap

### Phase 0 — Voice-AI (before next deploy)
1. Add `--workers 3` to uvicorn CMD in Dockerfile
2. ✅ API key auth middleware (already existed)
3. ✅ Add request timeout (180s via `TimeoutMiddleware`)

### Phase 1 — Backend Critical (this sprint)
4. ✅ Add `removeOnComplete`/`removeOnFail` to all queues
5. ✅ Set `lockDuration` on all workers (per-worker tuned values)
6. ✅ Create shared Redis connection module + migrate workers
7. ✅ Add `express-rate-limit`
8. ✅ Add MCP client reconnection logic + circuit breaker

### Phase 2 — Before multi-instance
9. ✅ Pricing cache — already Redis-backed (Map is fast-read optimization, acceptable for horizontal scaling)
10. ✅ Add timeouts to all external `fetch()` calls (41+ call sites across 11 services)
11. ✅ Add missing `@@index` to schema.prisma (Transcript, Task, AiUsageLog, ChatThread)
12. ✅ Add MCP tool call timeouts (10s per tool via `Promise.race`)
13. ✅ Add `take` limits to unbounded queries (contextService, transcriptsController)

### Phase 3 — Growth optimization
14. ✅ Fix N+1 queries with batch operations (doc/slides metadata, task refinement, dependencies)
15. ✅ Stream audio downloads in voice-ai (`client.stream()` + `aiter_bytes()`)
16. Add retry logic to external APIs
17. ✅ Restrict CORS to production domains (env-var-driven `CORS_ORIGINS`)
18. ✅ Add `helmet()` middleware
19. Add health checks to all services

