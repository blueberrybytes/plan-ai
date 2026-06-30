/**
 * Audio decode/encode helpers for the reprocess-path echo canceller.
 *
 * Decoding the stored recorder blobs (webm/opus for the mic & Windows sys,
 * m4a/AAC for the macOS sys) to raw PCM needs a real codec, so we shell out to
 * ffmpeg. The binary is resolved from, in order: FFMPEG_PATH, the bundled
 * `ffmpeg-static` package (optional dep, lazily required so a missing install
 * never breaks the build), then `ffmpeg` on PATH.
 *
 * Encoding back to a WAV the recogniser can read is pure JS (no ffmpeg needed).
 */
import { spawn } from "child_process";
import { promises as fs, existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { logger } from "./logger";

let cachedFfmpegPath: string | null = null;

export function resolveFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  if (process.env.FFMPEG_PATH) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }
  try {
    // Optional dependency — lazily required so the backend still builds/runs if
    // it isn't installed. Only use it when the downloaded binary actually exists
    // (a Docker build that skips postinstall scripts leaves the package present
    // but the binary missing); otherwise fall through to the system ffmpeg the
    // Dockerfile installs via apt.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require("ffmpeg-static");
    if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
      cachedFfmpegPath = ffmpegStatic;
      return cachedFfmpegPath;
    }
  } catch {
    /* not installed — fall through to PATH */
  }
  // System ffmpeg (installed in the backend Dockerfile via `apt-get install ffmpeg`).
  cachedFfmpegPath = "ffmpeg";
  return cachedFfmpegPath;
}

function runFfmpegToBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(resolveFfmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(-600)}`));
    });
  });
}

/**
 * Fetch a stored audio URL and decode it to mono float32 PCM at `sampleRate`.
 * Writes the bytes to a temp file first (m4a's moov atom can sit at the end,
 * which ffmpeg can't seek to over a pipe).
 */
export async function decodeUrlToMonoPcm(url: string, sampleRate = 16000): Promise<Float32Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for audio blob`);
  const inBuf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), `aec-in-${randomUUID()}`);
  await fs.writeFile(tmp, inBuf);
  try {
    const raw = await runFfmpegToBuffer([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      tmp,
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "f32le",
      "pipe:1",
    ]);
    // Copy into an aligned ArrayBuffer (Buffer.concat may be byte-misaligned for
    // a Float32 view). f32le length is always a multiple of 4.
    const usable = raw.length - (raw.length % 4);
    const ab = new ArrayBuffer(usable);
    new Uint8Array(ab).set(raw.subarray(0, usable));
    return new Float32Array(ab);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/** Encode mono float32 PCM as a 16-bit WAV buffer (for Deepgram transcribeFile). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Buffer {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // audio format = PCM
  buf.writeUInt16LE(1, 22); // channels = mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono, 2 bytes/sample)
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, o);
    o += 2;
  }
  return buf;
}

/** True when ffmpeg can actually be invoked (probe used to fail open, not throw). */
export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runFfmpegToBuffer(["-hide_banner", "-version"]);
    return true;
  } catch (e) {
    logger.warn(
      `[AEC] ffmpeg not available (${resolveFfmpegPath()}): ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}
