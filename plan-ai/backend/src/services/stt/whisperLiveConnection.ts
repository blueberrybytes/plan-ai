import { EventEmitter } from "events";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { logger } from "../../utils/logger";
import type { LiveTranscriptionConnection } from "./liveTypes";
import {
  buildPrompt,
  isNoiseSegment,
  pcm16ToWav,
  toDeepgramWord,
  transcribeWithWhisper,
  type WhisperTranscribeOptions,
  type WhisperTranscription,
} from "./whisperClient";
import type { WhisperConfig } from "./sttConfig";

/**
 * Live captions from a self-hosted Whisper server, behind the same interface
 * as Deepgram's live WebSocket.
 *
 * Whisper transcribes whole files, not streams, so the streaming happens
 * here. Incoming 16-bit PCM is cut into 20 ms frames, and an energy-based
 * voice detector finds where each sentence starts and ends. A finished
 * sentence is sent to Whisper and emitted as a final result. While a sentence
 * is still being spoken, it's re-sent every `interimMs` for interim captions.
 *
 * Mapping to the Deepgram events the audio stream listens to:
 *   voice starts                         SpeechStarted
 *   sentence re-sent while spoken        Results, is_final=false
 *   `endpointing` ms of silence          Results, is_final=true
 *   `utterance_end_ms` ms of silence     UtteranceEnd (always after the final)
 *
 * Finals and UtteranceEnd go through one promise chain, so they reach the
 * client in the order the audio was spoken even when requests overlap.
 */

export interface WhisperLiveOptions {
  model: string;
  /** Deepgram-style code or "multi"; see `toWhisperLanguage`. */
  language?: string;
  sampleRate: number;
  /** Silence that ends a sentence (Deepgram `endpointing`). */
  endpointingMs: number;
  /** Silence that ends a turn (Deepgram `utterance_end_ms`). */
  utteranceEndMs: number;
  /** 0 turns interim captions off. */
  interimMs: number;
  keyterms?: string[];
  /**
   * Longest piece sent in one request. Whisper decodes 30 s windows; cutting
   * earlier keeps captions flowing through a long monologue.
   */
  maxSegmentMs?: number;
  whisper: WhisperConfig;
  /** Replaced in tests. */
  transcribe?: (wav: Buffer, options: WhisperTranscribeOptions) => Promise<WhisperTranscription>;
  /** Replaced in tests. */
  healthCheck?: () => Promise<boolean>;
  /** Wall-clock check for a client that stops sending audio. 0 disables. */
  watchdogMs?: number;
}

const FRAME_MS = 20;
/** Voiced frames in a row before a sentence starts: 60 ms, so clicks don't count. */
const ONSET_FRAMES = 3;
/** Audio kept from just before the onset, so the first syllable isn't clipped. */
const PREROLL_MS = 300;
/** About -44 dBFS. Quieter than any speech worth captioning. */
const MIN_RMS = 0.006;
/** A frame is voiced when it's this many times louder than the noise floor. */
const NOISE_MULTIPLIER = 2.5;
/**
 * The noise floor is the quietest frame of the last 2 s. Speech always has
 * gaps between words that fall back to the room's noise, so the minimum
 * follows a fan or a hum even while someone talks. An average would drift up
 * with the speech itself, and adapting only in silence would never adapt to a
 * hum that's there from the first frame.
 */
const NOISE_WINDOW_FRAMES = 2000 / 20;
/** Until the window is full, assume a quiet room. */
const INITIAL_NOISE_FLOOR = 0.003;
/** Caps the floor so a very loud room still lets raised voices through. */
const MAX_NOISE_FLOOR = 0.05;
/** Interims below this length are mostly half-words. */
const MIN_INTERIM_AUDIO_MS = 1000;
const LIVE_REQUEST_TIMEOUT_MS = 30_000;
/** One failing server shouldn't flood the recorder with banners. */
const ERROR_REPORT_INTERVAL_MS = 30_000;
/**
 * Wall-clock idle time before the watchdog treats the client as gone and
 * flushes the sentence in progress. Deliberately far above `endpointing`:
 * that one measures silence in the audio, this one measures missing packets,
 * and a renderer stall of a few hundred milliseconds must not split a
 * sentence that the audio itself continues.
 */
