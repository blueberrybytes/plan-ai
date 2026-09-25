/**
 * End-to-end check of the configured speech-to-text provider, through the
 * same code the recorder uses.
 *
 *   yarn stt:smoke --mic mic.wav [--sys sys.wav] [--language es] [--speed 1]
 *                  [--skip-live] [--skip-batch]
 *
 * Live: streams the mic WAV into the live transcriber in 100 ms packets at
 * real-time pace (as the recorder does) and prints every event with its time,
 * plus how long each final took to arrive after the sentence ended.
 *
 * Batch: serves the WAVs over a local HTTP server and runs the real
 * post-meeting pass (`diarizeAudio`), which downloads them by URL exactly as
 * it downloads stored recordings.
 *
 * WAV files must be 16-bit PCM mono. `afconvert -f WAVE -d LEI16@24000 -c 1`
 * turns anything macOS can play into one.
 */
import { readFileSync } from "fs";
import http from "http";
import type { AddressInfo } from "net";
import { basename } from "path";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { getSttProvider, getWhisperConfig } from "../services/stt/sttConfig";
import {
  createDeepgramLiveTranscriber,
  createWhisperLiveTranscriber,
} from "../services/stt/liveTranscriber";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const readWav = (path: string): { pcm: Buffer; sampleRate: number } => {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error(`${path} is not a WAV file`);
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      const channels = buf.readUInt16LE(offset + 10);
      const bits = buf.readUInt16LE(offset + 22);
      sampleRate = buf.readUInt32LE(offset + 12);
      if (channels !== 1 || bits !== 16) throw new Error(`${path}: need 16-bit mono PCM`);
    }
    if (id === "data") return { pcm: buf.subarray(offset + 8, offset + 8 + size), sampleRate };
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no data chunk`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const runLive = async (micPath: string, language: string, speed: number): Promise<void> => {
  const provider = getSttProvider();
  const transcriber =
    provider === "whisper"
      ? createWhisperLiveTranscriber()
      : createDeepgramLiveTranscriber(process.env.DEEPGRAM_API_KEY ?? "");
  const { pcm, sampleRate } = readWav(micPath);
  const seconds = pcm.length / 2 / sampleRate;
  console.log(
    `\n── LIVE (${provider}, model ${transcriber.usage.model}) ${basename(micPath)} ` +
      `${seconds.toFixed(1)} s at ${speed}x ──`,
  );

  const conn = transcriber.live({
    model: "nova-3",
    language,
    smart_format: true,
    interim_results: true,
    encoding: "linear16",
    sample_rate: sampleRate,
    endpointing: 500,
    utterance_end_ms: 1000,
    vad_events: true,
  });

  const t0 = Date.now();
  const stamp = () => `${((Date.now() - t0) / 1000).toFixed(2).padStart(6)}s`;
  // Audio-clock time the stream has reached, to measure how late finals are.
  let audioSeconds = 0;
  const lags: number[] = [];

  conn.on(LiveTranscriptionEvents.SpeechStarted, () => console.log(`${stamp()}  · voice`));
  conn.on(LiveTranscriptionEvents.UtteranceEnd, () => console.log(`${stamp()}  · turn ended`));
  conn.on(LiveTranscriptionEvents.Error, (e: Error) => console.log(`${stamp()}  ! ${e.message}`));
  conn.on(
    LiveTranscriptionEvents.Transcript,
    (d: {
      is_final?: boolean;
      start?: number;
      duration?: number;
      channel?: { alternatives?: { transcript?: string }[] };
    }) => {
      const text = d.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text) return;
      if (d.is_final) {
        const sentenceEnd = (d.start ?? 0) + (d.duration ?? 0);
        const lag = Math.max(0, audioSeconds - sentenceEnd);
        lags.push(lag);
        console.log(
          `${stamp()}  FINAL [+${(d.start ?? 0).toFixed(2)}s] (${lag.toFixed(1)} s late) ${text}`,
        );
      } else {
        console.log(`${stamp()}  interim  ${text}`);
      }
    },
  );

  await new Promise<void>((resolve) => conn.on(LiveTranscriptionEvents.Open, () => resolve()));

  const packetBytes = Math.round(sampleRate / 10) * 2;
  const started = Date.now();
  for (let o = 0; o < pcm.length; o += packetBytes) {
    conn.send(pcm.subarray(o, o + packetBytes) as unknown as ArrayBufferLike);
    audioSeconds = (o + packetBytes) / 2 / sampleRate;
    // Real-time pacing against the wall clock, not per-packet sleeps, so
    // timer drift doesn't slow the stream down.
    const due = started + (audioSeconds * 1000) / speed;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait);
  }

  await new Promise<void>((resolve) => {
    conn.on(LiveTranscriptionEvents.Close, () => resolve());
    conn.requestClose();
  });
  const avg = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
  console.log(
    `── live done: ${lags.length} finals, arriving on average ${avg.toFixed(1)} s after ` +
      `the sentence was detected as finished ──`,
  );
};

const runBatch = async (micPath: string, sysPath: string | undefined, language: string) => {
  const files = new Map<string, string>([["/mic.wav", micPath]]);
  if (sysPath) files.set("/sys.wav", sysPath);
  const server = http.createServer((req, res) => {
    const path = files.get(req.url ?? "");
    if (!path) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "audio/wav" }).end(readFileSync(path));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const provider = getSttProvider();
  console.log(
    `\n── BATCH (${provider}${provider === "whisper" ? `, model ${getWhisperConfig().model}` : ""}) ──`,
  );
  // Imported here: the service pulls in Prisma and the queues, which the
  // live check doesn't need.
  const { projectTranscriptService } = await import("../services/projectTranscriptService");
  const diarize = (
    projectTranscriptService as unknown as {
      diarizeAudio: (
        mic: string | null,
        sys: string | null,
        language?: string | null,
      ) => Promise<{
        utterances: { speaker: string; start: number; end: number; transcript: string }[];
        totalSeconds: number;
        diagnostics: string[];
      }>;
    }
  ).diarizeAudio.bind(projectTranscriptService);

  const t0 = Date.now();
  const result = await diarize(`${base}/mic.wav`, sysPath ? `${base}/sys.wav` : null, language);
  const took = (Date.now() - t0) / 1000;
  for (const u of result.utterances) {
    console.log(
      `  [${u.start.toFixed(2).padStart(6)} to ${u.end.toFixed(2).padStart(6)}] ${u.speaker}: ${u.transcript}`,
    );
  }
  console.log(
    `── batch done in ${took.toFixed(1)} s: ${result.utterances.length} utterances, ` +
      `${result.totalSeconds} s of speech` +
      (result.diagnostics.length ? `, FAILURES: ${result.diagnostics.join(" | ")}` : "") +
      " ──",
  );
  server.close();
};

const main = async (): Promise<void> => {
  const mic = arg("mic");
  if (!mic) {
    console.error(
      "usage: yarn stt:smoke --mic mic.wav [--sys sys.wav] [--language es] [--speed 1]",
    );
    process.exit(2);
  }
  const language = arg("language") ?? "multi";
  const speed = Number(arg("speed") ?? 1) || 1;
  if (!flag("skip-live")) await runLive(mic, language, speed);
  if (!flag("skip-batch")) await runBatch(mic, arg("sys"), language);
  process.exit(0);
};

main().catch((err) => {
  console.error("stt:smoke failed:", err);
  process.exit(1);
});
