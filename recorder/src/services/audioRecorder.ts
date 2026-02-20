export type RecorderState = "idle" | "recording" | "stopping";

export interface AudioRecorderOptions {
  /** Called with each ~30s audio chunk ready for transcription */
  onChunk: (blob: Blob) => void;
  /** Called when recording fully stops and all chunks are flushed */
  onStop: () => void;
  /** Called on any error */
  onError: (error: Error) => void;
}

/**
 * AudioRecorder manages microphone + optional system audio capture.
 *
 * System audio is captured via Electron's desktopCapturer (IPC) using a
 * chromeMediaSourceId. The two streams are mixed using the Web Audio API
 * before being fed into MediaRecorder at 5-second intervals.
 */
export class AudioRecorder {
  private activeRecorders: Set<MediaRecorder> = new Set();
  private currentRecorder: MediaRecorder | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private mimeType = "";
  private audioContext: AudioContext | null = null;
  private combinedStream: MediaStream | null = null;
  private state: RecorderState = "idle";
  private options: AudioRecorderOptions;

  constructor(options: AudioRecorderOptions) {
    this.options = options;
  }

  get currentState(): RecorderState {
    return this.state;
  }

  async start(systemSourceId?: string): Promise<void> {
    if (this.state !== "idle") return;

    try {
      // 1. Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });

      // 2. System audio (optional — requires Electron desktopCapturer source)
      let systemStream: MediaStream | null = null;
      if (systemSourceId) {
        systemStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: systemSourceId,
            },
          } as MediaTrackConstraints,
          video: false,
        });
      }

      // 3. Mix streams via AudioContext
      this.audioContext = new AudioContext();
      const destination = this.audioContext.createMediaStreamDestination();

      const micSource = this.audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      if (systemStream) {
        const systemSource = this.audioContext.createMediaStreamSource(systemStream);
        systemSource.connect(destination);
      }

      this.combinedStream = destination.stream;

      // 4. Initialize first recorder chunk
      this.mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      this.state = "recording";
      this.startNextChunk();
    } catch (err) {
      this.cleanup();
      this.options.onError(err instanceof Error ? err : new Error("Failed to start recording"));
    }
  }

  private startNextChunk(): void {
    if (this.state !== "recording" || !this.combinedStream) return;

    const recorder = new MediaRecorder(this.combinedStream, { mimeType: this.mimeType });
    this.activeRecorders.add(recorder);
    this.currentRecorder = recorder;

    recorder.ondataavailable = (event) => {
      // A bare WebM header with no audio data is usually small (e.g. under ~200-300 bytes)
      // Only emit chunks that have enough substance to be worth transcribing.
      if (event.data && event.data.size > 1000) {
        this.options.onChunk(event.data);
      }
    };

    recorder.onstop = () => {
      this.activeRecorders.delete(recorder);
      if (this.state === "stopping" && this.activeRecorders.size === 0) {
        this.cleanup();
        this.options.onStop();
      }
    };

    recorder.onerror = (event) => {
      this.options.onError(new Error(`MediaRecorder error: ${String(event)}`));
    };

    recorder.start();

    // Rotate to the next chunk in 5 seconds
    this.chunkTimer = setTimeout(() => {
      if (this.state !== "recording") return;
      if (recorder.state === "recording") {
        recorder.stop();
      }
      this.startNextChunk();
    }, 5_000);
  }

  stop(): void {
    if (this.state !== "recording") return;
    this.state = "stopping";
    if (this.chunkTimer) clearTimeout(this.chunkTimer);

    if (this.currentRecorder && this.currentRecorder.state === "recording") {
      this.currentRecorder.stop();
    } else if (this.activeRecorders.size === 0) {
      this.cleanup();
      this.options.onStop();
    }
  }

  private cleanup(): void {
    this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.combinedStream?.getTracks().forEach((t) => t.stop());
    this.combinedStream = null;
    this.activeRecorders.clear();
    this.currentRecorder = null;
    this.state = "idle";
  }
}
