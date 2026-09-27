import LiveAudioStream from "react-native-live-audio-stream";

/**
 * The only module that talks to react-native-live-audio-stream.
 *
 * The native capture is one shared resource. Before this existed, the meeting
 * recorder and the Assistant's dictation each called `LiveAudioStream.on`,
 * `init`, `start` and `stop` themselves. The library's `on()` removed every
 * other listener, so opening Assistant once silently disconnected the next
 * meeting from the microphone: no audio saved, no transcript, and an empty
 * file uploaded while the screen said "Listening..." (audit 2026-09-27).
 *
 * Now there is one native listener, consumers subscribe here, and whoever
 * wants the microphone asks for it. A meeting always wins: dictation is
 * refused while a meeting records, and a meeting that starts takes the
 * microphone from dictation (which is told through the "preempted" event).
 */

export type CaptureOwner = "meeting" | "dictation";

export type CaptureEvent =
  | { type: "interrupted"; reason?: string }
  | { type: "resumed" }
  | { type: "error"; message: string }
  | { type: "preempted"; owner: CaptureOwner };

type DataListener = (base64Pcm: string) => void;
type EventListener = (event: CaptureEvent) => void;

// Kept on the global object so the native init flag and the single native
// listener survive Fast Refresh in development.
const g = global as {
  __isAudioInitialized?: boolean;
  __audioCaptureBound?: boolean;
  __audioCaptureDispatch?: {
    data: (d: string) => void;
    event: (e: CaptureEvent) => void;
  };
};

export const CAPTURE_SAMPLE_RATE = 24000;

class AudioCapture {
  private owner: CaptureOwner | null = null;
  private dataListeners = new Set<DataListener>();
  private eventListeners = new Set<EventListener>();

  constructor() {
    // The native listeners are registered once per app process and dispatch
    // to whichever instance is current (Fast Refresh creates new instances).
    g.__audioCaptureDispatch = {
      data: (d) => this.dataListeners.forEach((l) => l(d)),
      event: (e) => this.eventListeners.forEach((l) => l(e)),
    };
  }

  private ensureNative() {
    if (!g.__isAudioInitialized) {
      LiveAudioStream.init({
        sampleRate: CAPTURE_SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 1, // MIC (ambient room audio)
        bufferSize: 4096,
        wavFile: "unused.wav", // required by the typings, not written natively
      });
      g.__isAudioInitialized = true;
    }
    if (g.__audioCaptureBound) return;
    g.__audioCaptureBound = true;
    // Around an interruption iOS can flush an empty buffer: not audio.
    LiveAudioStream.on("data", (d: string) => {
      if (d) g.__audioCaptureDispatch?.data(d);
    });
    // Events added by our patch (patches/react-native-live-audio-stream+*.patch).
    // Registered one by one so a build without the patch still records.
    const extra: [string, (payload: unknown) => CaptureEvent][] = [
      [
        "interrupted",
        (p) => ({ type: "interrupted", reason: (p as { reason?: string } | null)?.reason }),
      ],
      ["resumed", () => ({ type: "resumed" })],
      [
        "error",
        (p) => ({
          type: "error",
          message: (p as { message?: string } | null)?.message ?? "Audio capture error",
        }),
      ],
    ];
    for (const [name, toEvent] of extra) {
      try {
        (LiveAudioStream.on as unknown as (e: string, cb: (p: unknown) => void) => void)(
          name,
          (payload) => g.__audioCaptureDispatch?.event(toEvent(payload)),
        );
      } catch {
        // Unpatched library: only "data" exists.
      }
    }
  }

  get activeOwner(): CaptureOwner | null {
    return this.owner;
  }

  /**
   * Starts the microphone for `owner`. Returns false when dictation asks
   * while a meeting is recording.
   */
  acquire(owner: CaptureOwner): boolean {
    if (this.owner === owner) return true;
    if (this.owner === "meeting" && owner === "dictation") return false;
    this.ensureNative();
    const previous = this.owner;
    this.owner = owner;
    if (previous) {
      // Dictation loses the microphone to a meeting. Capture keeps running.
      this.eventListeners.forEach((l) => l({ type: "preempted", owner: previous }));
      return true;
    }
    LiveAudioStream.start();
    return true;
  }

  release(owner: CaptureOwner): void {
    if (this.owner !== owner) return;
    this.owner = null;
    // Not awaited: without our patch the Android module never resolves it.
    void Promise.resolve(LiveAudioStream.stop()).catch(() => undefined);
  }

  /** Stops and starts the native capture again (used when no audio arrives). */
  restart(): void {
    if (!this.owner) return;
    void Promise.resolve(LiveAudioStream.stop()).catch(() => undefined);
    setTimeout(() => {
      if (this.owner) LiveAudioStream.start();
    }, 300);
  }

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }
}

export const audioCapture = new AudioCapture();
