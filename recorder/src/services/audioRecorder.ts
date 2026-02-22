export type RecorderState = "idle" | "recording" | "stopping";

interface ChunkAccumulator {
  micDone: boolean;
  sysDone: boolean;
  micBlob?: Blob;
  sysBlob?: Blob;
  emitted: boolean;
}

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
  private micStream: MediaStream | null = null;
  private sysStream: MediaStream | null = null;

  private state: RecorderState = "idle";
  private options: AudioRecorderOptions;
  private isMacNativeSysAudio = false;

  private activeRecorders: Set<MediaRecorder> = new Set();
  private micRecorder: MediaRecorder | null = null;
  private sysRecorder: MediaRecorder | null = null;
  private mimeType = "";
  private chunkTimer: ReturnType<typeof setInterval> | null = null;

  private currentChunk: ChunkAccumulator | null = null;

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
          if (navigator.userAgent.includes("Mac OS X")) {
            console.log("[AudioRecorder] Requesting macOS native system audio...");
            await window.electron.startSystemAudio();
            this.isMacNativeSysAudio = true;
          } else {
            console.log("[AudioRecorder] Requesting system audio for source:", systemSourceId);
            const raw = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: systemSourceId,
                } as any,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
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
          }
        } catch (sysErr) {
          console.error("[AudioRecorder] System audio acquisition failed:", sysErr);
          this.sysStream = null;
        }
      }

      // 3. Final Check
      if (!this.micStream && !this.sysStream && !this.isMacNativeSysAudio) {
        throw new Error("No audio sources could be started. Check Mic permissions.");
      }

      console.log("[AudioRecorder] Final active streams:", {
        mic: !!this.micStream,
        sys: !!this.sysStream,
        macNative: this.isMacNativeSysAudio,
      });
      this.mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(this.mimeType)) {
        this.mimeType = "audio/webm";
      }

      this.state = "recording";

      // Hardware handoff delay
      await new Promise((r) => setTimeout(r, 500));

      // Start the chunking timer
      const chunkDuration = 5_000;
      this.chunkTimer = setInterval(() => {
        if (this.state === "recording") {
          this.startNextChunk();
        }
      }, chunkDuration);

      // Start the first chunk immediately
      this.currentChunk = {
        micDone: !this.micStream,
        sysDone: !(this.sysStream || this.isMacNativeSysAudio),
        emitted: false,
      };
      this.spawnRecorders(this.currentChunk);
    } catch (err) {
      console.error("[AudioRecorder] Critical start failure:", err);
      this.cleanup();
      this.options.onError(err instanceof Error ? err : new Error("Failed to start audio."));
    }
  }

  private startNextChunk() {
    if (this.state !== "recording") return;

    // The chunk that is currently finishing
    const finishingChunk = this.currentChunk;

    // Create new chunk for the upcoming 5 seconds
    this.currentChunk = {
      micDone: !this.micStream,
      sysDone: !(this.sysStream || this.isMacNativeSysAudio),
      emitted: false,
    };

    // 1. Ask active recorders to stop and dump data into the finishingChunk
    if (this.micRecorder?.state === "recording") {
      this.micRecorder.stop();
    }
    if (this.sysRecorder?.state === "recording") {
      this.sysRecorder.stop();
    }

    // 2. Trigger macOS native audio chunk retrieval for the finishingChunk
    if (this.isMacNativeSysAudio && finishingChunk) {
      console.log("[AudioRecorder] Requesting system audio chunk from IPC...");
      window.electron
        .chunkSystemAudio()
        .then((sysBuffer) => {
          if (sysBuffer && sysBuffer.length > 0) {
            console.log(
              `[AudioRecorder] Received system buffer from IPC, length=${sysBuffer.length}`,
            );
            finishingChunk.sysBlob = new Blob([sysBuffer as any], { type: "audio/mp4" });
          } else {
            console.warn("[AudioRecorder] IPC chunkSystemAudio returned null/empty buffer.");
          }
          finishingChunk.sysDone = true;
          this.checkEmit(finishingChunk);
        })
        .catch((err) => {
          console.error("[AudioRecorder] Error chunking macOS native audio:", err);
          finishingChunk.sysDone = true;
          this.checkEmit(finishingChunk);
        });
    }

    // The onstop handlers (and the interval hook) will spawn new recorders for the next chunk
    if (this.currentChunk) {
      this.spawnRecorders(this.currentChunk);
    }
  }

  private checkEmit(chunk: ChunkAccumulator) {
    if (!chunk) return;
    if (chunk.micDone && chunk.sysDone && !chunk.emitted) {
      chunk.emitted = true;
      if (chunk.micBlob || (chunk.sysBlob && chunk.sysBlob.size > 0)) {
        console.log(
          `[AudioRecorder] Emitting pair: micSize=${chunk.micBlob?.size ?? 0}, sysSize=${chunk.sysBlob?.size ?? 0}`,
        );
        this.options.onChunk({ mic: chunk.micBlob, system: chunk.sysBlob });
      } else {
        console.log("[AudioRecorder] CheckEmit had no blobs to emit.");
      }
    }
  }

  private spawnRecorders(targetChunk: ChunkAccumulator) {
    // Spawn Mic Recorder
    if (this.micStream) {
      const micRec = new MediaRecorder(this.micStream, { mimeType: this.mimeType });
      this.activeRecorders.add(micRec);

      micRec.ondataavailable = (e) => {
        if (e.data.size > 0) targetChunk.micBlob = e.data;
      };

      micRec.onstop = () => {
        this.activeRecorders.delete(micRec);
        targetChunk.micDone = true;
        this.checkEmit(targetChunk);
        this.checkGlobalStop();
      };

      micRec.onerror = (e) => this.options.onError(new Error(`Mic error: ${String(e)}`));
      micRec.start();
      this.micRecorder = micRec;
    }

    // Spawn Browser System Recorder (Windows)
    if (this.sysStream) {
      const audioTracks = this.sysStream.getAudioTracks();
      const liveTracks = audioTracks.filter((t) => t.readyState === "live");

      if (liveTracks.length > 0) {
        const cleanStream = new MediaStream(liveTracks); // Use cleanStream for recorder
        const sysRec = new MediaRecorder(cleanStream, { mimeType: this.mimeType });
        this.activeRecorders.add(sysRec);

        sysRec.ondataavailable = (e) => {
          if (e.data.size > 0) targetChunk.sysBlob = e.data;
        };
        sysRec.onstop = () => {
          this.activeRecorders.delete(sysRec);
          targetChunk.sysDone = true;
          this.checkEmit(targetChunk);
          this.checkGlobalStop();
        };
        sysRec.onerror = (e) => console.error("Sys recording error", e);
        sysRec.start();
        this.sysRecorder = sysRec;
      } else {
        targetChunk.sysDone = true;
        this.checkEmit(targetChunk);
      }
    }
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
    if (this.chunkTimer) clearInterval(this.chunkTimer);

    if (this.isMacNativeSysAudio) {
      window.electron
        .stopSystemAudio()
        .then((sysBuffer) => {
          let sysBlob: Blob | undefined;
          if (sysBuffer) {
            sysBlob = new Blob([sysBuffer as any], { type: "audio/mp4" });
          }
          if (sysBlob) {
            this.options.onChunk({ system: sysBlob });
          }
          this.checkGlobalStop();
        })
        .catch((err) => {
          console.error("[AudioRecorder] Error stopping macOS native audio:", err);
          this.checkGlobalStop();
        });
    } else {
      // Ensure stop fires if there were no active recorders somehow
      this.checkGlobalStop();
    }
  }

  private cleanup(): void {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.sysStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.sysStream = null;
    this.activeRecorders.clear();
    this.micRecorder = null;
    this.sysRecorder = null;
    this.isMacNativeSysAudio = false;
    this.state = "idle";
  }
}
