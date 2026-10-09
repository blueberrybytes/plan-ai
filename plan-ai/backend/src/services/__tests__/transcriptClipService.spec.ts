import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIP_MAX_SECONDS,
  CLIP_URL_TTL_MS,
  ClipError,
  buildClipFfmpegArgs,
  clipStoragePath,
  createClip,
  planClip,
  type ClipDeps,
  type ClipMeeting,
  type ClipSourceInfo,
} from "../transcriptClipService";

const both: ClipSourceInfo = {
  hasMic: true,
  hasSys: true,
  audioDeleted: false,
  durationSeconds: 600,
  micSysOffsetSeconds: 0,
};

const statusOf = (run: () => unknown): number | null => {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof ClipError) return err.status;
    throw err;
  }
};

describe("planClip", () => {
  it("mixes both files by default", () => {
    expect(planClip({ startSeconds: 10, endSeconds: 25.5 }, both)).toEqual({
      channel: "mix",
      startSeconds: 10,
      endSeconds: 25.5,
      durationSeconds: 15.5,
      mic: { seekSeconds: 10, durationSeconds: 15.5, delaySeconds: 0 },
      sys: { seekSeconds: 10, durationSeconds: 15.5, delaySeconds: 0 },
    });
  });

  it("uses the one file a meeting has", () => {
    const micOnly = planClip({ startSeconds: 0, endSeconds: 5 }, { ...both, hasSys: false });
    expect(micOnly.channel).toBe("mic");
    expect(micOnly.sys).toBeUndefined();
    const sysOnly = planClip(
      { startSeconds: 0, endSeconds: 5, channel: "mix" },
      { ...both, hasMic: false, micSysOffsetSeconds: 4 },
    );
    expect(sysOnly.channel).toBe("sys");
    // With no microphone file the system file is the clock: no offset.
    expect(sysOnly.sys).toEqual({ seekSeconds: 0, durationSeconds: 5, delaySeconds: 0 });
  });

  it("cuts one channel when asked", () => {
    const plan = planClip({ startSeconds: 3, endSeconds: 9, channel: "mic" }, both);
    expect(plan.channel).toBe("mic");
    expect(plan.sys).toBeUndefined();
  });

  it("moves the system file by the offset", () => {
    const plan = planClip(
      { startSeconds: 10, endSeconds: 20, channel: "sys" },
      { ...both, micSysOffsetSeconds: 2.5 },
    );
    expect(plan.sys).toEqual({ seekSeconds: 7.5, durationSeconds: 10, delaySeconds: 0 });
  });

  it("starts the system file late when the clip begins before it", () => {
    const plan = planClip({ startSeconds: 1, endSeconds: 6 }, { ...both, micSysOffsetSeconds: 3 });
    expect(plan.mic).toEqual({ seekSeconds: 1, durationSeconds: 5, delaySeconds: 0 });
    expect(plan.sys).toEqual({ seekSeconds: 0, durationSeconds: 3, delaySeconds: 2 });
  });

  it("leaves the system file out when it had not started yet", () => {
    const source = { ...both, micSysOffsetSeconds: 30 };
    const plan = planClip({ startSeconds: 1, endSeconds: 6 }, source);
    expect(plan.channel).toBe("mic");
    expect(plan.sys).toBeUndefined();
    expect(
      statusOf(() => planClip({ startSeconds: 1, endSeconds: 6, channel: "sys" }, source)),
    ).toBe(400);
  });

  it("refuses when the audio was deleted or never existed", () => {
    const request = { startSeconds: 0, endSeconds: 5 };
    expect(statusOf(() => planClip(request, { ...both, audioDeleted: true }))).toBe(409);
    expect(statusOf(() => planClip(request, { ...both, hasMic: false, hasSys: false }))).toBe(409);
  });

  it("refuses a clip shorter than 1 s or longer than 300 s", () => {
    expect(statusOf(() => planClip({ startSeconds: 5, endSeconds: 5.5 }, both))).toBe(400);
    expect(statusOf(() => planClip({ startSeconds: 0, endSeconds: 300.5 }, both))).toBe(400);
    expect(statusOf(() => planClip({ startSeconds: 0, endSeconds: 1 }, both))).toBeNull();
    expect(
      statusOf(() => planClip({ startSeconds: 0, endSeconds: CLIP_MAX_SECONDS }, both)),
    ).toBeNull();
  });

  it("refuses times that are not inside the recording", () => {
    expect(statusOf(() => planClip({ startSeconds: -1, endSeconds: 5 }, both))).toBe(400);
    expect(statusOf(() => planClip({ startSeconds: 9, endSeconds: 4 }, both))).toBe(400);
    expect(statusOf(() => planClip({ startSeconds: Number.NaN, endSeconds: 4 }, both))).toBe(400);
    expect(statusOf(() => planClip({ startSeconds: 590, endSeconds: 605 }, both))).toBe(400);
    // The stored duration is a whole number: one second of slack.
    expect(statusOf(() => planClip({ startSeconds: 590, endSeconds: 600.8 }, both))).toBeNull();
  });

  it("checks only the length when the duration is unknown", () => {
    const plan = planClip(
      { startSeconds: 5000, endSeconds: 5010 },
      { ...both, durationSeconds: null },
    );
    expect(plan.durationSeconds).toBe(10);
  });

  it("refuses a channel the meeting does not have", () => {
    const request = { startSeconds: 0, endSeconds: 5 };
    expect(
      statusOf(() => planClip({ ...request, channel: "sys" }, { ...both, hasSys: false })),
    ).toBe(400);
    expect(
      statusOf(() => planClip({ ...request, channel: "mic" }, { ...both, hasMic: false })),
    ).toBe(400);
    expect(
      statusOf(() => planClip({ ...request, channel: "left" as unknown as "mic" }, both)),
    ).toBe(400);
  });
});

