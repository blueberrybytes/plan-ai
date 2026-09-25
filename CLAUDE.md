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

All three frontends consume types generated from the backend's TSOA swagger spec. **Never hand-write interfaces** that already exist as a backend schema.

### How it works
1. Backend generates `swagger.json` from TSOA decorators (`yarn generate:swagger`).
2. Each frontend runs `openapi-typescript` to produce `src/types/api.d.ts`.
3. All shared types in `planAiApi.ts` are thin `type` aliases:
   ```ts
   import type { components } from '../types/api';
   export type Workspace  = components['schemas']['WorkspaceResponse'];
   export type Transcript = components['schemas']['StandaloneTranscriptResponse'];
   ```

### Agent rules
- **NEVER** define manual interfaces for types that exist in `api.d.ts`.
- **ALWAYS** run `yarn update` after any TSOA controller or `schema.prisma` change — this regenerates swagger AND re-syncs `api.d.ts` across all frontends.
- If a generated type field fails with TS2339 (e.g. `metadata: TsoaJsonObject`), cast at the call site: `(item.metadata as Record<string, unknown>)?.field` — do NOT revert to a manual interface.

### Per-app type generation
| App                | Script                      | Notes                   |
| ------------------ | --------------------------- | ----------------------- |
| `plan-ai/frontend` | `yarn generate:types:local` | Reads local swagger     |
| `plan-ai-recorder` | `yarn generate:types`       | Reads local swagger     |
| `plan-ai-mobile`   | `yarn generate:types`       | Reads local swagger     |
| All at once        | `yarn update` (root)        | Also runs DB migrate    |

## 5. Compile Verification

Run from the **repository root** before committing:

| Script               | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `yarn typecheck:all` | `tsc --noEmit` across all 4 packages in parallel — fastest check |
| `yarn build:all`     | Full `tsc` builds on backend + frontend + recorder               |

**Always run `yarn typecheck:all` before asking the user to commit.**


<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **plan** (14506 symbols, 28346 relationships, 564 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/plan/context` | Codebase overview, check index freshness |
| `gitnexus://repo/plan/clusters` | All functional areas |
| `gitnexus://repo/plan/processes` | All execution flows |
| `gitnexus://repo/plan/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
