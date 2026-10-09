import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  downloadPathToFile,
  objectPathOf,
  signedUrlForPath,
  uploadPrivateFile,
} from "../firebase/privateStorage";
import { SAFE_INPUT_OPTIONS, runFfmpegToBuffer } from "../utils/audioPcm";

/**
 * A short piece of a meeting's audio to share: cut with ffmpeg, saved as a
 * private object of its own, and handed out as a signed link that expires.
 *
 * Times are on the web player's clock. That is the microphone file's clock
 * when the meeting has one, otherwise the system audio file's. The system
 * audio file starts `micSysOffsetSeconds` later than the microphone file, so
 * its own position is the player's time minus that offset.
 *
 * Clips are never deleted by this code. They stay in the bucket under
 * `clips/` until someone removes them.
 */

export type ClipChannel = "mic" | "sys" | "mix";

export const CLIP_MIN_SECONDS = 1;
export const CLIP_MAX_SECONDS = 300;
/** `durationSeconds` is stored as a whole number, so the end may pass it by a little. */
const DURATION_TOLERANCE_SECONDS = 1;
/** V4 signed links last 7 days at most. A minute less leaves room for the clock. */
export const CLIP_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 1000;
export const CLIP_CONTENT_TYPE = "audio/mpeg";
/** A valid mp3 of one second at 64 kbit/s is about 8 kB. Less than this is no audio. */
const MIN_CLIP_BYTES = 1024;

export class ClipError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ClipRequest {
  startSeconds: number;
  endSeconds: number;
  channel?: ClipChannel;
}

export interface ClipSourceInfo {
  hasMic: boolean;
  hasSys: boolean;
  audioDeleted: boolean;
  /** Null when the meeting's length is not known. */
  durationSeconds: number | null;
  micSysOffsetSeconds: number;
}

/** What to read from one file. */
export interface ClipTrack {
  /** Where to start in the file. */
  seekSeconds: number;
  durationSeconds: number;
  /** Silence to put before it, when the file starts after the clip does. */
  delaySeconds: number;
}

export interface ClipPlan {
  channel: ClipChannel;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  mic?: ClipTrack;
  sys?: ClipTrack;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Checks the request against the recording and works out what to cut from each file. */
export function planClip(request: ClipRequest, source: ClipSourceInfo): ClipPlan {
  if (source.audioDeleted || (!source.hasMic && !source.hasSys)) {
    throw new ClipError(409, "This meeting has no audio, so there is nothing to cut.");
  }
  const { startSeconds: start, endSeconds: end } = request;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) {
    throw new ClipError(400, "The start and the end must be times inside the recording.");
  }
  if (end <= start) throw new ClipError(400, "The end must be after the start.");
  const length = end - start;
  if (length < CLIP_MIN_SECONDS || length > CLIP_MAX_SECONDS) {
    throw new ClipError(
      400,
      `A clip must be between ${CLIP_MIN_SECONDS} second and ${CLIP_MAX_SECONDS / 60} minutes long.`,
    );
  }
  if (
    source.durationSeconds !== null &&
    end > source.durationSeconds + DURATION_TOLERANCE_SECONDS
  ) {
    throw new ClipError(400, "The clip ends after the recording does.");
  }

  const requested = request.channel ?? "mix";
  if (requested !== "mic" && requested !== "sys" && requested !== "mix") {
    throw new ClipError(400, "Unknown audio channel.");
  }
  if (requested === "mic" && !source.hasMic) {
    throw new ClipError(400, "This meeting has no microphone audio.");
  }
  if (requested === "sys" && !source.hasSys) {
    throw new ClipError(400, "This meeting has no system audio.");
  }
  // "mix" on a meeting with one file is that file.
  const useMic = source.hasMic && requested !== "sys";
  const useSys = source.hasSys && requested !== "mic";

  const mic: ClipTrack | undefined = useMic
    ? { seekSeconds: round3(start), durationSeconds: round3(length), delaySeconds: 0 }
    : undefined;

  let sys: ClipTrack | undefined;
  if (useSys) {
    // The offset only applies when the microphone file is the clock.
    const offset = source.hasMic ? source.micSysOffsetSeconds : 0;
    const sysStart = start - offset;
    const sysEnd = end - offset;
    if (sysEnd > 0) {
      const seek = Math.max(0, sysStart);
      sys = {
        seekSeconds: round3(seek),
        durationSeconds: round3(sysEnd - seek),
        delaySeconds: round3(Math.max(0, -sysStart)),
      };
    }
  }
  if (!mic && !sys) {
    throw new ClipError(400, "The system audio had not started yet in that part of the meeting.");
  }

  const channel: ClipChannel = mic && sys ? "mix" : mic ? "mic" : "sys";
  return {
    channel,
    startSeconds: round3(start),
    endSeconds: round3(end),
    durationSeconds: round3(length),
    ...(mic ? { mic } : {}),
    ...(sys ? { sys } : {}),
  };
}

const delayFilter = (track: ClipTrack): string =>
  `adelay=${Math.round(track.delaySeconds * 1000)}:all=1`;

