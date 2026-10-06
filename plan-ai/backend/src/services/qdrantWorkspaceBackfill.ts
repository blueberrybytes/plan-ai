import prisma from "../prisma/prismaClient";
import { getContextCollectionName, qdrantClient } from "../vector/qdrantClient";

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
 * Run from the admin maintenance page, or with `yarn qdrant:backfill-workspace`.
 */

export interface QdrantWorkspaceBackfillResult {
  collection: string;
  /** False when the collection does not exist yet (nothing was ever indexed). */
  collectionExists: boolean;
  totalPoints: number;
  /** Points without `workspaceId` before this run. */
  missingBefore: number;
  /** Points stamped by this run, or that a run with `apply` would stamp. */
  stamped: number;
  contextsTouched: number;
  contextsTotal: number;
  /** Points without stamp whose context is gone from the database. */
  orphans: number;
  /** Points without `workspaceId` after this run. Equal to `missingBefore` on a dry run. */
  missingAfter: number;
  applied: boolean;
}

const UNSTAMPED = { is_empty: { key: "workspaceId" } };

const countPoints = async (name: string, must: object[]) =>
  (await qdrantClient.count(name, { filter: { must }, exact: true })).count;

// One run at a time per process. Two admins pressing the button would only
// repeat work, but there is no reason to let them.
let running: Promise<QdrantWorkspaceBackfillResult> | null = null;

async function run(apply: boolean): Promise<QdrantWorkspaceBackfillResult> {
  const name = getContextCollectionName();
  const { collections } = await qdrantClient.getCollections();
  const contextsTotal = await prisma.context.count();
  if (!collections.some((c) => c.name === name)) {
    return {
      collection: name,
      collectionExists: false,
      totalPoints: 0,
      missingBefore: 0,
      stamped: 0,
      contextsTouched: 0,
      contextsTotal,
      orphans: 0,
      missingAfter: 0,
      applied: apply,
    };
  }

  const totalPoints = await countPoints(name, []);
  const missingBefore = await countPoints(name, [UNSTAMPED]);
  let stamped = 0;
  let contextsTouched = 0;

  if (missingBefore > 0) {
    const contexts = await prisma.context.findMany({ select: { id: true, workspaceId: true } });
    for (const context of contexts) {
      const must = [{ key: "contextId", match: { value: context.id } }, UNSTAMPED];
      const pending = await countPoints(name, must);
      if (pending === 0) continue;
      contextsTouched++;
      stamped += pending;
      if (apply) {
        await qdrantClient.setPayload(name, {
          payload: { workspaceId: context.workspaceId },
          filter: { must },
          wait: true,
        });
      }
    }
  }

  if (apply) {
    // Every read filters on this field. Creating an index that exists is a no-op.
    await qdrantClient.createPayloadIndex(name, {
      field_name: "workspaceId",
      field_schema: "keyword",
      wait: true,
    });
  }

  return {
    collection: name,
    collectionExists: true,
    totalPoints,
    missingBefore,
    stamped,
    contextsTouched,
    contextsTotal,
    orphans: missingBefore - stamped,
    missingAfter: apply ? await countPoints(name, [UNSTAMPED]) : missingBefore,
    applied: apply,
  };
}

/** Counts what is missing. Changes nothing. */
export function checkQdrantWorkspaceBackfill(): Promise<QdrantWorkspaceBackfillResult> {
  return run(false);
}

/** Writes the stamp. A second call while one is running waits for the first. */
export function applyQdrantWorkspaceBackfill(): Promise<QdrantWorkspaceBackfillResult> {
  if (!running) {
    running = run(true).finally(() => {
      running = null;
    });
  }
  return running;
}
