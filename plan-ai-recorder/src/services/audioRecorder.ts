import { createPlanAiApi } from "./planAiApi";
import { loadConfig } from "../utils/recorderConfig";

// @ts-ignore
import rawAudioWorklet from "../../public/audioWorklet.js?raw";

type PlanAiApi = ReturnType<typeof createPlanAiApi>;

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
  /** Called on any error */
  onError: (error: Error) => void;
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
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private sysSourceNode: MediaStreamAudioSourceNode | null = null; // Windows web audio source
  private ws: WebSocket | null = null;
  private sysAudioInterval: ReturnType<typeof setInterval> | null = null;
  private sysAudioPlaybackTime: number = 0;

  private micMediaRecorder: MediaRecorder | null = null;
  private sysMediaRecorder: MediaRecorder | null = null;
  private micChunks: Blob[] = [];
  private sysChunks: Blob[] = [];

  private state: RecorderState = "idle";
  private options: AudioRecorderOptions;

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

  async start(): Promise<void> {
    if (this.state !== "idle") return;

    try {
      this.state = "recording";

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
      console.log(`[AudioRecorder] 🎤 Requesting mic with deviceId: "${micDeviceId}"`);
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
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
      // so that we can record the processed audio (with ducking/AEC applied) instead of the raw mic stream.
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

      // Two independent worklets for mic and system audio in parallel
      // micWorkletNode has 2 inputs: [0] = mic, [1] = sys (for echo suppression)
      this.micWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor",
        {
          numberOfInputs: 2,
        },
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

      // Connect mic graph
      this.sourceNode.connect(this.micWorkletNode, 0, 0); // mic to input 0
      this.micWorkletNode.connect(silentGain);

      // Create a destination so we can record the PROCESSED mic audio (with ducking/AEC applied)
      // instead of the raw mic stream that still has the loudspeaker echo in it.
      const micDest = this.audioContext.createMediaStreamDestination();
      this.micWorkletNode.connect(micDest);
      this.micMediaRecorder = new MediaRecorder(micDest.stream, {
        mimeType: "audio/webm;codecs=opus",
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

        // Route system audio into micWorkletNode for Echo Suppression!
        this.sysSourceNode.connect(this.micWorkletNode, 0, 1);
      } else {
        // macOS: We must also capture this sysWorkletNode into a WebM Blob
        const macSysDest = this.audioContext.createMediaStreamDestination();
        this.sysWorkletNode.connect(macSysDest);
        this.sysChunks = [];
        this.sysMediaRecorder = new MediaRecorder(macSysDest.stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        this.sysMediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.sysChunks.push(e.data);
        };
        this.sysMediaRecorder.start(1000);

        // macOS: poll the native binary's SIGUSR1 chunks every 2 s
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

              // Route system audio into micWorkletNode for Echo Suppression!
              source.connect(this.micWorkletNode, 0, 1);

              if (this.sysAudioPlaybackTime < this.audioContext.currentTime) {
                this.sysAudioPlaybackTime = this.audioContext.currentTime;
              }
              source.start(this.sysAudioPlaybackTime);
              this.sysAudioPlaybackTime += audioBuffer.duration;
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
        if (pendingRecorders === 0) {
          this.cleanup();
          this.options.onStop();
          resolve({ micBlob, sysBlob });
        }
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

    this.sourceNode = null;
    this.sysSourceNode = null;
    this.micWorkletNode = null;
    this.sysWorkletNode = null;

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
  private async initializeWebSocket(): Promise<void> {
    const config = loadConfig();
    this.ws = await this.options.api.startAudioStream(config?.language);

    if (this.ws) {
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
            this.options.onError(new Error(data.message));
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
        console.error(
          `WebSocket error encountered. Details: ${errorDetails}`,
        );
        this.options.onError(
          new Error(
            "Audio streaming connection failed. Check your network or VPN.",
          ),
        );
        if (this.state !== "stopping") {
          this.options.onDisconnect?.();
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed.");
        if (this.state !== "stopping") {
          this.options.onDisconnect?.();
        }
      };
    }
  }

  async reconnect(): Promise<void> {
    if (this.state !== "recording") return;
    
    // Cleanup old socket if any
    if (this.ws) {
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