/**
 * The ffmpeg arguments that cut the plan from local files into a mono mp3 on
 * stdout. Inputs are opened with the same limits as every other upload.
 */
export function buildClipFfmpegArgs(
  plan: ClipPlan,
  files: { mic?: string; sys?: string },
): string[] {
  const tracks: { track: ClipTrack; file: string }[] = [];
  if (plan.mic && files.mic) tracks.push({ track: plan.mic, file: files.mic });
  if (plan.sys && files.sys) tracks.push({ track: plan.sys, file: files.sys });
  if (tracks.length === 0) throw new Error("No audio file for the clip");

  const args = ["-hide_banner", "-loglevel", "error"];
  for (const { track, file } of tracks) {
    args.push(
      ...SAFE_INPUT_OPTIONS,
      "-ss",
      String(track.seekSeconds),
      "-t",
      String(track.durationSeconds),
      "-i",
      file,
    );
  }

  if (tracks.length === 2) {
    const delayed = tracks[1].track.delaySeconds > 0;
    const second = delayed ? `[1:a]${delayFilter(tracks[1].track)}[late];` : "";
    // Without normalize=0 each voice would be played at half its volume.
    args.push(
      "-filter_complex",
      `${second}[0:a]${delayed ? "[late]" : "[1:a]"}amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[out]`,
      "-map",
      "[out]",
    );
  } else if (tracks[0].track.delaySeconds > 0) {
    args.push("-af", delayFilter(tracks[0].track));
  }

  args.push(
    "-vn",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-t",
    String(plan.durationSeconds),
    "-f",
    "mp3",
    "pipe:1",
  );
  return args;
}

export const clipStoragePath = (
  workspaceId: string,
  transcriptId: string,
  clipId: string,
): string => `clips/${workspaceId}/${transcriptId}/${clipId}.mp3`;

/** The outside world, so tests can run without a bucket or ffmpeg. */
export interface ClipDeps {
  download: (storagePath: string, destination: string) => Promise<void>;
  runFfmpeg: (args: string[]) => Promise<Buffer>;
  upload: (storagePath: string, data: Buffer, contentType: string) => Promise<string>;
  signedUrl: (storagePath: string, ttlMs: number) => Promise<string>;
  now: () => number;
  newId: () => string;
}

const defaultDeps: ClipDeps = {
  download: downloadPathToFile,
  runFfmpeg: runFfmpegToBuffer,
  upload: uploadPrivateFile,
  signedUrl: signedUrlForPath,
  now: () => Date.now(),
  newId: () => randomUUID(),
};

export interface ClipMeeting {
  id: string;
  workspaceId: string;
  rawMicUrl: string | null;
  rawSysUrl: string | null;
  durationSeconds: number | null;
  metadata: unknown;
}

export interface CreatedClip {
  url: string;
  /** ISO time at which the link stops working. */
  expiresAt: string;
  startSeconds: number;
  endSeconds: number;
  channel: ClipChannel;
}

/**
 * Cuts the clip and returns a link to it. Only files in our own bucket are
 * read: a reference that points anywhere else counts as no audio.
 */
export async function createClip(
  meeting: ClipMeeting,
  request: ClipRequest,
  deps: ClipDeps = defaultDeps,
): Promise<CreatedClip> {
  const meta = (meeting.metadata ?? {}) as { micSysOffsetMs?: unknown; audioDeletedAt?: unknown };
  const micPath = meeting.rawMicUrl ? objectPathOf(meeting.rawMicUrl) : null;
  const sysPath = meeting.rawSysUrl ? objectPathOf(meeting.rawSysUrl) : null;
  const plan = planClip(request, {
    hasMic: !!micPath,
    hasSys: !!sysPath,
    audioDeleted: typeof meta.audioDeletedAt === "string",
    durationSeconds: meeting.durationSeconds,
    micSysOffsetSeconds:
      typeof meta.micSysOffsetMs === "number" && Number.isFinite(meta.micSysOffsetMs)
        ? meta.micSysOffsetMs / 1000
        : 0,
  });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));
  let data: Buffer;
  try {
    const files: { mic?: string; sys?: string } = {};
    if (plan.mic && micPath) files.mic = path.join(dir, "mic");
    if (plan.sys && sysPath) files.sys = path.join(dir, "sys");
    await Promise.all([
      files.mic && micPath ? deps.download(micPath, files.mic) : undefined,
      files.sys && sysPath ? deps.download(sysPath, files.sys) : undefined,
    ]);
    data = await deps.runFfmpeg(buildClipFfmpegArgs(plan, files));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  if (data.length < MIN_CLIP_BYTES) {
    throw new ClipError(400, "There is no audio in that part of the recording.");
  }

  const storagePath = clipStoragePath(meeting.workspaceId, meeting.id, deps.newId());
  await deps.upload(storagePath, data, CLIP_CONTENT_TYPE);
  const url = await deps.signedUrl(storagePath, CLIP_URL_TTL_MS);
  return {
    url,
    expiresAt: new Date(deps.now() + CLIP_URL_TTL_MS).toISOString(),
    startSeconds: plan.startSeconds,
    endSeconds: plan.endSeconds,
    channel: plan.channel,
  };
}
