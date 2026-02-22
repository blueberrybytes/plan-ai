export type RecorderState = "idle" | "recording" | "stopping";

export interface AudioChunk {
  mic?: Blob;
  system?: Blob;
}

export interface AudioRecorderOptions {
  /** Called with each ~5s audio chunk ready for transcription */
  onChunk: (chunks: AudioChunk) => void;
  /** Called when recording fully stops and all chunks are flushed */
  onStop: () => void;
  /** Called on any error */
  onError: (error: Error) => void;
}

/**
 * AudioRecorder manages microphone + optional system audio capture.
 *
 * System audio is captured via Electron's desktopCapturer (IPC) using a
 * chromeMediaSourceId. Instead of mixing, we maintain two separate MediaRecorders
 * and emit `{ mic, system }` blob pairs every 5 seconds.
 */
export class AudioRecorder {
  private activeRecorders: Set<MediaRecorder> = new Set();
  private micRecorder: MediaRecorder | null = null;
  private sysRecorder: MediaRecorder | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private mimeType = "";

  private micStream: MediaStream | null = null;
  private sysStream: MediaStream | null = null;

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
      // 0. Permission check
      if (window.electron.checkMicrophonePermission) {
        const hasPerm = await window.electron.checkMicrophonePermission();
        if (!hasPerm) {
          console.warn("[AudioRecorder] Microphone permission missing. System audio only mode.");
        }
      }

      // 1. Microphone (Primary)
      try {
        console.log("[AudioRecorder] Requesting Microphone (High Quality)...");
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (micErr) {
        console.warn("[AudioRecorder] High quality mic failed, trying simple mic:", micErr);
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (micErr2) {
          console.error("[AudioRecorder] All mic acquisition attempts failed:", micErr2);
          this.micStream = null;
        }
      }

      if (this.micStream) {
        console.log("[AudioRecorder] Mic stream acquired:", this.micStream.id);
      }

      // 2. System audio (Optional)
      if (systemSourceId && systemSourceId !== "none") {
        try {
          console.log("[AudioRecorder] Requesting system audio for source:", systemSourceId);
          const raw = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: systemSourceId,
              } as any,
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: systemSourceId,
              } as any,
            } as any,
          });

          this.sysStream = raw;
          console.log("[AudioRecorder] System raw stream acquired:", raw.id);

          // IMPORTANT: Do NOT call track.stop() on video tracks here, as it can kill the audio tracks on macOS/Electron.
          // Instead, we just won't include them in the MediaRecorder.
          raw.getVideoTracks().forEach((t) => {
            t.enabled = false; // "Mute" the video instead of killing the track
          });
        } catch (sysErr) {
          console.error("[AudioRecorder] System audio acquisition failed:", sysErr);
          this.sysStream = null;
        }
      }

      // 3. Final Check
      if (!this.micStream && !this.sysStream) {
        throw new Error("No audio sources could be started. Check Mic permissions.");
      }

      console.log("[AudioRecorder] Final active streams:", {
        mic: !!this.micStream,
        sys: !!this.sysStream,
      });

      this.mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(this.mimeType)) {
        this.mimeType = "audio/webm";
      }

      this.state = "recording";

      // Hardware handoff delay
      await new Promise((r) => setTimeout(r, 500));
      this.startNextChunk();
    } catch (err) {
      console.error("[AudioRecorder] Critical start failure:", err);
      this.cleanup();
      this.options.onError(err instanceof Error ? err : new Error("Failed to start audio."));
    }
  }

  private startNextChunk(): void {
    if (this.state !== "recording") return;

    let nextMicBlob: Blob | undefined;
    let nextSysBlob: Blob | undefined;

    // Check if we need to emit a pair. We'll emit once BOTH stop (or immediately if one doesn't exist)
    const pendingPair = {
      micDone: !this.micStream,
      sysDone: !this.sysStream,
      checkEmit: () => {
        if (pendingPair.micDone && pendingPair.sysDone) {
          if (nextMicBlob || nextSysBlob) {
            this.options.onChunk({ mic: nextMicBlob, system: nextSysBlob });
          }
        }
      },
    };

    if (this.micStream) {
      const micRec = new MediaRecorder(this.micStream, { mimeType: this.mimeType });
      this.activeRecorders.add(micRec);
      this.micRecorder = micRec;

      micRec.ondataavailable = (e) => {
        if (e.data && e.data.size > 1000) nextMicBlob = e.data;
      };
      micRec.onstop = () => {
        this.activeRecorders.delete(micRec);
        pendingPair.micDone = true;
        pendingPair.checkEmit();
        this.checkGlobalStop();
      };
      micRec.onerror = (e) => this.options.onError(new Error(`Mic error: ${String(e)}`));
      micRec.start();
    }

    if (this.sysStream) {
      const audioTracks = this.sysStream.getAudioTracks();
      const liveTracks = audioTracks.filter((t) => t.readyState === "live");

      if (liveTracks.length > 0) {
        try {
          // Wrap only the audio tracks in a new stream for the recorder
          const cleanStream = new MediaStream(liveTracks);
          const sysRec = new MediaRecorder(cleanStream, { mimeType: this.mimeType });
          this.activeRecorders.add(sysRec);
          this.sysRecorder = sysRec;

          sysRec.ondataavailable = (e) => {
            if (e.data && e.data.size > 100) nextSysBlob = e.data;
          };
          sysRec.onstop = () => {
            this.activeRecorders.delete(sysRec);
            pendingPair.sysDone = true;
            pendingPair.checkEmit();
            this.checkGlobalStop();
          };
          sysRec.onerror = (e) => {
            console.error("[AudioRecorder] System MediaRecorder error:", e);
            pendingPair.sysDone = true;
            pendingPair.checkEmit();
          };
          sysRec.start();
        } catch (e) {
          console.error("[AudioRecorder] Failed to start system MediaRecorder:", e);
          pendingPair.sysDone = true;
          pendingPair.checkEmit();
        }
      } else {
        console.warn("[AudioRecorder] No live system audio tracks found, skipping chunk.");
        pendingPair.sysDone = true;
        pendingPair.checkEmit();
      }
    }

    // Rotate to the next chunk in 5 seconds
    this.chunkTimer = setTimeout(() => {
      if (this.state !== "recording") return;
      if (this.micRecorder?.state === "recording") this.micRecorder.stop();
      if (this.sysRecorder?.state === "recording") this.sysRecorder.stop();
      this.startNextChunk();
    }, 5_000);
  }

  private checkGlobalStop() {
    if (this.state === "stopping" && this.activeRecorders.size === 0) {
      this.cleanup();
      this.options.onStop();
    }
  }

  stop(): void {
    if (this.state !== "recording") return;
    this.state = "stopping";
    if (this.chunkTimer) clearTimeout(this.chunkTimer);

    if (this.micRecorder?.state === "recording") this.micRecorder.stop();
    if (this.sysRecorder?.state === "recording") this.sysRecorder.stop();

    // Ensure stop fires if there were no active recorders somehow
    this.checkGlobalStop();
  }

  private cleanup(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.sysStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.sysStream = null;
    this.activeRecorders.clear();
    this.micRecorder = null;
    this.sysRecorder = null;
    this.state = "idle";
  }
}
