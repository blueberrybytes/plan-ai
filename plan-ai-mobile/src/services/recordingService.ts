import { useEffect, useState } from "react";
import { Platform, Alert, Linking } from "react-native";
import { Buffer } from "buffer";
import LiveAudioStream from "react-native-live-audio-stream";
import { File, Paths } from "expo-file-system";
import { setAudioModeAsync } from "expo-audio";
import notifee, { AndroidImportance } from "@notifee/react-native";
import * as Sentry from "@sentry/react-native";

// Using the global object so the native audio lock + foreground-service handle
// survive React Native Fast Refresh (HMR) without being dropped.
const g = global as any;

/**
 * Minimal slice of the Plan AI API client the recording session needs. Passed
 * in on start() so this module stays decoupled from the AuthContext/React tree.
 */
export interface RecordingApi {
  startAudioStream: (
    language: string,
    contextIds: string[],
    projectIds?: string[],
  ) => Promise<WebSocket>;
}

export interface StartRecordingOptions {
  language: string;
  contextIds: string[];
  projectId: string | null;
  api: RecordingApi;
}

/** Immutable snapshot the UI subscribes to. */
export interface RecordingSnapshot {
  isRecording: boolean;
  isSpeaking: boolean;
  transcript: string;
  interim: string;
  currentVolume: number;
  isWsConnected: boolean;
  isConnectingWs: boolean;
  wsUnrecoverable: boolean;
  audioBackupPath: string | null;
  language: string;
}

const INITIAL_SNAPSHOT: RecordingSnapshot = {
  isRecording: false,
  isSpeaking: false,
  transcript: "",
  interim: "",
  currentVolume: 0,
  isWsConnected: true,
  isConnectingWs: false,
  wsUnrecoverable: false,
  audioBackupPath: null,
  language: "",
};

const WAV_HEADER_24K_BASE64 =
  "UklGRv////9XQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0Yf////8=";

/**
 * Owns the live recording session — native audio capture, the transcription
 * WebSocket, the Android foreground service, and the on-disk WAV backup —
 * OUTSIDE the React component tree. Because it's a module-level singleton, the
 * session keeps running when the record screen unmounts (navigation away, app
 * backgrounded, phone locked). The screen subscribes via `useRecordingSession`
 * and re-attaches to the in-progress session when it remounts.
 */
class RecordingService {
  private snapshot: RecordingSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();

  private ws: WebSocket | null = null;
  private api: RecordingApi | null = null;
  private contextIds: string[] = [];
  private projectId: string | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dataListenerBound = false;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private chunkCount = 0;

  // ---- external store contract -------------------------------------------

  getSnapshot = (): RecordingSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<RecordingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- websocket ----------------------------------------------------------

