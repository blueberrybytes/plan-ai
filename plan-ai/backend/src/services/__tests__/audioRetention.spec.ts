import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Retention deletes customer audio, so the rule must be exact: only meetings
 * older than the workspace's limit, never one still being processed, never one
 * whose audio is the only copy, and the transcript row is kept with a note of
 * when and why.
 */

const db = vi.hoisted(() => ({
  workspaces: [] as { id: string; audioRetentionDays: number | null }[],
  transcripts: [] as {
    id: string;
    workspaceId: string;
    createdAt: Date;
    rawMicUrl: string | null;
    rawSysUrl: string | null;
    metadata: Record<string, unknown>;
    transcript?: string | null;
    utterances?: unknown;
  }[],
  deleted: [] as string[],
}));

vi.mock("../../prisma/prismaClient", () => ({
  default: {
    workspace: {
      findMany: async () => db.workspaces.filter((w) => w.audioRetentionDays !== null),
    },
    transcript: {
      findMany: async ({ where }: { where: { workspaceId: string; createdAt: { lt: Date } } }) =>
        db.transcripts.filter(
          (t) =>
            t.workspaceId === where.workspaceId &&
            t.createdAt < where.createdAt.lt &&
            (t.rawMicUrl || t.rawSysUrl),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.transcripts.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.transcripts.find((t) => t.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

vi.mock("../../firebase/privateStorage", () => ({
  deleteStoredObject: async (ref: string) => {
    db.deleted.push(ref);
    return true;
  },
}));

import {
  applyAudioRetention,
  AudioInUseError,
  deleteTranscriptAudio,
} from "../audioRetentionService";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-27T12:00:00Z");

beforeEach(() => {
  db.deleted = [];
  db.workspaces = [
    { id: "w30", audioRetentionDays: 30 },
    { id: "wForever", audioRetentionDays: null },
  ];
  db.transcripts = [
    {
      id: "old",
      workspaceId: "w30",
      createdAt: new Date(now.getTime() - 40 * DAY),
      rawMicUrl: "gs://b/old-mic",
      rawSysUrl: "gs://b/old-sys",
      metadata: { processingStatus: "COMPLETED" },
      transcript: "User: hello",
    },
    {
      id: "recent",
      workspaceId: "w30",
      createdAt: new Date(now.getTime() - 5 * DAY),
      rawMicUrl: "gs://b/recent",
      rawSysUrl: null,
      metadata: {},
    },
    {
      id: "busy",
      workspaceId: "w30",
      createdAt: new Date(now.getTime() - 40 * DAY),
      rawMicUrl: "gs://b/busy",
      rawSysUrl: null,
      metadata: { processingStatus: "PENDING" },
      transcript: "User: hi",
    },
    {
      id: "tasks",
      workspaceId: "w30",
      createdAt: new Date(now.getTime() - 40 * DAY),
      rawMicUrl: "gs://b/tasks",
      rawSysUrl: null,
      metadata: { processingStatus: "EXTRACTING_TASKS" },
      transcript: "User: hi",
    },
    // Phone recording whose transcription failed: the audio is all there is.
    {
      id: "untranscribed",
      workspaceId: "w30",
      createdAt: new Date(now.getTime() - 40 * DAY),
      rawMicUrl: "gs://b/untranscribed",
      rawSysUrl: null,
      metadata: { processingStatus: "FAILED" },
      transcript: "Processing...",
    },
    {
      id: "keep",
      workspaceId: "wForever",
      createdAt: new Date(now.getTime() - 400 * DAY),
      rawMicUrl: "gs://b/keep",
      rawSysUrl: null,
      metadata: {},
    },
  ];
});

describe("audio retention", () => {
  it("deletes only old, finished meetings of workspaces with a rule", async () => {
    const count = await applyAudioRetention(now);
    expect(count).toBe(1);
    expect(db.deleted.sort()).toEqual(["gs://b/old-mic", "gs://b/old-sys"]);
    const old = db.transcripts.find((t) => t.id === "old")!;
    expect(old.rawMicUrl).toBeNull();
    expect(old.rawSysUrl).toBeNull();
    expect(old.metadata.audioDeletedReason).toBe("retention");
    expect(old.metadata.processingStatus).toBe("COMPLETED");
    for (const id of ["recent", "busy", "tasks", "untranscribed", "keep"]) {
      expect(db.transcripts.find((t) => t.id === id)!.rawMicUrl).not.toBeNull();
    }
  });

  it("leaves the audio alone when a reprocess started after the caller read the row", async () => {
    // The caller's copy says COMPLETED; the row says PROCESSING now.
    const stale = { ...db.transcripts.find((t) => t.id === "old")! };
    db.transcripts.find((t) => t.id === "old")!.metadata = { processingStatus: "PROCESSING" };
    await expect(deleteTranscriptAudio(stale, "retention")).rejects.toBeInstanceOf(AudioInUseError);
    expect(db.deleted).toEqual([]);
  });

  it("does nothing for a meeting without audio", async () => {
    const done = await deleteTranscriptAudio(
      { id: "x", rawMicUrl: null, rawSysUrl: null, metadata: {} },
      "user",
    );
    expect(done).toBe(false);
    expect(db.deleted).toEqual([]);
  });
});
