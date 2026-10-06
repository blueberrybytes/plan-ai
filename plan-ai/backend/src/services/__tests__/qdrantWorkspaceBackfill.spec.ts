/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory Qdrant: points with a contextId and maybe a workspaceId. */
const state = vi.hoisted(() => ({
  exists: true,
  points: [] as Array<{ contextId: string; workspaceId?: string }>,
  contexts: [] as Array<{ id: string; workspaceId: string }>,
  indexCreated: 0,
}));

const matches = (p: { contextId: string; workspaceId?: string }, must: any[]) =>
  must.every((c) =>
    c.is_empty ? p.workspaceId === undefined : (p as any)[c.key] === c.match.value,
  );

vi.mock("../../vector/qdrantClient", () => ({
  getContextCollectionName: () => "context_files",
  qdrantClient: {
    getCollections: async () => ({
      collections: state.exists ? [{ name: "context_files" }] : [],
    }),
    count: async (_n: string, { filter }: any) => ({
      count: state.points.filter((p) => matches(p, filter.must)).length,
    }),
    setPayload: async (_n: string, { payload, filter }: any) => {
      for (const p of state.points) if (matches(p, filter.must)) Object.assign(p, payload);
    },
    createPayloadIndex: async () => {
      state.indexCreated++;
    },
  },
}));
vi.mock("../../prisma/prismaClient", () => ({
  default: {
    context: { count: async () => state.contexts.length, findMany: async () => state.contexts },
  },
}));

import {
  applyQdrantWorkspaceBackfill,
  checkQdrantWorkspaceBackfill,
} from "../qdrantWorkspaceBackfill";

beforeEach(() => {
  state.exists = true;
  state.indexCreated = 0;
  state.contexts = [
    { id: "c1", workspaceId: "w1" },
    { id: "c2", workspaceId: "w2" },
  ];
  state.points = [
    { contextId: "c1" },
    { contextId: "c1" },
    { contextId: "c2" },
    { contextId: "c2", workspaceId: "w2" },
    { contextId: "gone" },
  ];
});

describe("Qdrant workspace backfill", () => {
  it("counts without changing anything", async () => {
    const r = await checkQdrantWorkspaceBackfill();
    expect(r).toMatchObject({
      totalPoints: 5,
      missingBefore: 4,
      stamped: 3,
      contextsTouched: 2,
      orphans: 1,
      missingAfter: 4,
      applied: false,
    });
    expect(state.points.filter((p) => p.workspaceId).length).toBe(1);
    expect(state.indexCreated).toBe(0);
  });

  it("stamps each point with the workspace of its context and leaves orphans alone", async () => {
    const r = await applyQdrantWorkspaceBackfill();
    expect(r).toMatchObject({ stamped: 3, orphans: 1, missingAfter: 1, applied: true });
    expect(state.points).toEqual([
      { contextId: "c1", workspaceId: "w1" },
      { contextId: "c1", workspaceId: "w1" },
      { contextId: "c2", workspaceId: "w2" },
      { contextId: "c2", workspaceId: "w2" },
      { contextId: "gone" },
    ]);
    expect(state.indexCreated).toBe(1);
  });

  it("does nothing the second time", async () => {
    await applyQdrantWorkspaceBackfill();
    const again = await applyQdrantWorkspaceBackfill();
    expect(again).toMatchObject({ stamped: 0, contextsTouched: 0, missingAfter: 1 });
  });

  it("shares one run between two callers", async () => {
    const [a, b] = await Promise.all([
      applyQdrantWorkspaceBackfill(),
      applyQdrantWorkspaceBackfill(),
    ]);
    expect(a).toBe(b);
  });

  it("reports a missing collection instead of failing", async () => {
    state.exists = false;
    const r = await applyQdrantWorkspaceBackfill();
    expect(r).toMatchObject({ collectionExists: false, totalPoints: 0, stamped: 0 });
  });
});