describe("buildClipFfmpegArgs", () => {
  const tail = ["-vn", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k"];

  it("cuts one file into a mono mp3 on stdout", () => {
    const plan = planClip({ startSeconds: 12, endSeconds: 20, channel: "mic" }, both);
    const args = buildClipFfmpegArgs(plan, { mic: "/tmp/x/mic" });
    expect(args.join(" ")).toContain("-ss 12 -t 8 -i /tmp/x/mic");
    expect(args).toEqual(expect.arrayContaining(tail));
    expect(args.slice(-5)).toEqual(["-t", "8", "-f", "mp3", "pipe:1"]);
    expect(args).not.toContain("-filter_complex");
    expect(args).not.toContain("-af");
  });

  it("opens every input as a local audio file only", () => {
    const plan = planClip({ startSeconds: 0, endSeconds: 5 }, both);
    const args = buildClipFfmpegArgs(plan, { mic: "/tmp/x/mic", sys: "/tmp/x/sys" });
    const inputs = args.reduce<number[]>((at, arg, i) => (arg === "-i" ? [...at, i] : at), []);
    expect(inputs).toHaveLength(2);
    expect(args.filter((arg) => arg === "-protocol_whitelist")).toHaveLength(2);
    expect(args.filter((arg) => arg === "-format_whitelist")).toHaveLength(2);
    for (const i of inputs) expect(args.lastIndexOf("-protocol_whitelist", i)).toBeGreaterThan(-1);
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
  });

  it("mixes two files", () => {
    const plan = planClip({ startSeconds: 0, endSeconds: 5 }, both);
    const args = buildClipFfmpegArgs(plan, { mic: "/tmp/x/mic", sys: "/tmp/x/sys" });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toBe(
      "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[out]",
    );
    expect(args[args.indexOf("-map") + 1]).toBe("[out]");
  });

  it("delays the system file when it starts after the clip", () => {
    const plan = planClip({ startSeconds: 1, endSeconds: 6 }, { ...both, micSysOffsetSeconds: 3 });
    const args = buildClipFfmpegArgs(plan, { mic: "/tmp/x/mic", sys: "/tmp/x/sys" });
    expect(args.join(" ")).toContain("-ss 0 -t 3 -i /tmp/x/sys");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[1:a]adelay=2000:all=1[late];[0:a][late]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[out]",
    );
  });

  it("delays a single system file with a plain filter", () => {
    const plan = planClip(
      { startSeconds: 1, endSeconds: 6, channel: "sys" },
      { ...both, micSysOffsetSeconds: 3 },
    );
    const args = buildClipFfmpegArgs(plan, { sys: "/tmp/x/sys" });
    expect(args[args.indexOf("-af") + 1]).toBe("adelay=2000:all=1");
  });

  it("fails without a file", () => {
    const plan = planClip({ startSeconds: 0, endSeconds: 5, channel: "mic" }, both);
    expect(() => buildClipFfmpegArgs(plan, {})).toThrow();
  });
});

