import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import util from "util";
import fs from "fs";
import os from "os";
import path from "path";
import * as tar from "tar";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";
import {
  uploadContextFileToFirebaseStorage,
  deleteContextFileFromFirebaseStorage,
  getContextFileContentFromFirebaseStorage,
} from "../firebase/firebaseStorage";

const execFileAsync = util.promisify(execFile);

/**
 * "Ladybug" = the per-repo GitNexus index (`.gitnexus/` directory, KuzuDB graph).
 *
 * Why this exists: the global GitNexus MCP server is indexed on the Plan AI
 * codebase itself. Using it to enrich tickets for a CUSTOMER's connected repo
 * injects the wrong codebase's context (see IMPROVEMENTS.md #28). Instead, the
 * github sync worker runs `gitnexus analyze` on the freshly extracted repo and
 * persists the resulting index. Task refinement later restores it and queries
 * it with the gitnexus CLI — no per-repo MCP server needed.
 *
 * Storage backends:
 *  - `LADYBUG_DATA_DIR` set → plain directory on disk (local / self-hosted,
 *    where the filesystem is persistent). Zero-copy restore.
 *  - otherwise → tar.gz in Firebase Storage (Railway: ephemeral filesystem),
 *    mirroring how the repomix XML is already stored.
 *
 * Lifecycle: generated on every sync (webhook push re-sync included — the
 * worker re-runs, overwriting via the new ContextFile), deleted in
 * `contextService.removeFileFromContext` (covers both manual deletion and the
 * worker's pre-emptive cleanup of the previous sync's row).
 */

/** Descriptor persisted in ContextFile.metadata.ladybug */
export interface LadybugDescriptor {
  store: "fs" | "firebase";
  /** fs: absolute directory containing `.gitnexus/` · firebase: storagePath of the tar.gz */
  key: string;
  analyzedAt: string;
}

const ANALYZE_TIMEOUT_MS = 10 * 60 * 1000; // analyze of a large repo takes minutes
const QUERY_TIMEOUT_MS = 60 * 1000;
const MAX_TOOL_OUTPUT_CHARS = 20_000;
const MAX_BUFFER = 64 * 1024 * 1024;

// Both env vars are OPTIONAL — pass a default so EnvUtils.get never throws
// (it raises on undefined vars when no default is provided).
function isDisabled(): boolean {
  return EnvUtils.get("LADYBUG_DISABLED", "") === "true";
}

function fsDataDir(): string | undefined {
  return EnvUtils.get("LADYBUG_DATA_DIR", "") || undefined;
}

async function runGitnexus(
  args: string[],
  cwd: string,
  timeout = QUERY_TIMEOUT_MS,
): Promise<string> {
  const { stdout } = await execFileAsync("npx", ["--yes", "gitnexus", ...args], {
    cwd,
    timeout,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, CI: "true" }, // never let the CLI prompt interactively
  });
  return stdout;
}

/** Recursive directory size in bytes (best-effort, for diagnostics only). */
function dirSizeBytes(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSizeBytes(p);
      else if (entry.isFile()) total += fs.statSync(p).size;
    }
  } catch {
    // diagnostics only — never throw
  }
  return total;
}

class LadybugService {
  /**
   * Run `gitnexus analyze` on an extracted repo and persist the resulting
   * `.gitnexus/` index. Returns the descriptor to store on the ContextFile,
   * or null when disabled/failed (callers treat this as best-effort).
   */
  public async generateLadybug(opts: {
    repoDir: string;
    userId: string;
    contextId: string;
    fileId: string;
    repoName: string;
  }): Promise<LadybugDescriptor | null> {
    if (isDisabled()) {
      logger.info("[Ladybug] LADYBUG_DISABLED=true — skipping per-repo analysis");
      return null;
    }
    const { repoDir, userId, contextId, fileId, repoName } = opts;
    const t0 = Date.now();
    try {
      // GitHub tarballs carry no .git, and gitnexus refuses to analyze outside
      // a git repository — create a throwaway one.
      if (!fs.existsSync(path.join(repoDir, ".git"))) {
        await execFileAsync("git", ["init", "-q"], { cwd: repoDir });
        await execFileAsync("git", ["add", "-A"], { cwd: repoDir, maxBuffer: MAX_BUFFER });
        await execFileAsync(
          "git",
          [
            "-c",
            "user.email=sync@plan-ai",
            "-c",
            "user.name=plan-ai-sync",
            "commit",
            "-q",
            "-m",
            "sync",
            "--no-verify",
          ],
          { cwd: repoDir, maxBuffer: MAX_BUFFER },
        );
      }

      logger.info(
        `[Ladybug] 🐞 Running gitnexus analyze for ${repoName} (timeout=${ANALYZE_TIMEOUT_MS / 1000}s)...`,
      );
      const tAnalyze = Date.now();
      await runGitnexus(["analyze", "."], repoDir, ANALYZE_TIMEOUT_MS);

      const indexDir = path.join(repoDir, ".gitnexus");
      if (!fs.existsSync(indexDir)) {
        logger.error(
          `[Ladybug] analyze finished but ${indexDir} does not exist — skipping persist`,
        );
        return null;
      }
      const indexKb = Math.round(dirSizeBytes(indexDir) / 1024);
      logger.info(
        `[Ladybug] ✓ analyze done for ${repoName} in ${Date.now() - tAnalyze}ms | indexSize=${indexKb}KB`,
      );

      const tPersist = Date.now();
      const descriptor = await this.persist(indexDir, { userId, contextId, fileId });
      logger.info(
        `[Ladybug] ✅ Index for ${repoName} persisted (${descriptor.store}:${descriptor.key}) | persist=${Date.now() - tPersist}ms | total=${Date.now() - t0}ms`,
      );
      return descriptor;
    } catch (err) {
      logger.error(
        `[Ladybug] ⚠️ Failed to generate index for ${repoName} after ${Date.now() - t0}ms — continuing without it`,
        err,
      );
      return null;
    }
  }

