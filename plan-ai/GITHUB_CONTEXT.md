# GitHub Context Integration Plan

This document outlines the architectural strategy for extending the existing **Plan AI** Context Engine to support full GitHub Repository synchronization.

## 1. Overview

Currently, Context items are ingested sequentially (e.g., uploading a single PDF or text file), chunked, embedded via the LLM, and stored into our Qdrant vector database via `upsertContextVectors`.

Adding a full Github Repository presents several unique challenges:

1. **Scale:** A repository can contain thousands of files.
2. **Sync Time:** The embedding and chunking process will take significantly longer.
3. **Volatility:** Repositories mutate constantly (commits, pushes), meaning Context data can become stale quickly.

## 2. Ingestion & Sync Pipeline

Because embedding a full repository is heavily time-intensive compared to a single file, we absolutely **cannot block the main Node HTTP request** while it syncs.

### Step 1: The Request

1. The user selects a connected GitHub repository from the UI.
2. The UI sends a `POST /contexts` request with `{ type: "GITHUB_REPO", githubRepoId: "xxx" }`.
3. The backend immediately inserts a `Context` record into Prisma with `status: "SYNCING"` and immediately responds `202 Accepted` to the frontend.

### Step 2: Background Processing & Queue Infrastructure

Because repository processing (fetching, parsing via tools like Repomix, and embedding) can take several minutes or longer, a background job queue is strictly required.

**Infrastructure Recommendation:**

- **Kafka** is way too much overhead for this. It is designed for massive distributed event-streaming, not simple task queueing.
- **BullMQ (Redis)** is the traditional Node.js industry standard, but it requires provisioning a Redis cluster and its open-source UI dashboards (like `bull-board`) can be clunky and hard to read.
- **Trigger.dev / Inngest (Managed)**: If you want an incredibly elegant, state-of-the-art UI with native tracing and step-by-step debugging, these are the modern standard. They are heavily used in modern TypeScript apps because they require ZERO infrastructure setup (no Redis, no Kafka) and provide beautiful hosted dashboards for free on their base tiers.
- **pg-boss (PostgreSQL)**: If you strictly want a self-hosted, invisible backend solution without 3rd party dashboards, `pg-boss` lets you run the queue natively inside your existing Prisma Postgres database.

The queue worker will handle the heavy lifting:

1. **Fetch files:** The worker connects via `GithubIntegrationService`, fetching the repository. It can use `octokit.rest.repos.getArchiveLink` to download a tarball of the default branch, which is dramatically faster than fetching files sequentially.
2. **Filtering:** The worker ignores binaries, images, `.git`, and `node_modules`, parsing only text-based code files.
3. **Batch Embedding:**
   - Each file is chunked via our existing text splitters.
   - We batch embed requests to OpenAI/OpenRouter to prevent Rate Limiting.
4. **Qdrant Injection:** The worker calls `upsertContextVectors` sequentially for each batch.
5. **Completion:** The worker updates the `Context` status in Prisma to `COMPLETED` (or `FAILED` if errors occurred).

## 3. UI Synchronization

Since the sync is a background process, the Frontend must deal with "Sync Time":

- The `ContextSidebarSection` will show a **spinner** or a "Syncing... (Progress %)" chip next to the repository name.
- We can implement a simple HTTP polling mechanism (e.g. RTK Query `pollingInterval: 5000`) or WebSockets on the Context list endpoint while any Context is historically stuck in the `SYNCING` phase.

## 4. Webhook Auto-Healing (Updates)

One of the largest benefits of having the GitHub App is real-time webhooks.

When a team pushes a commit to `main`, GitHub hits our `/api/integrations/github/webhook` endpoint.
We intercept the `push` event payload natively in `GithubIntegrationService.ts`:

1. Read the `commits` array from the payload.
2. Extract the lists of `added`, `modified`, and `removed` files.
3. Cross-reference our DB to see which `Context` entries map to this specific repository.
4. For `removed` or `modified` files: Call `deleteVectorsByFile(contextId, filePath)` internally to purge the old vectors from Qdrant.
5. For `added` or `modified` files: Pull the new file content from Octokit, generate embeddings, and `upsert` it.

This yields an ultra-fast, incremental update pipeline, ensuring the LLM's architecture diagrams and chat logic are always 100% synchronized with the remote branch natively.