describe("createClip", () => {
  const meeting: ClipMeeting = {
    id: "t1",
    workspaceId: "w1",
    rawMicUrl: "gs://bucket-x/recordings/u1/mic.webm",
    rawSysUrl: "https://storage.googleapis.com/bucket-x/recordings/u1/sys.m4a",
    durationSeconds: 120,
    metadata: { micSysOffsetMs: 500 },
  };
  const NOW = Date.UTC(2026, 9, 9, 12);
  let deps: ClipDeps & { [K in keyof ClipDeps]: ReturnType<typeof vi.fn> };
  let workDir = "";

  beforeEach(() => {
    vi.stubEnv("FIREBASE_STORAGE_BUCKET", "bucket-x");
    workDir = "";
    deps = {
      download: vi.fn(async (_path: string, destination: string) => {
        workDir = destination.slice(0, destination.lastIndexOf("/"));
      }),
      runFfmpeg: vi.fn(async () => Buffer.alloc(20_000, 1)),
      upload: vi.fn(async (path: string) => `gs://bucket-x/${path}`),
      signedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
      now: vi.fn(() => NOW),
      newId: vi.fn(() => "clip-id"),
    };
  });
  afterEach(() => vi.unstubAllEnvs());

  it("cuts, saves the clip under its own private path and signs it for 7 days", async () => {
    const clip = await createClip(meeting, { startSeconds: 10, endSeconds: 20 }, deps);

    expect(deps.download).toHaveBeenCalledTimes(2);
    expect(deps.download.mock.calls.map(([path]) => path).sort()).toEqual([
      "recordings/u1/mic.webm",
      "recordings/u1/sys.m4a",
    ]);
    const args = deps.runFfmpeg.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("-ss 9.5 -t 10 -i");

    const path = clipStoragePath("w1", "t1", "clip-id");
    expect(path).toBe("clips/w1/t1/clip-id.mp3");
    expect(deps.upload).toHaveBeenCalledWith(path, expect.any(Buffer), "audio/mpeg");
    expect(deps.signedUrl).toHaveBeenCalledWith(path, CLIP_URL_TTL_MS);
    expect(CLIP_URL_TTL_MS).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(CLIP_URL_TTL_MS).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(clip).toEqual({
      url: `https://signed.example/${path}`,
      expiresAt: new Date(NOW + CLIP_URL_TTL_MS).toISOString(),
      startSeconds: 10,
      endSeconds: 20,
      channel: "mix",
    });
  });

  it("removes its temporary files, also when ffmpeg fails", async () => {
    await createClip(meeting, { startSeconds: 0, endSeconds: 5 }, deps);
    expect(workDir).not.toBe("");
    expect(existsSync(workDir)).toBe(false);

    deps.runFfmpeg.mockRejectedValueOnce(new Error("ffmpeg exited 1"));
    await expect(createClip(meeting, { startSeconds: 0, endSeconds: 5 }, deps)).rejects.toThrow(
      "ffmpeg exited 1",
    );
    expect(existsSync(workDir)).toBe(false);
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it("refuses before reading anything when the audio was deleted", async () => {
    const deleted = {
      ...meeting,
      rawMicUrl: null,
      rawSysUrl: null,
      metadata: { audioDeletedAt: "2026-10-01T00:00:00.000Z" },
    };
    await expect(
      createClip(deleted, { startSeconds: 0, endSeconds: 5 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.runFfmpeg).not.toHaveBeenCalled();
  });

  it("does not read a file outside our bucket", async () => {
    const foreign = { ...meeting, rawMicUrl: "https://evil.example/a.webm", rawSysUrl: null };
    await expect(
      createClip(foreign, { startSeconds: 0, endSeconds: 5 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("refuses a bad range before running ffmpeg", async () => {
    await expect(
      createClip(meeting, { startSeconds: 0, endSeconds: 900 }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.runFfmpeg).not.toHaveBeenCalled();
  });

  it("saves nothing when ffmpeg returns no audio", async () => {
    deps.runFfmpeg.mockResolvedValueOnce(Buffer.alloc(10));
    await expect(
      createClip(meeting, { startSeconds: 0, endSeconds: 5 }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.upload).not.toHaveBeenCalled();
  });
});
