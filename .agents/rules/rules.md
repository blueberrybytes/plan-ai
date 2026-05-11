---
trigger: always_on
---

# Plan AI — Monorepo Agent Rules

This repository is a monorepo consisting of three core frontend applications that all connect to a single backend API. All AI agents working on this project MUST strictly adhere to the following rules.

## 1. Golden Rules
- **NEVER AUTO COMMIT**: Do not automatically commit code changes. Implement the changes, verify they compile/work, and then ask the user if they would like to commit.
- **GitNexus First**: This monorepo utilizes `gitnexus` for semantic code intelligence. Always use `gitnexus_impact` before modifying shared functions, and `gitnexus_query` to understand execution flows.
- **BYOK Architecture**: All AI processing (OpenRouter, Deepgram, etc.) relies on a "Bring Your Own Key" (BYOK) architecture. API Keys are stored per `Workspace`, not globally. Always verify that the `activeWorkspace` has valid keys configured before executing AI logic.

## 2. Project Structure & Tech Stack
The monorepo contains the following distinct applications:

### A. Core Web Application (`plan-ai`)
- **Location:** `/plan-ai` (Contains `/frontend` and `/backend`)
- **Stack:** Node.js/Express Backend (Port 8080), React Frontend (Port 3000).
- **Database:** PostgreSQL (via Prisma ORM) + Qdrant (Vector DB).
- **Message Queue:** BullMQ + Redis for asynchronous processing (transcriptions, AI task extraction).
- **Run Command:** `yarn dev` (from the repository root).

### B. Mobile Companion App (`plan-ai-mobile`)
- **Location:** `/plan-ai-mobile`
- **Stack:** React Native (Expo) + Expo Router.
- **Purpose:** Mobile app tailored for recording live, in-person meetings on the go.
- **Run Command:** `yarn dev:mobile` (from the repository root).

### C. Desktop Recorder (`plan-ai-recorder`)
- **Location:** `/plan-ai-recorder`
- **Stack:** Electron + React (Vite).
- **Purpose:** Native desktop app for capturing system audio and microphone streams during virtual meetings (Zoom, Google Meet, Teams).
- **Run Command:** `yarn dev:recorder` (from the repository root).

## 3. Development Workflow & Commands
- **Dependency Management:** Always use `yarn install:all` at the root level to install dependencies across all sub-projects. Avoid running `npm install` inside individual subdirectories to prevent lockfile desynchronization.
- **Environment Variables:** All applications require a `.env` file to run. If an app crashes on startup because it cannot find one, silently copy the `.env.template` file to `.env` in the respective directory.
- **Port Conflicts:** If ports `3000` or `8080` are occupied and preventing startup, run the `yarn kill-ports` script from the root.
- **Database / API Schema Changes:** If you modify `schema.prisma` in `plan-ai/backend`, you MUST run `yarn update` from the root directory. This script will migrate the database, regenerate TSOA swagger routes, and automatically sync the frontend TypeScript types.

## 4. Type Safety — Shared `api.d.ts` Pattern

All three frontends (web, mobile, recorder) consume types generated directly from the backend's OpenAPI/TSOA swagger spec. This ensures that every frontend stays in sync with the real API response shapes automatically.

### How it works
1. The backend generates `plan-ai/backend/src/swagger/swagger.json` from TSOA decorators via `yarn generate:swagger`.
2. Each frontend has a `generate:types` script that runs `openapi-typescript` against that swagger file and writes a typed `src/types/api.d.ts`.
3. All shared API types in `planAiApi.ts` are `type` aliases that import from `api.d.ts`:
   ```ts
   import type { components } from '../types/api';
   export type Workspace = components['schemas']['WorkspaceResponse'];
   export type Transcript = components['schemas']['StandaloneTranscriptResponse'];
   // etc.
   ```

### Rules for agents
- **NEVER manually define or duplicate** interfaces that already exist as a schema in `api.d.ts`. Always use the generated type alias pattern above.
- **ALWAYS run `yarn update`** after modifying `schema.prisma` or any TSOA controller — this regenerates the swagger AND re-syncs `api.d.ts` for all three frontends automatically.
- If a field access on a generated type fails with TS2339 (e.g., on `metadata` or `utterances` typed as `TsoaJsonObject`), use a **local cast** at the call site (`as Record<string, unknown>`) — do NOT revert to a manual interface.

### Per-app commands
| App                | Script                      | Output                             |
| ------------------ | --------------------------- | ---------------------------------- |
| `plan-ai/frontend` | `yarn generate:types:local` | `src/types/api.d.ts`               |
| `plan-ai-recorder` | `yarn generate:types`       | `src/types/api.d.ts`               |
| `plan-ai-mobile`   | `yarn generate:types`       | `src/types/api.d.ts`               |
| All at once        | `yarn update` (root)        | Runs all of the above + DB migrate |

## 5. Compile Verification Scripts

Run these from the **repository root** to verify all packages compile:

| Script               | What it does                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `yarn typecheck:all` | Runs `tsc --noEmit` in all 4 packages **in parallel** — fastest way to verify nothing is broken                         |
| `yarn build:all`     | Runs full `tsc` builds on backend + frontend + recorder (no output artifacts for mobile — use `typecheck:all` for that) |

Always run `yarn typecheck:all` before asking the user to commit.