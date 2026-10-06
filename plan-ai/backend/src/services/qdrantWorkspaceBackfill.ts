import prisma from "../prisma/prismaClient";
import { getContextCollectionName, qdrantClient } from "../vector/qdrantClient";
import { logger } from "../utils/logger";

/**
 * Stamps every Qdrant point with the workspace that owns it.
 *
 * All workspaces share one collection. Points written since October 2026
 * carry `workspaceId`, and reads refuse a point stamped with another
 * workspace. Older points have no stamp. This adds it, taking the workspace
 * from the point's Context row.
 *
 * Safe to run more than once and while the backend is serving: it only adds a
 * payload field, and reads accept points with or without it.
 *
 * Points whose context no longer exists in the database are counted and left
 * alone. No read can reach them, because every read starts from a Context row.
 *
 * It runs in the background. On a real collection each step takes from
 * seconds to minutes, longer than a browser waits for one request (the first
 * version did the work inside the request and the page never got an answer).
 * The admin page starts it and then asks for the status every few seconds.
 */

export interface QdrantWorkspaceBackfillStatus {
  state: "idle" | "running" | "done" | "failed";
  /** What the last run was: a count, or the count and the stamping. */
  mode: "check" | "apply" | null;
  /** What it is doing right now, in plain words. Null when not running. */
  step: string | null;
  workspacesDone: number;
  workspacesTotal: number;
  collection: string;
  /** Null until a run has looked. */
  collectionExists: boolean | null;
  totalPoints: number | null;
  /** Points without `workspaceId`, as of the last count. */
  missing: number | null;
  /** Points stamped by the last `apply` run. */
  stamped: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const UNSTAMPED = { is_empty: { key: "workspaceId" } };
/** Context ids per request. Keeps the filter small enough for any collection. */
const CONTEXTS_PER_CALL = 200;

const fresh = (): QdrantWorkspaceBackfillStatus => ({
  state: "idle",
  mode: null,
  step: null,
  workspacesDone: 0,
  workspacesTotal: 0,
  collection: getContextCollectionName(),
  collectionExists: null,
  totalPoints: null,
  missing: null,
  stamped: null,
  startedAt: null,
  finishedAt: null,
  error: null,
});

// One run at a time per process. The status lives in memory: after a restart
// it starts empty, and running again is harmless.
let status: QdrantWorkspaceBackfillStatus = fresh();
let running: Promise<QdrantWorkspaceBackfillStatus> | null = null;

const countPoints = async (name: string, must: object[]) =>
  (await qdrantClient.count(name, { filter: { must }, exact: true })).count;

/** Keyword index on a payload field. Qdrant treats an existing one as done. */
const ensureIndex = (name: string, field: string) =>
  qdrantClient.createPayloadIndex(name, { field_name: field, field_schema: "keyword", wait: true });

async function work(apply: boolean): Promise<void> {
  const name = status.collection;
  status.step = "Looking for the collection";
  const { collections } = await qdrantClient.getCollections();
  status.collectionExists = collections.some((c) => c.name === name);
  if (!status.collectionExists) {
    status.totalPoints = 0;
    status.missing = 0;
    status.stamped = apply ? 0 : null;
    return;
  }

  if (apply) {
    // With these two indexes every filter below is a lookup. Without them
    // each one reads the whole collection.
    status.step = "Creating the indexes";
    await ensureIndex(name, "contextId");
    await ensureIndex(name, "workspaceId");
  }

  status.step = "Counting the points";
  status.totalPoints = await countPoints(name, []);
  const missingBefore = await countPoints(name, [UNSTAMPED]);
  status.missing = missingBefore;
  if (!apply) return;

  if (missingBefore > 0) {
    const contexts = await prisma.context.findMany({ select: { id: true, workspaceId: true } });
    const byWorkspace = new Map<string, string[]>();
    for (const c of contexts) {
      const list = byWorkspace.get(c.workspaceId);
      if (list) list.push(c.id);
      else byWorkspace.set(c.workspaceId, [c.id]);
    }
    status.workspacesTotal = byWorkspace.size;
    status.step = "Stamping the points";
    // One write per workspace (per 200 of its contexts), not one per context.
    for (const [workspaceId, contextIds] of byWorkspace) {
      for (let i = 0; i < contextIds.length; i += CONTEXTS_PER_CALL) {
        await qdrantClient.setPayload(name, {
          payload: { workspaceId },
          filter: {
            must: [
              { key: "contextId", match: { any: contextIds.slice(i, i + CONTEXTS_PER_CALL) } },
              UNSTAMPED,
            ],
          },
          wait: true,
        });
      }
      status.workspacesDone += 1;
    }
    status.step = "Counting again";
    status.missing = await countPoints(name, [UNSTAMPED]);
  }
  status.stamped = missingBefore - (status.missing ?? 0);
}

/**
 * Runs a count (`apply` false) or the count and the stamping. Resolves when
 * it is over, with the final status. A call made while a run is going on
 * joins that run instead of starting another.
 */
export function runQdrantWorkspaceBackfill(apply: boolean): Promise<QdrantWorkspaceBackfillStatus> {
  if (running) return running;
  status = {
    ...fresh(),
    state: "running",
    mode: apply ? "apply" : "check",
    startedAt: new Date().toISOString(),
  };
  running = work(apply)
    .then(() => {
      status.state = "done";
    })
    .catch((err: unknown) => {
      status.state = "failed";
      status.error = (err as Error)?.message ?? String(err);
      logger.error("[QdrantBackfill] failed", err);
    })
    .then(() => {
      status.step = null;
      status.finishedAt = new Date().toISOString();
      running = null;
      return status;
    });
  return running;
}

/** Starts a run in the background and returns at once with the status. */
export function startQdrantWorkspaceBackfill(apply: boolean): QdrantWorkspaceBackfillStatus {
  void runQdrantWorkspaceBackfill(apply);
  return getQdrantWorkspaceBackfillStatus();
}

/** Where the last run is. Instant: it reads memory only. */
export function getQdrantWorkspaceBackfillStatus(): QdrantWorkspaceBackfillStatus {
  return { ...status };
}

/** For tests. */
export function resetQdrantWorkspaceBackfill(): void {
  status = fresh();
  running = null;
}