  private connectWebSocket = async () => {
    if (this.snapshot.isConnectingWs || !this.api) return;
    this.set({ isConnectingWs: true });
    try {
      const ws = await this.api.startAudioStream(
        this.snapshot.language,
        this.contextIds,
        this.projectId ? [this.projectId] : undefined,
      );
      this.ws = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket Connected!");
        this.set({ isWsConnected: true, isConnectingWs: false });
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "transcript") {
            const speakerStr = msg.isFinal ? `[${msg.speaker || "Speaker"}]` : "";
            if (msg.isFinal) {
              const prev = this.snapshot.transcript;
              this.set({
                transcript: prev + `${prev ? "\n" : ""}${speakerStr} ${msg.text}`,
                interim: "",
              });
            } else {
              this.set({ interim: `${speakerStr} ${msg.text}` });
            }
          } else if (msg.type === "speech_started") {
            this.set({ isSpeaking: true });
          } else if (msg.type === "utterance_end") {
            this.set({ isSpeaking: false });
          } else if (msg.type === "error") {
            this.handleWsBackendError(msg);
          }
        } catch (e) {
          console.error("[WS Data Handling Error]", e);
        }
      };

      ws.onclose = () => {
        console.log("WS Stream Closed (Network disconnected). Local WAV continues recording.");
        this.set({ isWsConnected: false, isConnectingWs: false });
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("Failed to initialize WS (offline):", e);
      this.set({ isWsConnected: false, isConnectingWs: false });
      this.scheduleReconnect();
    }
  };

  private handleWsBackendError(msg: any) {
    console.error("[WS Error from Backend]", msg.message);
    const isKeyIssue = msg.code === "MISSING_API_KEY" || msg.code === "INVALID_API_KEY";
    const isQuotaIssue = msg.code === "USAGE_LIMIT_EXCEEDED";
    const isSubIssue = msg.code === "SUBSCRIPTION_REQUIRED";
    Sentry.captureException(
      new Error(`WS backend error: ${msg.message ?? "(no message)"}`),
      {
        tags: {
          source: "audio_stream_ws",
          code: msg.code ?? "unknown",
          provider: msg.provider ?? "unknown",
        },
      },
    );

    const webAppUrl =
      process.env.EXPO_PUBLIC_PLAN_AI_WEB_URL ?? "https://plan-ai.blueberrybytes.com";

    if (isKeyIssue) {
      // Unrecoverable from inside the app — stop the auto-reconnect loop
      this.set({ wsUnrecoverable: true });
      Alert.alert(
        "Configuration Required",
        msg.message || "Your workspace is missing a required API key.",
        [
          {
            text: "Open Workspace Settings",
            onPress: () => Linking.openURL(`${webAppUrl.replace(/\/+$/, "")}/settings/workspace`),
          },
          { text: "Dismiss", style: "cancel" },
        ],
      );
    } else if (isQuotaIssue || isSubIssue) {
      this.set({ wsUnrecoverable: true });
      Alert.alert(
        isQuotaIssue ? "Usage Limit Reached" : "Subscription Required",
        msg.message ||
          (isQuotaIssue
            ? "You've reached your monthly limit. Upgrade your plan or wait until the next billing cycle."
            : "An active subscription is required to record. Choose a plan to continue."),
        [
          {
            text: isQuotaIssue ? "Upgrade Plan" : "Choose a Plan",
            onPress: () => Linking.openURL(`${webAppUrl.replace(/\/+$/, "")}/billing`),
          },
          { text: "Dismiss", style: "cancel" },
        ],
      );
    } else {
      Alert.alert(
        "Connection Warning",
        msg.message ||
          "Lost connection to the transcription server. You can still save what you have.",
      );
    }
  }

  /** Auto-reconnect when recording but the websocket dropped (non-fatal). */
  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (
      !this.snapshot.isRecording ||
      this.snapshot.wsUnrecoverable ||
      this.snapshot.isConnectingWs
    ) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      if (this.snapshot.isRecording && !this.snapshot.isWsConnected) {
        console.log("🔄 Auto-reconnecting WebSocket...");
        this.connectWebSocket();
      }
    }, 3000);
  }

  // ---- native audio data pump --------------------------------------------

  private bindDataListener() {
    if (this.dataListenerBound) return;
    this.dataListenerBound = true;

    LiveAudioStream.on("data", (data: string) => {
      // Native capture keeps emitting even while the screen is unmounted; this
      // listener lives on the singleton so the backup WAV + live transcription
      // continue in the background.
      this.chunkCount++;

      // Append PCM payload to the on-disk emergency backup (linear write queue
      // to avoid disk races).
      this.writeQueue = this.writeQueue
        .then(() => {
          const backupFile = new File(Paths.document, "emergency_backup.wav");
          return backupFile.write(data, { encoding: "base64", append: true });
        })
        .catch((e) => console.warn("WAV append failed", e));

      // Compute a coarse volume level (throttled) for the waveform UI.
      if (this.chunkCount % 2 === 0) {
        try {
          const pcm = Buffer.from(data, "base64");
          let sum = 0;
          for (let i = 0; i < pcm.length; i += 2) {
            sum += Math.abs(pcm.readInt16LE(i));
          }
          const avg = sum / (pcm.length / 2);
          const level = Math.min(1, avg / 6000);
          this.set({ currentVolume: level });
        } catch (e) {
          console.error("[AUDIO DEBUG] Error parsing chunk:", e);
        }
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "input_audio", audio: data, source: "mic" }));
      }
    });
  }

  // ---- public lifecycle ---------------------------------------------------

  async start(opts: StartRecordingOptions): Promise<void> {
    this.api = opts.api;
    this.contextIds = opts.contextIds;
    this.projectId = opts.projectId;

    // Fresh session: clear any residue from a previous recording.
    this.chunkCount = 0;
    this.writeQueue = Promise.resolve();
    this.set({
      transcript: "",
      interim: "",
      audioBackupPath: null,
      wsUnrecoverable: false,
      isWsConnected: true,
      currentVolume: 0,
      language: opts.language,
    });

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: true,
    });

    if (Platform.OS === "android") {
      try {
        const channelId = await notifee.createChannel({
          id: "recording",
          name: "Active Recording",
          importance: AndroidImportance.HIGH,
        });
        await notifee.displayNotification({
          title: "Plan AI",
          body: "Meeting is actively recording in the background",
          android: {
            channelId,
            asForegroundService: true,
            color: "#0284c7",
            ongoing: true,
          },
        });
      } catch (err) {
        console.warn("Failed to start Android Foreground Daemon:", err);
      }
    }

    try {
      const backupFile = new File(Paths.document, "emergency_backup.wav");
      // Rebuild a clean 24000Hz WAV header to overwrite any previous trace.
      backupFile.write(WAV_HEADER_24K_BASE64, { encoding: "base64" });
    } catch (err) {
      console.warn("Failed to write WAV header", err);
    }

    await this.connectWebSocket();

    if (!g.__isAudioInitialized) {
      LiveAudioStream.init({
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 1, // 1 = MIC (ambient room audio)
        bufferSize: 4096,
        wavFile: "emergency_backup.wav",
      });
      g.__isAudioInitialized = true;
    }

    this.bindDataListener();
    LiveAudioStream.start();
    this.set({ isRecording: true });
  }

  /**
   * Stop capture and finalize. Returns true if there is data worth saving
   * (transcript text or a non-empty backup file).
   */
  async stop(): Promise<boolean> {
    let hasData = this.snapshot.transcript.length > 0;
    try {
      if (this.snapshot.isRecording) {
        // CRITICAL: do NOT await — the Android native module never resolves it.
        LiveAudioStream.stop();
        this.set({ isRecording: false });

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        if (Platform.OS === "android") {
          try {
            if (g.__resolveForegroundService) {
              g.__resolveForegroundService();
              g.__resolveForegroundService = null;
            }
            await notifee.stopForegroundService();
          } catch (err) {
            console.warn("Failed to stop Android Foreground Daemon", err);
          }
        }

        const backupFile = new File(Paths.document, "emergency_backup.wav");
        const exists = backupFile.exists;
        const size = backupFile.size;
        if (exists && size > 0) {
          this.set({ audioBackupPath: backupFile.uri });
          hasData = true;
        }
      }
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      return hasData;
    } catch (e) {
      console.error("🛑 FATAL ERROR IN STOP:", e);
      return hasData;
    }
  }

  /** Discard the in-progress session without saving (leaves no UI to resume). */
  async discard(): Promise<void> {
    try {
      if (this.snapshot.isRecording) {
        try {
          LiveAudioStream.stop();
        } catch {
          // ignore
        }
        if (Platform.OS === "android") {
          try {
            if (g.__resolveForegroundService) {
              g.__resolveForegroundService();
              g.__resolveForegroundService = null;
            }
            await notifee.stopForegroundService();
          } catch {
            // ignore
          }
        }
      }
    } finally {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }
      this.set({ ...INITIAL_SNAPSHOT });
    }
  }

  /** Switch the live transcription language mid-session. */
  changeLanguage(language: string) {
    this.set({ language });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "change_language", language }));
    }
  }

  /** Manual "Reconnect" affordance — clears the unrecoverable flag and retries. */
  reconnect() {
    if (!this.snapshot.isRecording) return;
    this.set({ wsUnrecoverable: false });
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connectWebSocket();
  }
}

export const recordingService = new RecordingService();

/**
 * Subscribe a component to the live recording session. Returns the current
 * snapshot and re-renders on every change. Because the session lives outside
 * the component tree, a screen that remounts (e.g. the user navigates back)
 * immediately sees the in-progress recording.
 */
export function useRecordingSession(): RecordingSnapshot {
  const [snap, setSnap] = useState<RecordingSnapshot>(recordingService.getSnapshot());
  useEffect(() => {
    const unsub = recordingService.subscribe(() => setSnap(recordingService.getSnapshot()));
    // Re-sync in case the session changed between the initial render and here.
    setSnap(recordingService.getSnapshot());
    return unsub;
  }, []);
  return snap;
}