const IDLE_FLUSH_MS = 4000;

interface Segment {
  id: number;
  startSample: number;
  frames: Buffer[];
  samples: number;
  lastInterimSamples: number;
}

export const frameRms = (frame: Buffer): number => {
  const n = frame.length >> 1;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = frame.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / n);
};

export class WhisperLiveConnection extends EventEmitter implements LiveTranscriptionConnection {
  private readyState = 0;
  private readonly frameBytes: number;
  private readonly prerollFrames: number;
  private readonly maxSegmentSamples: number;
  private readonly transcribe: NonNullable<WhisperLiveOptions["transcribe"]>;

  private remainder: Buffer = Buffer.alloc(0);
  private samplesSeen = 0;
  private rmsHistory: number[] = [];
  private onset: Buffer[] = [];
  private preroll: Buffer[] = [];
  private segment: Segment | null = null;
  private nextSegmentId = 1;
  private silentFramesInSegment = 0;
  private silentFramesSinceSpeech = 0;
  private utteranceOpen = false;

  private output: Promise<void> = Promise.resolve();
  private pendingFinals = 0;
  private interimInFlight = false;
  /** Smoothed time the server takes per request on this connection. */
  private requestMs = 0;
  private lastAudioAt = Date.now();
  private lastErrorReportAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: WhisperLiveOptions) {
    super();
    this.frameBytes = Math.round((options.sampleRate * FRAME_MS) / 1000) * 2;
    this.prerollFrames = Math.ceil(PREROLL_MS / FRAME_MS);
    this.maxSegmentSamples = Math.round(
      ((options.maxSegmentMs ?? 20_000) * options.sampleRate) / 1000,
    );
    this.transcribe =
      options.transcribe ??
      ((wav, transcribeOptions) => transcribeWithWhisper(wav, transcribeOptions, options.whisper));

    // Nothing to connect to: Whisper is plain HTTP. Open on the next tick so
    // listeners attached right after construction still see the event, same
    // as with Deepgram.
    setImmediate(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.startWatchdog();
      this.emit(LiveTranscriptionEvents.Open, { type: "Open" });
      void this.checkServer();
    });
  }

  getReadyState(): number {
    return this.readyState;
  }

  /** Deepgram closes idle sockets; an HTTP server doesn't, so there's nothing to keep alive. */
  keepAlive(): void {}

  send(data: ArrayBufferLike | Buffer): void {
    if (this.readyState !== 1) return;
    this.lastAudioAt = Date.now();
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    const buf = this.remainder.length ? Buffer.concat([this.remainder, chunk]) : chunk;
    let offset = 0;
    while (buf.length - offset >= this.frameBytes) {
      // Copied: the caller may reuse its buffer, and frames outlive this call.
      this.processFrame(Buffer.from(buf.subarray(offset, offset + this.frameBytes)));
      offset += this.frameBytes;
    }
    this.remainder = Buffer.from(buf.subarray(offset));
  }

  /** Flushes the sentence in progress, waits for pending results, then closes. */
  requestClose(): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (this.segment) this.finalizeSegment();
    void this.output.then(() => {
      this.readyState = 3;
      this.stopWatchdog();
      this.emit(LiveTranscriptionEvents.Close, { code: 1000, reason: "requested" });
    });
  }

  private processFrame(frame: Buffer): void {
    const rms = frameRms(frame);
    const voiced = rms >= Math.max(MIN_RMS, this.noiseFloor(rms) * NOISE_MULTIPLIER);
    this.samplesSeen += frame.length >> 1;

    if (!this.segment) {
      if (voiced) {
        this.onset.push(frame);
        if (this.onset.length >= ONSET_FRAMES) this.startSegment(false);
        return;
      }
      // A voiced blip that didn't last was a click: it becomes pre-roll.
      for (const f of this.onset) this.pushPreroll(f);
      this.onset = [];
      this.pushPreroll(frame);
      this.silentFramesSinceSpeech += 1;
      this.maybeEndUtterance();
      return;
    }

    this.segment.frames.push(frame);
    this.segment.samples += frame.length >> 1;
    this.silentFramesInSegment = voiced ? 0 : this.silentFramesInSegment + 1;

    if (this.silentFramesInSegment * FRAME_MS >= this.options.endpointingMs) {
      this.silentFramesSinceSpeech = this.silentFramesInSegment;
      this.finalizeSegment();
      this.maybeEndUtterance();
      return;
    }
    if (this.segment.samples >= this.maxSegmentSamples) {
      this.finalizeSegment();
      this.startSegment(true);
      return;
    }
    this.maybeInterim();
  }

  /** Records this frame's energy and returns the floor to compare it against. */
  private noiseFloor(rms: number): number {
    this.rmsHistory.push(rms);
    if (this.rmsHistory.length > NOISE_WINDOW_FRAMES) this.rmsHistory.shift();
    if (this.rmsHistory.length < NOISE_WINDOW_FRAMES) return INITIAL_NOISE_FLOOR;
    let min = Infinity;
    for (const v of this.rmsHistory) if (v < min) min = v;
    return Math.min(min, MAX_NOISE_FLOOR);
  }

  private pushPreroll(frame: Buffer): void {
    this.preroll.push(frame);
    if (this.preroll.length > this.prerollFrames) this.preroll.shift();
  }

  private startSegment(continuation: boolean): void {
    const frames = continuation ? [] : [...this.preroll, ...this.onset];
    const samples = frames.reduce((n, f) => n + (f.length >> 1), 0);
    this.segment = {
      id: this.nextSegmentId++,
      startSample: this.samplesSeen - samples,
      frames,
      samples,
      lastInterimSamples: 0,
    };
    this.preroll = [];
    this.onset = [];
    this.silentFramesInSegment = 0;
    if (continuation) return;

    this.silentFramesSinceSpeech = 0;
    this.utteranceOpen = true;
    this.emit(LiveTranscriptionEvents.SpeechStarted, {
      type: "SpeechStarted",
      channel: [0, 1],
      timestamp: this.segment.startSample / this.options.sampleRate,
    });
  }

  private finalizeSegment(): void {
    const segment = this.segment;
    if (!segment) return;
    this.segment = null;
    this.silentFramesInSegment = 0;
    const pcm = Buffer.concat(segment.frames);
    this.pendingFinals += 1;
    this.enqueue(async () => {
      try {
        await this.transcribeAndEmit(segment.id, segment.startSample, pcm, true);
      } finally {
        this.pendingFinals -= 1;
      }
    });
  }

  private maybeEndUtterance(): void {
    if (!this.utteranceOpen) return;
    if (this.silentFramesSinceSpeech * FRAME_MS < this.options.utteranceEndMs) return;
    this.utteranceOpen = false;
    const lastWordEnd = this.samplesSeen / this.options.sampleRate;
    this.enqueue(async () => {
      if (this.readyState === 3) return;
      this.emit(LiveTranscriptionEvents.UtteranceEnd, {
        type: "UtteranceEnd",
        channel: [0, 1],
        last_word_end: lastWordEnd,
      });
    });
  }

  private maybeInterim(): void {
    const segment = this.segment;
    if (!segment || this.options.interimMs <= 0 || this.interimInFlight) return;
    // An interim for the next sentence arriving before the previous final
    // would make the caption jump back and forth. Wait for the final.
    if (this.pendingFinals > 0) return;
    // Whisper pays for a full 30 s window on every request, however short the
    // audio, so on a CPU each interim costs seconds. When the server answers
    // slower than interims are due, they'd arrive stale and hold up the final
    // queued behind them, so they stop. On a GPU (well under a second per
    // request) they keep flowing.
    if (this.requestMs > this.options.interimMs) return;
    const rate = this.options.sampleRate;
    if (segment.samples < (MIN_INTERIM_AUDIO_MS * rate) / 1000) return;
    if (segment.samples - segment.lastInterimSamples < (this.options.interimMs * rate) / 1000) {
      return;
    }
    segment.lastInterimSamples = segment.samples;
    this.interimInFlight = true;
    const pcm = Buffer.concat(segment.frames);
    void this.transcribeAndEmit(segment.id, segment.startSample, pcm, false).finally(() => {
      this.interimInFlight = false;
    });
  }

  private async transcribeAndEmit(
    segmentId: number,
    startSample: number,
    pcm: Buffer,
    isFinal: boolean,
  ): Promise<void> {
    const rate = this.options.sampleRate;
    const startSeconds = startSample / rate;
    let result: WhisperTranscription;
    const requestedAt = Date.now();
    try {
      result = await this.transcribe(pcm16ToWav(pcm, rate), {
        model: this.options.model,
        language: this.options.language,
        keyterms: this.options.keyterms,
        timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
      });
      const took = Date.now() - requestedAt;
      this.requestMs = this.requestMs === 0 ? took : this.requestMs * 0.7 + took * 0.3;
    } catch (err) {
      // An interim that fails is replaced by the final a moment later; only
      // finals are worth telling the user about.
      if (isFinal) this.reportError(err);
      else logger.debug(`[Whisper live] interim failed: ${String(err)}`);
      return;
    }

    if (this.readyState === 3) return;
    // A late interim for a sentence that's already final would overwrite it.
    if (!isFinal && (this.segment?.id !== segmentId || this.pendingFinals > 0)) return;

    const prompt = buildPrompt(this.options.keyterms);
    const kept = result.segments.filter((s) => !isNoiseSegment(s, prompt));
    const transcript = kept
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!transcript) return;

    const words = kept.flatMap((s) => s.words ?? []).map((w) => toDeepgramWord(w, startSeconds));
    const confidence = words.length
      ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
      : 1;

    this.emit(LiveTranscriptionEvents.Transcript, {
      type: "Results",
      channel_index: [0, 1],
      start: startSeconds,
      duration: (pcm.length >> 1) / rate,
      is_final: isFinal,
      speech_final: isFinal,
      from_finalize: false,
      channel: { alternatives: [{ transcript, confidence, words }] },
    });
  }

  private enqueue(task: () => Promise<void>): void {
    this.output = this.output.then(task).catch((err) => {
      logger.error("[Whisper live] output task failed", err);
    });
  }

  private reportError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[Whisper live] ${message}`);
    const now = Date.now();
    if (now - this.lastErrorReportAt < ERROR_REPORT_INTERVAL_MS) return;
    this.lastErrorReportAt = now;
    if (this.readyState !== 1 && this.readyState !== 2) return;
    // EventEmitter turns an "error" nobody listens to into a throw. The audio
    // stream detaches every listener from a connection it's replacing (language
    // change) while this connection's health check or last request can still
    // be in flight, so the throw would land in a promise nobody awaits and
    // take the process down.
    if (this.listenerCount(LiveTranscriptionEvents.Error) === 0) return;
    this.emit(
      LiveTranscriptionEvents.Error,
      new Error(`Live transcription failed on the Whisper server: ${message}`),
    );
  }

  private async checkServer(): Promise<void> {
    const check =
      this.options.healthCheck ??
      (async () => {
        const res = await fetch(`${this.options.whisper.baseUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        return res.ok;
      });
    const healthy = await check().catch(() => false);
    if (!healthy) {
      this.reportError(new Error(`server at ${this.options.whisper.baseUrl} is not reachable`));
    }
  }

  /**
   * Silence normally arrives as audio (the recorder sends zeros), and the
   * frame logic ends sentences on it. This covers a client that simply stops
   * sending: without it the last sentence would wait until the socket closes.
   * It only fires after IDLE_FLUSH_MS, so a brief gap in packets doesn't cut
   * a sentence the way audio silence would.
   */
  private startWatchdog(): void {
    const every = this.options.watchdogMs ?? 250;
    if (every <= 0) return;
    const flushAfterMs = Math.max(this.options.endpointingMs, IDLE_FLUSH_MS);
    const turnEndAfterMs = Math.max(this.options.utteranceEndMs, IDLE_FLUSH_MS);
    this.watchdog = setInterval(() => {
      if (this.readyState !== 1) return;
      const idleMs = Date.now() - this.lastAudioAt;
      if (this.segment && idleMs >= flushAfterMs) {
        this.silentFramesSinceSpeech = Math.floor(idleMs / FRAME_MS);
        this.finalizeSegment();
      }
      if (!this.segment && idleMs >= turnEndAfterMs) {
        this.silentFramesSinceSpeech = Math.max(
          this.silentFramesSinceSpeech,
          Math.floor(idleMs / FRAME_MS),
        );
        this.maybeEndUtterance();
      }
    }, every);
    this.watchdog.unref?.();
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }
}
