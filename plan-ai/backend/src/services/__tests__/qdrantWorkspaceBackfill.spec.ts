/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory Qdrant: points with a contextId and maybe a workspaceId. */
const state = vi.hoisted(() => ({
  exists: true,
  points: [] as Array<{ contextId: string; workspaceId?: string }>,
  contexts: [] as Array<{ id: string; workspaceId: string }>,
  indexes: [] as string[],
  writes: 0,
  /** When set, the next count waits on it. Lets a test look at a run half way. */
  gate: null as Promise<void> | null,
  failWrites: false,
}));

const matches = (p: { contextId: string; workspaceId?: string }, must: any[]) =>
  must.every((c) => {
    if (c.is_empty) return p.workspaceId === undefined;
    const value = (p as any)[c.key];
    return c.match.any ? c.match.any.includes(value) : value === c.match.value;
  });

vi.mock("../../vector/qdrantClient", () => ({
  getContextCollectionName: () => "context_files",
  qdrantClient: {
    getCollections: async () => ({
      collections: state.exists ? [{ name: "context_files" }] : [],
    }),
    count: async (_n: string, { filter }: any) => {
      if (state.gate) await state.gate;
      return { count: state.points.filter((p) => matches(p, filter.must)).length };
    },
    setPayload: async (_n: string, { payload, filter }: any) => {
      if (state.failWrites) throw new Error("qdrant is down");
      state.writes++;
      for (const p of state.points) if (matches(p, filter.must)) Object.assign(p, payload);
    },
    createPayloadIndex: async (_n: string, { field_name }: any) => {
      state.indexes.push(field_name);
    },
  },
}));
vi.mock("../../prisma/prismaClient", () => ({
  default: { context: { findMany: async () => state.contexts } },
}));

import {
  getQdrantWorkspaceBackfillStatus,
  resetQdrantWorkspaceBackfill,
  runQdrantWorkspaceBackfill,
  startQdrantWorkspaceBackfill,
} from "../qdrantWorkspaceBackfill";

beforeEach(() => {
  resetQdrantWorkspaceBackfill();
  state.exists = true;
  state.indexes = [];
  state.writes = 0;
  state.gate = null;
  state.failWrites = false;
  state.contexts = [
    { id: "c1", workspaceId: "w1" },
    { id: "c1b", workspaceId: "w1" },
    { id: "c2", workspaceId: "w2" },
  ];
  state.points = [
    { contextId: "c1" },
    { contextId: "c1b" },
    { contextId: "c2" },
    { contextId: "c2", workspaceId: "w2" },
    { contextId: "gone" },
  ];
});

describe("Qdrant workspace backfill", () => {
  it("starts idle and answers the status without touching Qdrant", () => {
    expect(getQdrantWorkspaceBackfillStatus()).toMatchObject({
      state: "idle",
      mode: null,
      totalPoints: null,
      missing: null,
    });
  });

  it("a check counts and changes nothing, not even an index", async () => {
    const r = await runQdrantWorkspaceBackfill(false);
    expect(r).toMatchObject({
      state: "done",
      mode: "check",
      collectionExists: true,
      totalPoints: 5,
      missing: 4,
      stamped: null,
      step: null,
    });
    expect(state.points.filter((p) => p.workspaceId).length).toBe(1);
    expect(state.indexes).toEqual([]);
    expect(state.writes).toBe(0);
  });

  it("stamps each point with the workspace of its context and leaves orphans alone", async () => {
    const r = await runQdrantWorkspaceBackfill(true);
    expect(r).toMatchObject({
      state: "done",
      mode: "apply",
      totalPoints: 5,
      stamped: 3,
      missing: 1,
      workspacesDone: 2,
      workspacesTotal: 2,
    });
    expect(state.points).toEqual([
      { contextId: "c1", workspaceId: "w1" },
      { contextId: "c1b", workspaceId: "w1" },
      { contextId: "c2", workspaceId: "w2" },
      { contextId: "c2", workspaceId: "w2" },
      { contextId: "gone" },
    ]);
    // The indexes come first, and there is one write per workspace, not per context.
    expect(state.indexes).toEqual(["contextId", "workspaceId"]);
    expect(state.writes).toBe(2);
  });

  it("stamps nothing the second time", async () => {
    await runQdrantWorkspaceBackfill(true);
    const before = JSON.stringify(state.points);
    // The orphan keeps `missing` at 1, so it looks again and finds nothing to do.
    const again = await runQdrantWorkspaceBackfill(true);
    expect(again).toMatchObject({ state: "done", stamped: 0, missing: 1 });
    expect(JSON.stringify(state.points)).toBe(before);
  });

  it("returns at once when started, and the status follows the run", async () => {
    let open: () => void = () => undefined;
    state.gate = new Promise<void>((r) => (open = r));
    const started = startQdrantWorkspaceBackfill(true);
    expect(started).toMatchObject({ state: "running", mode: "apply" });
    // A second press while it runs joins the same run.
    expect(startQdrantWorkspaceBackfill(true).startedAt).toBe(started.startedAt);
    await vi.waitFor(() =>
      expect(getQdrantWorkspaceBackfillStatus().step).toBe("Counting the points"),
    );
    open();
    state.gate = null;
    await vi.waitFor(() => expect(getQdrantWorkspaceBackfillStatus().state).toBe("done"));
    expect(getQdrantWorkspaceBackfillStatus()).toMatchObject({ stamped: 3, step: null });
  });

  it("reports a failure and can be run again", async () => {
    state.failWrites = true;
    const failed = await runQdrantWorkspaceBackfill(true);
    expect(failed).toMatchObject({ state: "failed", error: "qdrant is down", step: null });
    state.failWrites = false;
    expect(await runQdrantWorkspaceBackfill(true)).toMatchObject({ state: "done", stamped: 3 });
  });

  it("reports a missing collection instead of failing", async () => {
    state.exists = false;
    expect(await runQdrantWorkspaceBackfill(true)).toMatchObject({
      state: "done",
      collectionExists: false,
      totalPoints: 0,
      stamped: 0,
    });
  });
});