  private async persist(
    indexDir: string,
    ids: { userId: string; contextId: string; fileId: string },
  ): Promise<LadybugDescriptor> {
    const dataDir = fsDataDir();
    const analyzedAt = new Date().toISOString();

    if (dataDir) {
      // Local / self-hosted: persistent disk, just copy the directory.
      const dest = path.join(dataDir, "gitnexus", ids.contextId, ids.fileId);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(indexDir, path.join(dest, ".gitnexus"), { recursive: true });
      return { store: "fs", key: dest, analyzedAt };
    }

    // Cloud (ephemeral fs): tar.gz → Firebase Storage, same scheme as repomix XML.
    const tarPath = path.join(os.tmpdir(), `ladybug-${ids.fileId}.tar.gz`);
    try {
      await tar.c({ gzip: true, file: tarPath, cwd: path.dirname(indexDir) }, [".gitnexus"]);
      const { storagePath } = await uploadContextFileToFirebaseStorage(
        fs.readFileSync(tarPath),
        ids.userId,
        ids.contextId,
        `ladybug-${ids.fileId}.tar.gz`,
        "application/gzip",
      );
      return { store: "firebase", key: storagePath, analyzedAt };
    } finally {
      fs.rmSync(tarPath, { force: true });
    }
  }

  /**
   * Restore the ladybug of a GITHUB_SYNC ContextFile to a queryable working
   * directory. Returns null when there is no usable ladybug.
   *
   * `repoName` MUST be passed as `-r` on every subsequent CLI call: the
   * gitnexus registry can hold several repos in one container (each restore
   * registers one), and the CLI refuses cwd-based resolution with multiple
   * candidates ("Multiple repositories indexed…" — seen in prod 2026-06-11).
   */
  private async restoreToWorkdir(
    githubFileId: string,
  ): Promise<{ workDir: string; repoName: string; cleanup: () => void } | null> {
    if (isDisabled()) return null;

    const file = await prisma.contextFile.findUnique({
      where: { id: githubFileId },
      select: { metadata: true },
    });
    const meta = (file?.metadata ?? {}) as Record<string, unknown>;
    const descriptor = meta.ladybug as LadybugDescriptor | undefined;
    if (!descriptor?.store || !descriptor.key) return null;

    try {
      const tRestore = Date.now();
      let workDir: string;
      let cleanup: () => void = () => {};

      if (descriptor.store === "fs") {
        workDir = descriptor.key;
        if (!fs.existsSync(path.join(workDir, ".gitnexus"))) {
          logger.error(`[Ladybug] fs store dir missing for file ${githubFileId}: ${workDir}`);
          return null;
        }
      } else {
        const buf = await getContextFileContentFromFirebaseStorage(descriptor.key);
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ladybug-"));
        const tarPath = path.join(workDir, "ladybug.tar.gz");
        fs.writeFileSync(tarPath, buf);
        await tar.x({ file: tarPath, cwd: workDir });
        fs.rmSync(tarPath, { force: true });
        cleanup = () => fs.rmSync(workDir, { recursive: true, force: true });
        logger.info(
          `[Ladybug] ⬇ Restored index for file ${githubFileId} (${Math.round(buf.length / 1024)}KB tar) in ${Date.now() - tRestore}ms`,
        );
      }

      // Register the restored index in the local registry. `--allow-non-git`
      // is REQUIRED: the restored dir only contains `.gitnexus/`, no `.git`
      // (prod failure 2026-06-11: "Not a git repository"). Registration is
      // fatal for the restore — without it every query fails with
      // "No indexed repositories found".
      const repoName = path.basename(workDir);
      try {
        await runGitnexus(["index", ".", "--allow-non-git"], workDir);
      } catch (e) {
        logger.error(
          `[Ladybug] gitnexus index registration failed for ${repoName} — aborting restore`,
          e,
        );
        cleanup();
        return null;
      }

      return { workDir, repoName, cleanup };
    } catch (err) {
      logger.error(`[Ladybug] Failed to restore index for file ${githubFileId}`, err);
      return null;
    }
  }

