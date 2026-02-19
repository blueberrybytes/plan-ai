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
 * before being fed into MediaRecorder at 30-second intervals.
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
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

      // 4. MediaRecorder — chunk every 30 seconds
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      this.mediaRecorder = new MediaRecorder(this.combinedStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.options.onChunk(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.cleanup();
        this.options.onStop();
      };

      this.mediaRecorder.onerror = (event) => {
        this.options.onError(new Error(`MediaRecorder error: ${String(event)}`));
      };

      // Start with 30-second timeslice chunks
      this.mediaRecorder.start(30_000);
      this.state = "recording";
    } catch (err) {
      this.cleanup();
      this.options.onError(err instanceof Error ? err : new Error("Failed to start recording"));
    }
  }

  stop(): void {
    if (this.state !== "recording" || !this.mediaRecorder) return;
    this.state = "stopping";
    this.mediaRecorder.stop();
  }

  private cleanup(): void {
    this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.combinedStream?.getTracks().forEach((t) => t.stop());
    this.combinedStream = null;
    this.mediaRecorder = null;
    this.state = "idle";
  }
}
