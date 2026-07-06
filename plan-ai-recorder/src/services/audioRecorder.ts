import { createPlanAiApi } from "./planAiApi";
import { loadConfig } from "../utils/recorderConfig";
import * as Sentry from "@sentry/electron/renderer";

// @ts-ignore
import rawAudioWorklet from "../../public/audioWorklet.js?raw";

type PlanAiApi = ReturnType<typeof createPlanAiApi>;

/** Result posted back by aecWorker.ts after offline echo cancellation. */
interface AecWorkerResponse {
  ok: boolean;
  audio?: ArrayBuffer; // encoded cleaned mic (MP3 or WAV), only when ok
  mime?: string;
  sampleRate: number;
  delaySamples?: number;
  erleDb?: number;
  nearKept?: number;
  echoReduction?: number;
  error?: string;
}

/** Concatenate buffered Int16 PCM chunks into one contiguous buffer. */
function concatInt16(chunks: Int16Array[], total: number): Int16Array {
  const out = new Int16Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export type RecorderState = "idle" | "recording" | "stopping";

export interface AudioRecorderOptions {
  /** The initialized API instance from the Auth Provider */
  api: PlanAiApi;
  /** Called when a real-time transcript delta or final sentence arrives */
  onTranscript: (source: "mic" | "sys", text: string, isFinal: boolean) => void;
  /** Called when VAD detects speech starting or stopping */
  onSpeechEvent?: (
    source: "mic" | "sys",
    type: "speech_started" | "utterance_end",
  ) => void;
  /** Called when recording fully stops and the socket closes */
  onStop: () => void;
  /** Called when the websocket connection is lost unexpectedly */
  onDisconnect?: () => void;
  /** Called when an automatic reconnection attempt starts (with the attempt #). */
  onReconnecting?: (attempt: number) => void;
  /** Called when the connection is successfully re-established after a drop. */
  onReconnected?: () => void;
  /** Called on any error. May include a structured `code`/`provider` when the backend tagged it. */
  onError: (error: Error & { code?: string; provider?: string }) => void;
}

interface TypedBackendError {
  code?: string;
  provider?: string;
  message: string;
}

/**
 * Outcome of the stop-time offline echo canceller for one recording. Uploaded
 * with the transcript (stored as `metadata.recorderAec`) so echoey meetings can
 * be diagnosed per-recording without access to the user's console.
 */
export interface AecTelemetry {
  outcome: "applied" | "rejected" | "skipped" | "error";
  /** Why AEC didn't apply: "headphones-mode" | "pcm-cap-exceeded" | "no-buffered-audio" | self-check/worker error detail. */
  reason?: string;
  erleDb?: number;
  nearKept?: number;
  echoReduction?: number;
  delaySeconds?: number;
  /** Mic PCM available to the canceller (seconds). */
  bufferedSeconds?: number;
  /** Sys (reference) PCM available (seconds). Should ≈ wallSeconds; a deficit means the reference timeline is still being compressed. */
  sysBufferedSeconds?: number;
  /** Wall-clock recording duration (seconds). */
  wallSeconds?: number;
  /** macOS sys scheduler: how many times playback fell behind (each one was a timeline gap pre-keep-alive fix). */
  sysResets?: number;
  /** macOS sys scheduler: total scheduling-gap time (seconds). */
  sysGapSeconds?: number;
  /** How long the AEC worker ran (ms). */
  workerMs?: number;
}

/**
 * AudioRecorder manages microphone + system audio capture and Realtime WebSocket streaming.
 *
 * Mic audio: WebAudio AudioWorklet → Int16 PCM → WebSocket
 *
 * System audio (macOS):
 *   Native ScreenCaptureKit binary → SIGUSR1 chunks → decodeAudioData → sysWorkletNode
 *
 * System audio (Windows / Linux):
 *   getDisplayMedia({ audio: true, video: false }) → MediaStream → sysWorkletNode (live, no chunking)
 */
export class AudioRecorder {
  private micStream: MediaStream | null = null;
  private sysStream: MediaStream | null = null; // Windows getDisplayMedia stream
  private audioContext: AudioContext | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;
  private sysWorkletNode: AudioWorkletNode | null = null;
  // Silent always-active source keeping sysWorkletNode's input channel alive.
  // Without it, the worklet sees ZERO input channels between scheduled macOS
  // chunks and skips those quanta entirely, so the posted sys stream (WS +
  // AEC reference) has every gap DELETED — a compressed, drifting timeline the
  // echo canceller can never align against the real-time mic (field test
  // 2026-07-06: erle=-0.2dB), and compressed sys timestamps that skew every
  // text-dedup window. With it, the sys stream is real-time and silence-filled,
  // symmetric with the mic.
  private sysKeepAliveNode: ConstantSourceNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private sysSourceNode: MediaStreamAudioSourceNode | null = null; // Windows web audio source
  private ws: WebSocket | null = null;
  // Automatic reconnection (exponential backoff). The MediaRecorders keep
  // recording throughout, so audio is never lost — only the live transcript of
  // the disconnected window, which the server recovers by diarizing the
  // uploaded audio at the end.
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;
  private sysAudioInterval: ReturnType<typeof setInterval> | null = null;
  private sysAudioPlaybackTime: number = 0;

  private micMediaRecorder: MediaRecorder | null = null;
  private sysMediaRecorder: MediaRecorder | null = null;
  private micChunks: Blob[] = [];
  private sysChunks: Blob[] = [];

  // ── Offline echo cancellation (loudspeaker bleed) ──────────────────────────
  // Raw, PRE-CODEC mic + sys PCM buffered while recording so the loudspeaker
  // bleed can be subtracted at STOP (see echoCancel.ts / aecWorker.ts). Linear
  // AEC only works before the lossy Opus/AAC encode, so it MUST happen here, not
  // server-side on the compressed blobs. Buffered only in speaker mode (no echo
  // on headphones) and capped to bound renderer memory.
  private aecMicPcm: Int16Array[] = [];
  private aecSysPcm: Int16Array[] = [];
  private aecMicSamples = 0;
  private aecSysSamples = 0;
  private aecOverCap = false;
  // The canceller processes at 16 kHz (speech lives below 8 kHz), so chunks are
  // downsampled from the 24 kHz context rate AT CAPTURE — buffering at the
  // processing rate instead of the context rate stretches the same memory
  // budget from ~60 to ~90 minutes, and the worker skips its own resample.
  private static readonly AEC_RATE = 16000;
  // ~90 min at 16 kHz — identical RAM to the previous 60-min @ 24 kHz cap.
  // Longer recordings skip AEC and keep the raw mic (recorded in telemetry).
  private static readonly AEC_MAX_SAMPLES = 16000 * 60 * 90;
  // Per-channel streaming-resampler carry (fractional read position + previous
  // chunk's final sample) so chunk boundaries interpolate as one stream.
  private aecDs = {
    mic: { frac: 0, last: 0 },
    sys: { frac: 0, last: 0 },
  };
  // Outcome of the stop-time canceller for THIS recording (see AecTelemetry).
  private aecTelemetry: AecTelemetry | null = null;
  // Wall-clock start of the recording — lets the stop-time diagnostics compare
  // buffered PCM seconds against real elapsed time (a sys deficit = the
  // reference timeline is being compressed, which starves the canceller).
  private recStartWallMs = 0;
  // Wall-clock when stop() was requested. Buffering ceases there, but the AEC
  // runs after a 2.5s flush grace — measuring wall against THIS avoids a
  // phantom ~2.75s "deficit" in the diagnostics (seen 2026-07-06).
  private recStopWallMs = 0;
  // macOS sys-scheduler health counters (see the chunk interval in start()).
  private sysChunkStats = { chunks: 0, decodedSeconds: 0, resets: 0, gapSeconds: 0 };
  // macOS: the AEC sys reference is appended straight from the DECODED capture
  // chunks (contiguous capture timeline) instead of the worklet playback tap.
  // Playback scheduling re-anchors on every decode hiccup (field test
  // 2026-07-06: 5 resets / 2.8s of jumps in 43s), which puts the reference on a
  // piecewise-jumping delay no adaptive filter can track (erle=-0.8dB despite a
  // correct global delay). When true, the worklet's sys tap is skipped.
  private sysAecTapDirect = false;

  private state: RecorderState = "idle";
  private options: AudioRecorderOptions;
  private lastTypedError: TypedBackendError | null = null;
  // Browser AEC state. ON by default (automatic at start); the user can flip it
  // off live for headphones via setSpeakerMode() on the Recording screen.
  private speakerMode = true;

  constructor(options: AudioRecorderOptions) {
    this.options = options;
  }

  get currentState(): RecorderState {
    return this.state;
  }

  /**
   * Helper to convert an Int16Array buffer directly to a Base64 string for OpenAI
   */
  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Retain a copy of a pre-codec PCM chunk for the stop-time echo canceller.
   * Only in speaker mode (headphones have no acoustic echo) and under a memory
   * cap; past the cap we drop the buffers and fall back to the raw mic.
   */
  private bufferPcmForAec(source: "mic" | "sys", buffer: ArrayBuffer): void {
    if (this.state !== "recording" || !this.speakerMode || this.aecOverCap) return;
    // Downsample to the 16 kHz processing rate at capture. The resampler writes
    // a fresh owned array, so no extra copy of the worklet's transferred buffer
    // is needed.
    const inputRate = this.audioContext?.sampleRate ?? 24000;
    const pcm = this.downsampleForAec(this.aecDs[source], new Int16Array(buffer), inputRate);
    if (pcm.length === 0) return;
    if (source === "mic") {
      this.aecMicPcm.push(pcm);
      this.aecMicSamples += pcm.length;
    } else {
      this.aecSysPcm.push(pcm);
      this.aecSysSamples += pcm.length;
    }
    if (
      this.aecMicSamples > AudioRecorder.AEC_MAX_SAMPLES ||
      this.aecSysSamples > AudioRecorder.AEC_MAX_SAMPLES
    ) {
      this.aecOverCap = true;
      this.aecMicPcm = [];
      this.aecSysPcm = [];
      this.aecMicSamples = 0;
      this.aecSysSamples = 0;
      this.aecTelemetry = {
        outcome: "skipped",
        reason: "pcm-cap-exceeded",
        bufferedSeconds: Math.round(AudioRecorder.AEC_MAX_SAMPLES / AudioRecorder.AEC_RATE),
      };
      console.warn(
        "[AudioRecorder] AEC PCM cap reached — echo cancellation skipped for this long recording (raw mic kept).",
      );
    }
  }

  /**
   * Streaming linear-interpolation downsampler used while buffering AEC PCM.
   * Keeps a fractional-position + last-sample carry per channel so consecutive
   * chunks resample as one continuous stream (no boundary artifacts).
   */
  private downsampleForAec(
    st: { frac: number; last: number },
    input: Int16Array,
    inputRate: number,
  ): Int16Array {
    if (input.length === 0) return new Int16Array(0);
    // Context already at/below the processing rate — keep as-is (owned copy).
    if (inputRate <= AudioRecorder.AEC_RATE) return new Int16Array(input);
    const ratio = inputRate / AudioRecorder.AEC_RATE;
    const out: number[] = [];
    // `pos` is the fractional input index of the next output sample within this
    // chunk; -1 < pos < 0 interpolates from the previous chunk's tail sample.
    let pos = st.frac;
    while (pos <= input.length - 1) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = i0 < 0 ? st.last : input[i0];
      const b = i0 + 1 < input.length ? input[i0 + 1] : input[input.length - 1];
      out.push(Math.round(a + (b - a) * frac));
      pos += ratio;
    }
    st.frac = pos - input.length;
    st.last = input[input.length - 1];
    return Int16Array.from(out);
  }

  /**
   * Run the offline echo canceller on the buffered pre-codec PCM in a worker.
   * Returns a cleaned-mic Blob (MP3, or WAV fallback) ONLY when the self-check
   * confirms the far side was removed AND the user's own voice was preserved;
   * otherwise null (caller keeps the raw mic). Never throws into the stop path.
   */
  private async runAecOnBuffers(): Promise<Blob | null> {
    if (!this.speakerMode || this.aecOverCap) {
      // Cap-hit already recorded its own telemetry (with bufferedSeconds).
      if (!this.aecTelemetry) {
        this.aecTelemetry = { outcome: "skipped", reason: "headphones-mode" };
      }
      return null;
    }
    if (this.aecMicSamples === 0 || this.aecSysSamples === 0) {
      this.aecTelemetry = {
        outcome: "skipped",
        reason: `no-buffered-audio (mic=${this.aecMicSamples} sys=${this.aecSysSamples} samples)`,
        wallSeconds: Math.round((Date.now() - this.recStartWallMs) / 1000),
      };
      return null;
    }

    // Buffers are already at the 16 kHz processing rate (downsampled at capture).
    const sampleRate = AudioRecorder.AEC_RATE;
    const round2 = (v?: number) => (v == null ? undefined : Math.round(v * 100) / 100);
    const bufferedSeconds = round2(this.aecMicSamples / sampleRate);
    const sysBufferedSeconds = round2(this.aecSysSamples / sampleRate);
    const wallSeconds = round2(
      ((this.recStopWallMs || Date.now()) - this.recStartWallMs) / 1000,
    );
    // Diagnostics shared by every outcome below. sysBuf should ≈ wall; a
    // deficit means the reference timeline is compressed and the canceller is
    // structurally doomed regardless of tuning (root cause of the 2026-07-06
    // erle=-0.2dB field failure).
    const diag = {
      bufferedSeconds,
      sysBufferedSeconds,
      wallSeconds,
      sysResets: this.sysChunkStats.resets,
      sysGapSeconds: round2(this.sysChunkStats.gapSeconds),
    };
    console.log(
      `[AudioRecorder] AEC buffers: mic=${bufferedSeconds}s sys=${sysBufferedSeconds}s ` +
        `wall=${wallSeconds}s sysDeficit=${round2((wallSeconds ?? 0) - (sysBufferedSeconds ?? 0))}s | ` +
        `scheduler chunks=${this.sysChunkStats.chunks} resets=${this.sysChunkStats.resets} ` +
        `gaps=${this.sysChunkStats.gapSeconds.toFixed(1)}s`,
    );
    const mic = concatInt16(this.aecMicPcm, this.aecMicSamples);
    const sys = concatInt16(this.aecSysPcm, this.aecSysSamples);
    // Release the per-chunk arrays early; the contiguous buffers are transferred.
    this.aecMicPcm = [];
    this.aecSysPcm = [];

    const workerT0 = Date.now();
    try {
      const result = await this.processAecInWorker(mic, sys, sampleRate);
      const workerMs = Date.now() - workerT0;
      if (!result.ok || !result.audio) {
        this.aecTelemetry = {
          outcome: "rejected",
          reason: result.error ?? "self-check",
          erleDb: round2(result.erleDb),
          nearKept: round2(result.nearKept),
          echoReduction: round2(result.echoReduction),
          delaySeconds: round2((result.delaySamples ?? 0) / result.sampleRate),
          workerMs,
          ...diag,
        };
        console.log(
          `[AudioRecorder] AEC not applied (ok=${result.ok} ` +
            `erle=${result.erleDb?.toFixed(1)}dB nearKept=${result.nearKept?.toFixed(2)} ` +
            `echoRed=${result.echoReduction?.toFixed(2)} ` +
            `delay=${((result.delaySamples ?? 0) / result.sampleRate).toFixed(2)}s ` +
            `workerMs=${workerMs}${result.error ? ` err=${result.error}` : ""})`,
        );
        return null;
      }
      this.aecTelemetry = {
        outcome: "applied",
        erleDb: round2(result.erleDb),
        nearKept: round2(result.nearKept),
        echoReduction: round2(result.echoReduction),
        delaySeconds: round2((result.delaySamples ?? 0) / result.sampleRate),
        workerMs,
        ...diag,
      };
      console.log(
        `[AudioRecorder] ✅ AEC applied: erle=${result.erleDb?.toFixed(1)}dB ` +
          `delay=${((result.delaySamples ?? 0) / result.sampleRate).toFixed(2)}s ` +
          `nearKept=${result.nearKept?.toFixed(2)} echoRed=${result.echoReduction?.toFixed(2)} ` +
          `workerMs=${workerMs} size=${(result.audio.byteLength / 1024).toFixed(0)}KB`,
      );
      return new Blob([result.audio], { type: result.mime ?? "audio/mpeg" });
    } catch (e) {
      this.aecTelemetry = {
        outcome: "error",
        reason: e instanceof Error ? e.message : String(e),
        workerMs: Date.now() - workerT0,
        ...diag,
      };
      console.warn(
        "[AudioRecorder] AEC worker failed, keeping raw mic:",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  }

  /** Echo-canceller outcome for this recording — populated during stop(). */
  getAecTelemetry(): AecTelemetry | null {
    return this.aecTelemetry;
  }

  /**
   * Chrome mic-processing constraints for the current speaker-mode state.
   *
   * macOS: browser AEC3 is REFERENCELESS in our topology (the far side plays
   * through another app; this page renders only silence), so it cannot remove
   * loudspeaker bleed — both 2026-07-06 field tests show the bleed transcribed
   * verbatim with it ON. Worse, noiseSuppression is a NONLINEAR stage that
   * decorrelates the echo from the sys reference the offline canceller must
   * model. So on macOS the mic stays RAW and the stop-time canceller is the
   * sole defense. Windows/Linux keep the previous behaviour.
   */
  private micProcessingConstraints(): {
    echoCancellation: boolean;
    noiseSuppression: boolean;
  } {
    const isMac = /Mac/i.test(navigator.userAgent);
    if (isMac) return { echoCancellation: false, noiseSuppression: false };
    return {
      echoCancellation: this.speakerMode,
      noiseSuppression: this.speakerMode,
    };
  }

  private processAecInWorker(
    mic: Int16Array,
    sys: Int16Array,
    sampleRate: number,
  ): Promise<AecWorkerResponse> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("./aecWorker.ts", import.meta.url), {
          type: "module",
        });
      } catch (e) {
        reject(e);
        return;
      }
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error("AEC worker timeout"));
      }, 180_000);
      worker.onmessage = (ev: MessageEvent<AecWorkerResponse>) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(ev.data);
      };
      worker.onerror = (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err instanceof ErrorEvent ? new Error(err.message) : err);
      };
      worker.postMessage({ mic: mic.buffer, sys: sys.buffer, sampleRate }, [
        mic.buffer,
        sys.buffer,
      ]);
    });
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;

    try {
      this.state = "recording";
      this.recStartWallMs = Date.now();
      this.recStopWallMs = 0;
      this.sysChunkStats = { chunks: 0, decodedSeconds: 0, resets: 0, gapSeconds: 0 };
      this.aecTelemetry = null;
      this.sysAecTapDirect = false;

      // 0. Permission check (macOS only — no-op on Windows)
      if (window.electron.checkMicrophonePermission) {
        await window.electron.checkMicrophonePermission();
      }

      // 1. Start system audio — macOS spins up the native binary;
      //    Windows/Linux returns "use_web_api" so we capture via getDisplayMedia below.
      let useWebApiForSysAudio = false;
      try {
        if (window.electron.startSystemAudio) {
          const result = await window.electron.startSystemAudio();
          if (result === "use_web_api") {
            useWebApiForSysAudio = true;
          }
        }
      } catch (e) {
        console.warn(
          "[AudioRecorder] Could not start system audio binary:",
          e instanceof Error ? e.message : e,
        );
      }

      // 2. Establish the WebSocket connection
      await this.initializeWebSocket();

      // 3. Microphone stream acquisition
      const config = loadConfig();
      const micDeviceId = config?.micDeviceId;
      // Speaker mode → browser AEC (WebRTC AEC3, the same engine Teams uses) to
      // remove loudspeaker bleed AT CAPTURE. This is the real fix for the
      // "duplicated transcript on speakerphone" problem: a clean mic means no
      // bleed reaches transcription, so no post-hoc dedup is needed. It's now ON
      // by default (automatic at start) — the common case is a virtual meeting
      // on a loudspeaker. The cost is that macOS "voice communication" mode
      // mildly mutes the system audio the user hears; a headphone user can flip
      // it off live via setSpeakerMode(). autoGainControl stays off (it pumps).
      this.speakerMode = config?.speakerMode ?? true;
      const micProc = this.micProcessingConstraints();
      console.log(
        `[AudioRecorder] 🎤 Requesting mic deviceId="${micDeviceId}" speakerMode=${this.speakerMode} ` +
          `(browserAEC=${micProc.echoCancellation} NS=${micProc.noiseSuppression})`,
      );
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...micProc,
          autoGainControl: false,
          ...(micDeviceId && micDeviceId !== "default"
            ? { deviceId: { exact: micDeviceId } }
            : {}),
        },
        video: false,
      });

      // Diagnostic: log what we actually got
      const micTrack = this.micStream.getAudioTracks()[0];
      const micSettings = micTrack?.getSettings();
      console.log(`[AudioRecorder] ✅ Mic stream acquired:`, {
        label: micTrack?.label,
        readyState: micTrack?.readyState,
        muted: micTrack?.muted,
        enabled: micTrack?.enabled,
        sampleRate: micSettings?.sampleRate,
        channelCount: micSettings?.channelCount,
        deviceId: micSettings?.deviceId,
        groupId: micSettings?.groupId,
        autoGainControl: micSettings?.autoGainControl,
        noiseSuppression: micSettings?.noiseSuppression,
        echoCancellation: micSettings?.echoCancellation,
      });

      // Monitor track health
      micTrack.onended = () => console.error(`[AudioRecorder] ⚠️ Mic track ENDED unexpectedly! (label: ${micTrack.label})`);
      micTrack.onmute = () => console.warn(`[AudioRecorder] ⚠️ Mic track MUTED (label: ${micTrack.label})`);
      micTrack.onunmute = () => console.log(`[AudioRecorder] Mic track UN-MUTED (label: ${micTrack.label})`);

      //const audioTrack = this.micStream.getAudioTracks()[0];

      // We will setup micMediaRecorder later, after the AudioContext and Worklet are ready,
      // so that we record the mic audio as it leaves the worklet (with capture-time
      // browser AEC applied when speaker mode is on; the worklet itself no longer processes it).
      this.micChunks = [];

      // 4. Windows system audio via getDisplayMedia
      //    We request only the audio track. Electron's desktopCapturer bridge lets
      //    us pass a chromeMediaSourceId so the user doesn't have to pick again.
      if (useWebApiForSysAudio) {
        useWebApiForSysAudio = await this.startWindowsSysAudio();

        // Setup MediaRecorder for Windows/Linux Sys Blob capture
        if (this.sysStream) {
          this.sysChunks = [];
          this.sysMediaRecorder = new MediaRecorder(this.sysStream, {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 32_000, // 32 kbps Opus: voice-grade, ~4x smaller uploads (avoids 'Request aborted' on long meetings). Transcript comes from the live Deepgram stream, not this audio, so quality here only affects archived playback.
          });
          this.sysMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.sysChunks.push(e.data);
          };
          this.sysMediaRecorder.start(1000);
        }
      }

      // 5. Mount WebAudio graph
      // Force a 24 kHz context to natively downsample if the OS forces 48 kHz
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Diagnostic: sample rate mismatch check
      const micNativeRate = this.micStream.getAudioTracks()[0]?.getSettings()?.sampleRate ?? 0;
      console.log(`[AudioRecorder] 🔄 Sample rates: mic=${micNativeRate}Hz, context=${this.audioContext.sampleRate}Hz${micNativeRate !== this.audioContext.sampleRate ? ' ⚠️ MISMATCH (browser will resample)' : ' ✅ match'}`);
      console.log(`[AudioRecorder] AudioContext state=${this.audioContext.state}, baseLatency=${this.audioContext.baseLatency?.toFixed(4)}s, outputLatency=${(this.audioContext as any).outputLatency?.toFixed(4) ?? 'n/a'}s`);

      // For Windows Electron (file://), using a real file path instantly crashes with
      // 'The user aborted a request' due to chromium site isolation.
      // We bundle the code as a string, make a Blob, and generate a safe object URL.
      const blob = new Blob([rawAudioWorklet], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(blob);

      await this.audioContext.audioWorklet.addModule(workletUrl);

      URL.revokeObjectURL(workletUrl);

      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.micStream,
      );

      // Two independent worklets for mic and system audio. Each just buffers,
      // converts to Int16 and forwards its own input — echo is handled by
      // capture-time AEC + server-side dedup, so the mic worklet no longer takes
      // the system audio as a reference (no input 1).
      this.micWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor",
      );
      this.sysWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor",
      );

      // 6. Mic chunks → WebSocket
      let debugMicCounter = 0;
      let micChunksSent = 0;
      let lastMicDiagTime = Date.now();
      this.micWorkletNode.port.onmessage = (event) => {
        if (event.data?.type === "debug") {
          debugMicCounter++;
          window.dispatchEvent(
            new CustomEvent("plan-ai-audio-level", { detail: event.data }),
          );

          // Periodic diagnostic: every ~10 seconds
          if (debugMicCounter % 100 === 0) {
            const elapsed = ((Date.now() - lastMicDiagTime) / 1000).toFixed(1);
            console.log(`[AudioRecorder] 📊 Mic pipeline stats:`, {
              debugEvents: debugMicCounter,
              chunksSent: micChunksSent,
              rmsMic: event.data.rmsMic?.toFixed(4),
              elapsed: `${elapsed}s`,
              wsState: this.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][this.ws.readyState] : 'null',
              micTrackState: this.micStream?.getAudioTracks()[0]?.readyState ?? 'n/a',
              micTrackMuted: this.micStream?.getAudioTracks()[0]?.muted ?? 'n/a',
            });
          }
          return;
        }
        if (!(event.data instanceof ArrayBuffer)) return;
        // Buffer pre-codec mic PCM for offline AEC (independent of the WS, so a
        // reconnect gap doesn't punch a hole in the buffered timeline).
        this.bufferPcmForAec("mic", event.data);
        if (
          this.state !== "recording" ||
          !this.ws ||
          this.ws.readyState !== WebSocket.OPEN
        )
          return;

        const base64Audio = this.bufferToBase64(event.data);
        if (!base64Audio) return;

        micChunksSent++;

        this.ws.send(
          JSON.stringify({
            type: "input_audio",
            source: "mic",
            audio: base64Audio,
          }),
        );
      };

      // 7. System audio chunks → WebSocket
      this.sysWorkletNode.port.onmessage = (event) => {
        if (event.data?.type === "debug") {
          // sysWorkletNode gets system audio on inputs[0], so its 'rmsMic' is actually the system audio level
          window.dispatchEvent(
            new CustomEvent("plan-ai-audio-level", {
              detail: { type: "debug", rmsSys: event.data.rmsMic },
            }),
          );
          return;
        }
        if (!(event.data instanceof ArrayBuffer)) return;
        // Buffer pre-codec system (reference) PCM for offline AEC — but only on
        // the Windows/Linux path where this worklet input IS the live capture.
        // On macOS the reference is appended straight from the decoded chunks
        // (see sysAecTapDirect) to keep playback scheduling out of the loop.
        if (!this.sysAecTapDirect) this.bufferPcmForAec("sys", event.data);
        if (
          this.state !== "recording" ||
          !this.ws ||
          this.ws.readyState !== WebSocket.OPEN
        )
          return;

        const base64Audio = this.bufferToBase64(event.data);
        if (!base64Audio) return;
        this.ws.send(
          JSON.stringify({
            type: "input_audio",
            source: "sys",
            audio: base64Audio,
          }),
        );
      };

      // To prevent the microphone and delayed system audio from playing back through the user's speakers,
      // we must connect them to a 0-volume GainNode before hitting the destination.
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(this.audioContext.destination);

      // Keep the sys worklet's input channel permanently active (see field
      // declaration). A constant 0 mixes into the scheduled chunks unchanged,
      // but the worklet now runs every quantum and posts real-time PCM —
      // silence included — instead of a gap-compressed stream.
      this.sysKeepAliveNode = this.audioContext.createConstantSource();
      this.sysKeepAliveNode.offset.value = 0;
      this.sysKeepAliveNode.connect(this.sysWorkletNode);
      this.sysKeepAliveNode.start();

      // Connect mic graph
      this.sourceNode.connect(this.micWorkletNode, 0, 0); // mic to input 0
      this.micWorkletNode.connect(silentGain);

      // Create a destination so we record the mic audio as it leaves the worklet.
      // Loudspeaker echo is removed at capture by browser AEC (when speaker mode is
      // on); the worklet no longer ducks the signal, so this is a clean passthrough.
      const micDest = this.audioContext.createMediaStreamDestination();
      this.micWorkletNode.connect(micDest);
      this.micMediaRecorder = new MediaRecorder(micDest.stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 32_000, // 32 kbps Opus: voice-grade, ~4x smaller uploads.
      });

      this.micMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.micChunks.push(e.data);
        }
      };
      this.micMediaRecorder.onstart = () =>
        console.log("[AudioRecorder] micMediaRecorder STARTED");
      this.micMediaRecorder.onerror = (err) =>
        console.error("[AudioRecorder] micMediaRecorder ERROR", err);

      this.micMediaRecorder.start(1000);

      // Connect system audio graph
      this.sysWorkletNode.connect(silentGain);

      if (this.sysStream && this.audioContext) {
        // Windows: wire the live getDisplayMedia stream directly into the worklet
        this.sysSourceNode = this.audioContext.createMediaStreamSource(
          this.sysStream,
        );
        this.sysSourceNode.connect(this.sysWorkletNode);
      } else {
        // macOS: We must also capture this sysWorkletNode into a WebM Blob
        const macSysDest = this.audioContext.createMediaStreamDestination();
        this.sysWorkletNode.connect(macSysDest);
        this.sysChunks = [];
        this.sysMediaRecorder = new MediaRecorder(macSysDest.stream, {
          mimeType: "audio/webm;codecs=opus",
          audioBitsPerSecond: 32_000, // 32 kbps Opus: voice-grade, ~4x smaller uploads.
        });
        this.sysMediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.sysChunks.push(e.data);
        };
        this.sysMediaRecorder.start(1000);

        // macOS: poll the native binary's SIGUSR1 chunks every 2 s. The AEC
        // reference is fed from the DECODED chunks below, not the worklet.
        this.sysAecTapDirect = true;
        this.sysAudioPlaybackTime = this.audioContext.currentTime;
        this.sysAudioInterval = setInterval(async () => {
          if (
            this.state !== "recording" ||
            !this.audioContext ||
            !this.sysWorkletNode ||
            !this.micWorkletNode
          )
            return;
          try {
            const chunk = await window.electron.chunkSystemAudio();
            if (chunk && chunk.byteLength > 0) {
              const originalSize = chunk.byteLength;
              const audioBuffer = await this.audioContext.decodeAudioData(
                chunk.buffer as ArrayBuffer,
              );
              const source = this.audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.sysWorkletNode);

              if (this.sysAudioPlaybackTime < this.audioContext.currentTime) {
                // Playback fell behind → a real gap in the scheduled sys audio.
                // Counted for the AEC diagnostics (each gap used to be silently
                // DELETED from the reference before the keep-alive fix).
                this.sysChunkStats.resets += 1;
                this.sysChunkStats.gapSeconds +=
                  this.audioContext.currentTime - this.sysAudioPlaybackTime;
                this.sysAudioPlaybackTime = this.audioContext.currentTime;
              }
              source.start(this.sysAudioPlaybackTime);
              this.sysAudioPlaybackTime += audioBuffer.duration;

              // AEC reference: append the decoded capture audio DIRECTLY.
              // Chunks are contiguous capture, so concatenation IS the capture
              // timeline — playback scheduling (and its re-anchor jumps) never
              // touches the reference the canceller aligns against.
              if (this.state === "recording" && this.speakerMode && !this.aecOverCap) {
                let mono = audioBuffer.getChannelData(0);
                if (audioBuffer.numberOfChannels > 1) {
                  const ch1 = audioBuffer.getChannelData(1);
                  const mixed = new Float32Array(mono.length);
                  for (let i = 0; i < mono.length; i++) {
                    mixed[i] = (mono[i] + ch1[i]) / 2;
                  }
                  mono = mixed;
                }
                const int16 = new Int16Array(mono.length);
                for (let i = 0; i < mono.length; i++) {
                  const s = Math.max(-1, Math.min(1, mono[i]));
                  int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                this.bufferPcmForAec("sys", int16.buffer);
              }

              this.sysChunkStats.chunks += 1;
              this.sysChunkStats.decodedSeconds += audioBuffer.duration;
              // Periodic pipeline health (~30s at the 2s chunk cadence): buffered
              // AEC seconds vs wall clock. sysBuf should track wall; a growing
              // deficit means the reference timeline is compressing again.
              if (this.sysChunkStats.chunks % 15 === 0) {
                const wall = (Date.now() - this.recStartWallMs) / 1000;
                const s = this.sysChunkStats;
                console.log(
                  `[AudioRecorder] 📊 sys pipeline: chunks=${s.chunks} decoded=${s.decodedSeconds.toFixed(1)}s ` +
                    `resets=${s.resets} gaps=${s.gapSeconds.toFixed(1)}s | aecBuf mic=${(
                      this.aecMicSamples / AudioRecorder.AEC_RATE
                    ).toFixed(1)}s sys=${(this.aecSysSamples / AudioRecorder.AEC_RATE).toFixed(1)}s ` +
                    `wall=${wall.toFixed(1)}s`,
                );
              }
            }
          } catch (err) {
            console.error(
              "[AudioRecorder] Failed to decode system audio chunk:",
              err instanceof Error ? err.message : err,
            );
          }
        }, 2000);
      }
    } catch (err) {
      console.error(
        "[AudioRecorder] Critical start failure:",
        err instanceof Error
          ? `${err.message}\n${err.stack}`
          : JSON.stringify(err),
      );
      this.cleanup();
      this.options.onError(
        err instanceof Error ? err : new Error("Failed to start audio."),
      );
    }
  }

  /**
   * Request system audio on Windows/Linux via the Web getDisplayMedia API.
   * Electron's desktopCapturer populates `chromeMediaSources` so we can request
   * the primary screen's audio without additional user interaction (they already
   * selected sources on the Home screen).
   *
   * Returns true on success, false if the user denied or the API is unavailable.
   */
  private async startWindowsSysAudio(): Promise<boolean> {
    try {
      const config = loadConfig();
      const sourceId = config?.systemSourceId ?? null;

      // Build the constraints. If we have a specific screen source chosen on the
      // Home page, pass it through; otherwise Electron will show the picker.
      const constraints: MediaStreamConstraints = {
        audio: sourceId
          ? ({
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            } as any)
          : false,
        video: sourceId
          ? ({
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            } as any)
          : false,
      };

      this.sysStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Drop the video track if one was included (we only needed audio)
      this.sysStream.getVideoTracks().forEach((t) => t.stop());

      return true;
    } catch (err) {
      console.warn(
        "[AudioRecorder] getDisplayMedia for system audio failed (user may have denied):",
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  async stop(): Promise<{ micBlob?: Blob; sysBlob?: Blob }> {
    if (this.state !== "recording") return {};
    this.state = "stopping";
    // Buffering effectively ends here (worklets are severed below); stamp it so
    // the AEC diagnostics compare buffered seconds against the true window.
    this.recStopWallMs = Date.now();

    // Cancel any pending auto-reconnect — we're stopping on purpose.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    // Sever the inputs to the Worklet so no new audio is sent to OpenAI
    if (this.micWorkletNode) this.micWorkletNode.port.onmessage = null;
    if (this.sysWorkletNode) this.sysWorkletNode.port.onmessage = null;

    // Grace period: allow OpenAI's Realtime API 2.5 seconds to flush the final pending
    // audio buffer transcriptions back to us over the WebSocket!
    await new Promise((resolve) => setTimeout(resolve, 2500));

    return new Promise((resolve) => {
      let micBlob: Blob | undefined;
      let sysBlob: Blob | undefined;

      let pendingRecorders = 0;

      const checkDone = () => {
        if (pendingRecorders !== 0) return;
        // Offline echo cancellation on the buffered pre-codec PCM. Runs once the
        // recorders have flushed (worklets already detached, so the buffers are
        // final). On success the cleaned mic replaces the raw blob that gets
        // uploaded as rawMicUrl, so the re-diarized transcript is echo-free; on
        // any failure/self-check-reject we keep the raw mic (never worse).
        void (async () => {
          if (micBlob) {
            const cleaned = await this.runAecOnBuffers().catch(() => null);
            if (cleaned) micBlob = cleaned;
          }
          this.cleanup();
          this.options.onStop();
          resolve({ micBlob, sysBlob });
        })();
      };

      if (this.micMediaRecorder && this.micMediaRecorder.state !== "inactive") {
        pendingRecorders++;
        this.micMediaRecorder.onstop = () => {
          micBlob = new Blob(this.micChunks, { type: "audio/webm" });
          pendingRecorders--;
          checkDone();
        };
        this.micMediaRecorder.stop();
      }

      if (this.sysMediaRecorder && this.sysMediaRecorder.state !== "inactive") {
        pendingRecorders++;
        this.sysMediaRecorder.onstop = () => {
          sysBlob = new Blob(this.sysChunks, { type: "audio/webm" });
          pendingRecorders--;
          checkDone();
        };
        this.sysMediaRecorder.stop();
      }

      // If no media recorders are running (e.g. macOS sys audio doesn't use it yet)
      if (pendingRecorders === 0) {
        checkDone();
      }
    });
  }

  private cleanup(): void {
    if (this.sourceNode) this.sourceNode.disconnect();
    if (this.sysSourceNode) this.sysSourceNode.disconnect();
    if (this.micWorkletNode) this.micWorkletNode.disconnect();
    if (this.sysWorkletNode) this.sysWorkletNode.disconnect();
    if (this.sysKeepAliveNode) {
      try {
        this.sysKeepAliveNode.stop();
      } catch {
        /* already stopped */
      }
      this.sysKeepAliveNode.disconnect();
    }

    this.sourceNode = null;
    this.sysSourceNode = null;
    this.micWorkletNode = null;
    this.sysWorkletNode = null;
    this.sysKeepAliveNode = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
    this.audioContext = null;

    if (this.sysAudioInterval) {
      clearInterval(this.sysAudioInterval);
      this.sysAudioInterval = null;
    }
    this.sysAudioPlaybackTime = 0;

    // Stop Windows getDisplayMedia stream
    if (this.sysStream) {
      this.sysStream.getTracks().forEach((t) => t.stop());
      this.sysStream = null;
    }

    // Stop macOS native binary
    if (window.electron.stopSystemAudio) {
      window.electron.stopSystemAudio().catch(console.error);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    // Release AEC PCM buffers.
    this.aecMicPcm = [];
    this.aecSysPcm = [];
    this.aecMicSamples = 0;
    this.aecSysSamples = 0;
    this.aecOverCap = false;

    this.state = "idle";
  }

  changeLanguage(language: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "change_language", language }));
    } else {
      console.warn(
        "[AudioRecorder] Cannot change language: WebSocket not open",
      );
    }
  }

  /**
   * Flip browser AEC on/off live during a recording (speaker ↔ headphones).
   * AEC is baked into the device at getUserMedia time, so we re-acquire the mic
   * with the new constraint and hot-swap the source feeding micWorkletNode
   * input 0. The processed-output chain (micWorkletNode → micDest →
   * micMediaRecorder) is left untouched, so the saved blob and live transcript
   * continue seamlessly.
   * No-op when idle — start() will pick up the persisted choice via loadConfig.
   */
  async setSpeakerMode(enabled: boolean): Promise<void> {
    this.speakerMode = enabled;

    if (
      this.state !== "recording" ||
      !this.audioContext ||
      !this.micWorkletNode
    ) {
      return;
    }

    const micDeviceId = loadConfig()?.micDeviceId;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Same platform-aware decision as start(): on macOS the mic stays
          // raw regardless of speaker mode (see micProcessingConstraints).
          ...this.micProcessingConstraints(),
          autoGainControl: false,
          ...(micDeviceId && micDeviceId !== "default"
            ? { deviceId: { exact: micDeviceId } }
            : {}),
        },
        video: false,
      });

      // Wire the new source in before tearing the old one down so input 0 is
      // never starved (a brief overlap is inaudible; a gap would drop audio).
      const newSource = this.audioContext.createMediaStreamSource(newStream);
      newSource.connect(this.micWorkletNode, 0, 0);

      if (this.sourceNode) this.sourceNode.disconnect();
      this.micStream?.getTracks().forEach((t) => t.stop());

      this.sourceNode = newSource;
      this.micStream = newStream;

      const micTrack = newStream.getAudioTracks()[0];
      micTrack.onended = () =>
        console.error(
          `[AudioRecorder] ⚠️ Mic track ENDED unexpectedly! (label: ${micTrack.label})`,
        );
      console.log(
        `[AudioRecorder] 🔁 Speaker mode → ${enabled} (AEC=${enabled}); mic re-acquired, echoCancellation=${micTrack.getSettings().echoCancellation}`,
      );
    } catch (err) {
      console.error(
        "[AudioRecorder] Failed to re-acquire mic for speaker-mode change (keeping current stream):",
        err instanceof Error ? err.message : err,
      );
    }
  }
  private async initializeWebSocket(): Promise<void> {
    const config = loadConfig();
    this.ws = await this.options.api.startAudioStream(
      config?.language,
      config?.contextIds,
      config?.projectIds,
    );

    if (this.ws) {
      this.ws.onopen = () => {
        // Reconnected successfully after a drop — clear backoff + notify UI.
        if (this.reconnectAttempts > 0) {
          this.reconnectAttempts = 0;
          this.options.onReconnected?.();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            this.options.onTranscript(data.source, data.text, data.isFinal);
          } else if (
            data.type === "speech_started" ||
            data.type === "utterance_end"
          ) {
            if (this.options.onSpeechEvent) {
              this.options.onSpeechEvent(data.source, data.type);
            }
          } else if (data.type === "error") {
            this.lastTypedError = {
              code: typeof data.code === "string" ? data.code : undefined,
              provider: typeof data.provider === "string" ? data.provider : undefined,
              message: typeof data.message === "string" ? data.message : "Unknown error",
            };
            Sentry.captureException(new Error(`WS backend error: ${this.lastTypedError.message}`), {
              tags: {
                source: "audio_stream_ws",
                code: this.lastTypedError.code ?? "unknown",
                provider: this.lastTypedError.provider ?? "unknown",
              },
            });
            const err = new Error(this.lastTypedError.message) as Error & {
              code?: string;
              provider?: string;
            };
            err.code = this.lastTypedError.code;
            err.provider = this.lastTypedError.provider;
            this.options.onError(err);
          }
        } catch (e) {
          console.error(
            "Failed to parse WebSocket message",
            e instanceof Error ? e.message : e,
          );
        }
      };

      this.ws.onerror = (e) => {
        const errorDetails =
          e instanceof Event
            ? `Type: ${e.type}, isTrusted: ${e.isTrusted}`
            : String(e);
        console.error(`WebSocket error encountered. Details: ${errorDetails}`);

        // Fatal config/billing errors won't fix themselves — surface them and
        // don't loop reconnecting. Network/transport errors → auto-reconnect.
        if (this.lastTypedError && this.isFatalError(this.lastTypedError.code)) {
          const err = new Error(this.lastTypedError.message) as Error & {
            code?: string;
            provider?: string;
          };
          err.code = this.lastTypedError.code;
          err.provider = this.lastTypedError.provider;
          this.options.onError(err);
        } else if (this.state !== "stopping") {
          this.options.onDisconnect?.();
          this.scheduleReconnect();
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed.");
        if (this.state !== "stopping" && !(this.lastTypedError && this.isFatalError(this.lastTypedError.code))) {
          this.options.onDisconnect?.();
          this.scheduleReconnect();
        }
      };
    }
  }

  /** Config/billing errors that reconnecting can't recover from. */
  private isFatalError(code?: string): boolean {
    return (
      code === "MISSING_API_KEY" ||
      code === "INVALID_API_KEY" ||
      code === "USAGE_LIMIT_EXCEEDED" ||
      code === "SUBSCRIPTION_REQUIRED"
    );
  }

  /**
   * Auto-reconnect with exponential backoff (1s, 2s, 4s … capped at 30s),
   * retrying for as long as we're still recording. Audio keeps recording
   * throughout, so nothing is lost while we're offline.
   */
  private scheduleReconnect(): void {
    if (this.state !== "recording") return;
    if (this.reconnectTimer) return; // already scheduled

    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      AudioRecorder.MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.options.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.state !== "recording") return;
      try {
        await this.reconnect();
        // onopen resets attempts + fires onReconnected. If the socket fails to
        // open, its onclose/onerror will schedule the next attempt.
      } catch (err) {
        console.error("Reconnect attempt failed, will retry:", err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  async reconnect(): Promise<void> {
    if (this.state !== "recording") return;

    // Cleanup old socket if any
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    await this.initializeWebSocket();
  }
}