  /**
   * Restore the ladybug of the given GITHUB_SYNC ContextFile and return
   * AI-SDK tools (same names/shapes as mcpClientService.getAiTools, so the
   * investigation prompt is identical) backed by local gitnexus CLI calls.
   * Returns null when there is no usable ladybug. Always call `cleanup()`.
   */
  public async prepareQueryTools(
    githubFileId: string,
  ): Promise<{ tools: ReturnType<LadybugService["buildTools"]>; cleanup: () => void } | null> {
    const restored = await this.restoreToWorkdir(githubFileId);
    if (!restored) return null;
    return {
      tools: this.buildTools(restored.workDir, restored.repoName),
      cleanup: restored.cleanup,
    };
  }

  /**
   * Hybrid path: one-shot `gitnexus query` against the repo's ladybug,
   * returning the execution flows most related to the meeting. Used to
   * complement the repomix full-code prompt with call-graph structure
   * (which raw source in context doesn't surface explicitly). Best-effort:
   * any failure returns null and the repomix-only prompt proceeds unchanged.
   */
  public async getStructuralContext(
    githubFileId: string,
    query: string,
    goal?: string,
  ): Promise<string | null> {
    const q = query.trim();
    if (!q) return null;
    const restored = await this.restoreToWorkdir(githubFileId);
    if (!restored) return null;

    const tQuery = Date.now();
    try {
      const out = (
        await runGitnexus(
          [
            "query",
            q.slice(0, 300),
            "-r",
            restored.repoName,
            ...(goal ? ["--goal", goal] : []),
            "--limit",
            "5",
          ],
          restored.workDir,
        )
      ).trim();
      logger.info(
        `[Ladybug] 🧭 Structural context query → ${out.length} chars in ${Date.now() - tQuery}ms`,
      );
      if (!out) return null;
      return out.length > MAX_TOOL_OUTPUT_CHARS ? out.slice(0, MAX_TOOL_OUTPUT_CHARS) : out;
    } catch (err) {
      logger.error(`[Ladybug] Structural context query failed after ${Date.now() - tQuery}ms`, err);
      return null;
    } finally {
      restored.cleanup();
    }
  }

  /** Delete the persisted ladybug referenced by a ContextFile's metadata. */
  public async deleteLadybug(metadata: unknown): Promise<void> {
    const descriptor =
      metadata && typeof metadata === "object"
        ? ((metadata as Record<string, unknown>).ladybug as LadybugDescriptor | undefined)
        : undefined;
    if (!descriptor?.store || !descriptor.key) return;

    try {
      if (descriptor.store === "fs") {
        fs.rmSync(descriptor.key, { recursive: true, force: true });
      } else {
        await deleteContextFileFromFirebaseStorage(descriptor.key);
      }
      logger.info(`[Ladybug] 🧹 Deleted index (${descriptor.store}:${descriptor.key})`);
    } catch (err) {
      logger.warn(`[Ladybug] Failed to delete index (${descriptor.store}:${descriptor.key})`, err);
    }
  }

  private buildTools(workDir: string, repoName: string) {
    const run = async (args: string[]): Promise<string> => {
      const tCall = Date.now();
      try {
        // Always target the restored repo explicitly — cwd resolution breaks
        // as soon as the container registry holds a second repo.
        const out = (await runGitnexus([...args, "-r", repoName], workDir)).trim();
        logger.info(
          `[Ladybug] 🔧 gitnexus ${args.join(" ").slice(0, 120)} → ${out.length} chars in ${Date.now() - tCall}ms`,
        );
        if (!out) return "No results found in the codebase graph.";
        return out.length > MAX_TOOL_OUTPUT_CHARS
          ? `${out.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n…[truncated]`
          : out;
      } catch (e) {
        logger.error(
          `[Ladybug] ❌ CLI call failed after ${Date.now() - tCall}ms: gitnexus ${args.join(" ").slice(0, 120)}`,
          e,
        );
        return "Error executing tool. Proceed with existing knowledge.";
      }
    };

    return {
      query_codebase: tool({
        description:
          "Search the codebase knowledge graph for execution flows related to a concept. Use this to understand how code works together.",
        inputSchema: z.object({
          query: z.string().describe("Natural language or keyword search query"),
          goal: z.string().optional().describe("What you want to find (e.g. 'auth logic')"),
        }),
        execute: ({ query, goal }) =>
          run(["query", query, ...(goal ? ["--goal", goal] : []), "--limit", "5"]),
      }),
      get_symbol_context: tool({
        description:
          "Get a 360-degree view of a single code symbol (Function, Class, Method), showing callers, callees, and file location.",
        inputSchema: z.object({
          name: z.string().describe("Symbol name (e.g., 'validateUser')"),
        }),
        execute: ({ name }) => run(["context", name]),
      }),
      get_impact_analysis: tool({
        description:
          "Analyze the blast radius of changing a code symbol. Returns all callers, affected execution flows, and risk level (LOW/MEDIUM/HIGH/CRITICAL).",
        inputSchema: z.object({
          target: z.string().describe("Symbol name to analyze (e.g. 'verifyToken', 'AuthService')"),
        }),
        execute: ({ target }) => run(["impact", target]),
      }),
    };
  }
}

export const ladybugService = new LadybugService();
