import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A recording sent in slices must come out byte for byte in order, however
 * many slices there are. GCS composes at most 32 objects per call, so long
 * meetings go through intermediate objects; this checks the order survives
 * that and that no intermediate object is left behind.
 */

const store = vi.hoisted(() => new Map<string, Buffer>());
const created = vi.hoisted(() => new Map<string, number>());
const calls = vi.hoisted(() => ({ combine: [] as { sources: string[]; destination: string }[] }));

vi.mock("../firebaseAdmin", () => ({
  firebaseAdmin: {
    storage: () => ({
      bucket: () => ({
        file: (path: string) => ({
          save: async (data: Buffer) => {
            store.set(path, Buffer.from(data));
            created.set(path, Date.now());
          },
          setMetadata: async () => undefined,
          delete: async () => {
            store.delete(path);
          },
        }),
        combine: async (sources: string[], destination: string) => {
          if (sources.length > 32) throw new Error("GCS allows at most 32 sources");
          calls.combine.push({ sources, destination });
          store.set(destination, Buffer.concat(sources.map((s) => store.get(s)!)));
        },
        getFiles: async ({ prefix }: { prefix: string }) => [
          [...store.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((name) => ({
              name,
              metadata: { timeCreated: new Date(created.get(name) ?? Date.now()).toISOString() },
              delete: async () => {
                store.delete(name);
              },
            })),
        ],
        deleteFiles: async ({ prefix }: { prefix: string }) => {
          for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
        },
      }),
    }),
  },
}));

import {
  composePaths,
  deleteOlderThan,
  deletePrefix,
  listPaths,
  recordingPartPath,
  recordingPartsPrefix,
  uploadPrivateFile,
} from "../privateStorage";

beforeEach(() => {
  process.env.FIREBASE_STORAGE_BUCKET = "plan-ai.appspot.com";
  store.clear();
  created.clear();
  calls.combine = [];
});
afterEach(() => {
  delete process.env.FIREBASE_STORAGE_BUCKET;
});

const savePartsOf = async (count: number) => {
  const expected: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const part = Buffer.from(`part-${i};`);
    expected.push(part);
    await uploadPrivateFile(
      recordingPartPath("u1", "m-abc12345", i),
      part,
      "application/octet-stream",
    );
  }
  return Buffer.concat(expected);
};

describe("recording parts", () => {
  it("keeps parts under the user's own prefix, sortable by index", () => {
    expect(recordingPartPath("u1", "m-abc12345", 7)).toBe(
      "recording-uploads/u1/m-abc12345/part-000007",
    );
    expect(
      recordingPartPath("u1", "m-abc12345", 7).startsWith(recordingPartsPrefix("u1", "m-abc12345")),
    ).toBe(true);
  });

  it("joins a few parts in one call", async () => {
    const expected = await savePartsOf(5);
    const parts = Array.from({ length: 5 }, (_, i) => recordingPartPath("u1", "m-abc12345", i));
    const uri = await composePaths(parts, "transcripts/u1/final-mic.wav", "audio/wav");
    expect(uri).toBe("gs://plan-ai.appspot.com/transcripts/u1/final-mic.wav");
    expect(store.get("transcripts/u1/final-mic.wav")).toEqual(expected);
    expect(calls.combine).toHaveLength(1);
  });

  it("joins more than 32 parts in order through rounds, and cleans up", async () => {
    const count = 1100; // two rounds of intermediates: 1100 → 35 → 2 → 1
    const expected = await savePartsOf(count);
    const parts = Array.from({ length: count }, (_, i) => recordingPartPath("u1", "m-abc12345", i));
    await composePaths(parts, "transcripts/u1/long-mic.wav", "audio/wav");
    expect(store.get("transcripts/u1/long-mic.wav")).toEqual(expected);
    expect(calls.combine.every((c) => c.sources.length <= 32)).toBe(true);
    const leftovers = [...store.keys()].filter((k) => k.startsWith("transcripts/u1/long-mic.wav."));
    expect(leftovers).toEqual([]);
  });

  it("lists and deletes one upload's parts only", async () => {
    await savePartsOf(3);
    await uploadPrivateFile(recordingPartPath("u1", "m-other999", 0), Buffer.from("x"), "x");
    const listed = await listPaths(recordingPartsPrefix("u1", "m-abc12345"));
    expect(listed).toHaveLength(3);
    await deletePrefix(recordingPartsPrefix("u1", "m-abc12345"));
    expect(await listPaths(recordingPartsPrefix("u1", "m-abc12345"))).toEqual([]);
    expect(await listPaths(recordingPartsPrefix("u1", "m-other999"))).toHaveLength(1);
  });

  it("cleans up only slices older than the limit", async () => {
    await savePartsOf(2);
    const oldPath = recordingPartPath("u2", "m-abandoned1", 0);
    await uploadPrivateFile(oldPath, Buffer.from("old"), "x");
    created.set(oldPath, Date.now() - 8 * 24 * 60 * 60 * 1000);
    const removed = await deleteOlderThan("recording-uploads/", 7 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(store.has(oldPath)).toBe(false);
    expect(await listPaths(recordingPartsPrefix("u1", "m-abc12345"))).toHaveLength(2);
  });
});
