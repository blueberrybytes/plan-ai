import { useEffect, useState } from "react";
import { AppState, Platform, Alert, Linking } from "react-native";
import { Buffer } from "buffer";
import { Paths } from "expo-file-system";
import { setAudioModeAsync } from "expo-audio";
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from "@notifee/react-native";
import * as Sentry from "@sentry/react-native";
import { audioCapture, type CaptureEvent } from "./audioCapture";
import { Resampler24To16 } from "../utils/resample";
import {
  SAVED_SAMPLE_RATE,
  WAV_HEADER_BYTES,
  appendAudio,
  appendTranscriptLine,
  audioBytes,
  createSession,
  deleteSession,
  newSessionId,
  updateManifest,
  type MeetingCalendarEvent,
  type RecordingBookmark,
} from "./recordingSessions";
import { liveTranslationStore } from "./liveTranslationStore";
import {
  PhraseLineMap,
  parseTranslationErrorCode,
  parseTranslationMessage,
} from "../utils/liveTranslation";

// Using the global object so the foreground-service handle survives React
// Native Fast Refresh (HMR) without being dropped.
const g = global as { __resolveForegroundService?: (() => void) | null };

// Registered at module load so Android allows long-form background execution.
// The service ends when the promise resolves (see stopForegroundService).
notifee.registerForegroundService(() => {
  return new Promise<void>((resolve) => {
    g.__resolveForegroundService = resolve;
  });
});

/**
 * Minimal slice of the Plan AI API client the recording session needs. Passed
 * in on start() so this module stays decoupled from the AuthContext/React tree.
 */
export interface RecordingApi {
  startAudioStream: (
    language: string,
    contextIds: string[],
    projectIds?: string[],
    translateTo?: string,
  ) => Promise<WebSocket>;
}

export interface StartRecordingOptions {
  language: string;
  contextIds: string[];
  projectId: string | null;
  /** Workspace the recording belongs to; the upload goes there even if the user switches later. */
  workspaceId: string | null;
  /** Firebase uid of the user recording (see RecordingManifest.ownerUid). */
  ownerUid: string | null;
  /** Calendar event this meeting belongs to, kept in the manifest for the upload. */
  calendarEvent?: MeetingCalendarEvent;
  api: RecordingApi;
}

export type AutoPauseReason = "silence" | "long" | "storage";

/** Immutable snapshot the UI subscribes to. */
export interface RecordingSnapshot {
  /** A session is open: recording or paused. */
  isRecording: boolean;
  isPaused: boolean;
  isStarting: boolean;
  isSpeaking: boolean;
  transcript: string;
  interim: string;
  isWsConnected: boolean;
  isConnectingWs: boolean;
  wsUnrecoverable: boolean;
  language: string;
  projectId: string | null;
  contextIds: string[];
  sessionId: string | null;
  startedAt: number | null;
  /** Recorded ms before the current stretch (pauses excluded). */
  recordedMsBefore: number;
  /** Start of the current recorded stretch, null while paused. */
  segmentStartedAt: number | null;
  /** Stopped session waiting on the save screen. */
  stoppedSessionId: string | null;
  captureProblem: null | { kind: "stalled" | "interrupted" | "error"; message?: string };
  lowStorage: boolean;
  autoPauseWarning: null | { reason: "silence" | "long"; at: number };
  autoPausedBy: AutoPauseReason | null;
  /** Moments marked in this session, also kept in its manifest. */
  bookmarks: RecordingBookmark[];
}

const INITIAL_SNAPSHOT: RecordingSnapshot = {
  isRecording: false,
  isPaused: false,
  isStarting: false,
  isSpeaking: false,
  transcript: "",
  interim: "",
  isWsConnected: true,
  isConnectingWs: false,
  wsUnrecoverable: false,
  language: "",
  projectId: null,
  contextIds: [],
  sessionId: null,
  startedAt: null,
  recordedMsBefore: 0,
  segmentStartedAt: null,
  stoppedSessionId: null,
  captureProblem: null,
  lowStorage: false,
  autoPauseWarning: null,
  autoPausedBy: null,
  bookmarks: [],
};

/** Recorded time of a snapshot, pauses excluded. */
export function recordedMsOf(s: RecordingSnapshot, now = Date.now()): number {
  return s.recordedMsBefore + (s.segmentStartedAt ? now - s.segmentStartedAt : 0);
}

// ── Limits ────────────────────────────────────────────────────────────────
// No audio for this long while recording means the capture died (for
// example another screen or app took the microphone).
const STALL_MS = 5000;
const STALL_RESTART_EVERY_MS = 15_000;
// iOS does not always say when an interruption ends (for example when another
// app keeps playing audio that cannot mix). After this long the capture is
// restarted anyway, and again every STALL_RESTART_EVERY_MS until audio flows.
const INTERRUPTED_RETRY_MS = 10_000;
// Same automatic pause as the desktop recorder: nobody spoke for 15 minutes,
// or 3 hours without the user touching the recording.
const SILENCE_WARN_MS = 14 * 60_000;
const SILENCE_PAUSE_MS = 15 * 60_000;
const LONG_RUN_WARN_MS = 3 * 60 * 60_000;
const LONG_RUN_GRACE_MS = 10 * 60_000;
// Mean absolute amplitude / 6000 above which a chunk counts as speech.
const SPEECH_LEVEL = 0.05;
// Free space: refuse to start below 300 MB, warn below 500 MB, pause below
// 100 MB. The WAV grows by 115 MB per hour (16 kHz, 16 bit, mono).
const MIN_START_FREE_BYTES = 300 * 1024 * 1024;
const LOW_FREE_BYTES = 500 * 1024 * 1024;
const CRITICAL_FREE_BYTES = 100 * 1024 * 1024;
// A WAV file cannot pass 4 GiB (about 24 h); stop well before.
const MAX_AUDIO_BYTES = 3.5 * 1024 * 1024 * 1024;
const HEARTBEAT_MS = 10_000;
const HEARTBEAT_DEAD_MS = 30_000;
const PAUSE_DRAIN_MS = 2500;

// ── Volume lives in its own tiny store ─────────────────────────────────────
// It changes about 6 times a second; keeping it out of the snapshot means the
// whole record screen no longer re-renders at that rate.
let volume = 0;
const volumeListeners = new Set<(v: number) => void>();
const setVolume = (v: number) => {
  volume = v;
  volumeListeners.forEach((l) => l(v));
};
export function useRecordingVolume(): number {
  const [v, setV] = useState(volume);
  useEffect(() => {
    volumeListeners.add(setV);
    return () => {
      volumeListeners.delete(setV);
    };
  }, []);
  return v;
}

const freeBytes = (): number | null => {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
};

/**
 * Manifest writes must never throw out of a timer or a native event: with the
 * disk full that is a fatal JS error, and the app would close mid-meeting.
 * The audio file on disk is what matters; the manifest can lag behind.
 */
function safeUpdateManifest(...args: Parameters<typeof updateManifest>): void {
  try {
    updateManifest(...args);
  } catch (err) {
    console.warn("[recording] could not update the session manifest", err);
  }
}

async function notify(title: string, body: string) {
  try {
    const channelId = await notifee.createChannel({
      id: "recording-alerts",
      name: "Recording alerts",
      importance: AndroidImportance.HIGH,
    });
    await notifee.displayNotification({
      id: "recording-alert",
      title,
      body,
      android: { channelId, pressAction: { id: "default" } },
    });
  } catch {
    // notifications are a courtesy, never block recording on them
  }
}

/**
 * Owns the live recording session: the microphone (through audioCapture),
 * the transcription WebSocket, the Android foreground service and the
 * session folder on disk (recordingSessions.ts). It lives OUTSIDE the React
 * tree, so the session keeps running when the record screen unmounts
 * (navigation away, app backgrounded, phone locked). The screen subscribes
 * via `useRecordingSession` and re-attaches when it remounts.
 */
class RecordingService {
  private snapshot: RecordingSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();

  private ws: WebSocket | null = null;
  private api: RecordingApi | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pauseDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private chunkCount = 0;
  private lastChunkAt = 0;
  private lastStallRestartAt = 0;
  private lastActivityAt = 0;
  private lastConfirmedAt = 0;
  private lastPongAt = 0;
  private warnedFor: "silence" | "long" | null = null;
  private lastStorageCheckAt = 0;
  private diskWriteFailures = 0;
  private interruptedAt = 0;
  // Bumped whenever the live socket must not be reused (start, pause, stop,
  // discard, manual reconnect). A connection that resolves for an older
  // generation is closed instead of attached, so two sockets never coexist.
  private wsGeneration = 0;
  private resampler = new Resampler24To16();
  // 16 kHz samples written to this session's WAV. Bookmarks use it: it is the
  // position in the saved audio even when the mic stopped delivering (a phone
  // call, a stall, a failed write) while the clock kept running.
  private savedSamples = 0;
  private connectingGeneration: number | null = null;

  constructor() {
    audioCapture.onData(this.onAudio);
    audioCapture.onEvent(this.onCaptureEvent);
    // Back in the foreground with no audio arriving: restart the capture
    // right away instead of waiting for the watchdog.
    AppState.addEventListener("change", (state) => {
      const s = this.snapshot;
      if (state !== "active" || !s.isRecording || s.isPaused) return;
      if (Date.now() - this.lastChunkAt > STALL_MS) {
        this.lastStallRestartAt = Date.now();
        audioCapture.restart();
      }
    });
  }

  // ---- external store contract -------------------------------------------

  getSnapshot = (): RecordingSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** True while a meeting is being recorded or is paused. */
  isMeetingActive = (): boolean => this.snapshot.isRecording || this.snapshot.isStarting;

  private set(patch: Partial<RecordingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- audio ----------------------------------------------------------------

  private onAudio = (data: string) => {
    const s = this.snapshot;
    // Paused or no session: the audio is dropped before anything keeps it.
    if (!s.isRecording || s.isPaused || !s.sessionId) return;
    const now = Date.now();
    this.chunkCount++;
    this.lastChunkAt = now;
    // Audio is flowing again, whatever stopped it (a lost "resumed" event too).
    if (s.captureProblem?.kind === "stalled" || s.captureProblem?.kind === "interrupted") {
      this.set({ captureProblem: null });
    }

    // One decode per chunk, shared by the file and the level meter.
    let pcm: Int16Array | null = null;
    try {
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    } catch {
      // a malformed chunk is skipped for the file and the meter
    }

    if (pcm) {
      try {
        // Saved at 16 kHz (resample.ts); the live stream stays at 24 kHz.
        const saved = this.resampler.process(pcm);
        appendAudio(
          s.sessionId,
          Buffer.from(saved.buffer, saved.byteOffset, saved.byteLength).toString("base64"),
        );
        this.savedSamples += saved.length;
        this.diskWriteFailures = 0;
      } catch (e) {
        this.diskWriteFailures++;
        if (this.diskWriteFailures === 1) {
          console.warn("WAV append failed", e);
          Sentry.captureException(e, { tags: { source: "recording_disk_write" } });
        }
        // Several failures in a row: the disk is full. Pause instead of
        // carrying on with a recording that is not being kept.
        if (this.diskWriteFailures >= 10) {
          this.set({
            captureProblem: { kind: "error", message: "The phone could not save the audio. Free some space." },
          });
          this.pause("storage");
          return;
        }
      }

      // Coarse level for the waveform and the silence check.
      if (this.chunkCount % 2 === 0 && pcm.length > 0) {
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += Math.abs(pcm[i]);
        const level = Math.min(1, sum / pcm.length / 6000);
        setVolume(level);
        if (level >= SPEECH_LEVEL) this.lastActivityAt = now;
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input_audio", audio: data, source: "mic" }));
    }
  };

  private onCaptureEvent = (event: CaptureEvent) => {
    if (!this.snapshot.isRecording) return;
    if (event.type === "interrupted") {
      this.interruptedAt = Date.now();
      // A phone call, Siri or another app took the audio session (iOS).
      this.set({
        captureProblem: {
          kind: "interrupted",
          message: "Recording stopped by a call or another app. It resumes when it ends.",
        },
      });
      Sentry.addBreadcrumb({ category: "recording", message: `capture interrupted: ${event.reason ?? ""}` });
    } else if (event.type === "resumed") {
      this.lastChunkAt = Date.now();
      this.set({ captureProblem: null });
    } else if (event.type === "error") {
      this.set({ captureProblem: { kind: "error", message: event.message } });
      Sentry.captureMessage(`Audio capture error: ${event.message}`, "warning");
    }
  };

  // ---- websocket ----------------------------------------------------------

  private connectWebSocket = async () => {
    const generation = this.wsGeneration;
    if (this.connectingGeneration === generation || !this.api) return;
    this.connectingGeneration = generation;
    this.set({ isConnectingWs: true });
    const stale = () =>
      generation !== this.wsGeneration || !this.snapshot.isRecording || this.snapshot.isPaused;
    try {
      // Read on every connect, so the target survives a reconnect.
      const translateTo = liveTranslationStore.getState().target;
      const ws = await this.api.startAudioStream(
        this.snapshot.language,
        this.snapshot.contextIds,
        this.snapshot.projectId ? [this.snapshot.projectId] : undefined,
        translateTo || undefined,
      );
      // Paused, stopped or replaced while the socket was being created.
      if (stale()) {
        ws.close();
        if (this.connectingGeneration === generation) {
          this.connectingGeneration = null;
          this.set({ isConnectingWs: false });
        }
        return;
      }
      this.connectingGeneration = null;
      this.ws = ws;
      // Phrase ids start again on every connection.
      const phraseLines = new PhraseLineMap();

      ws.onopen = () => {
        console.log("✅ WebSocket Connected!");
        this.reconnectAttempts = 0;
        this.lastPongAt = Date.now();
        this.set({ isWsConnected: true, isConnectingWs: false });
        // The target changed while the socket was connecting.
        const target = liveTranslationStore.getState().target;
        if (target !== translateTo) {
          ws.send(JSON.stringify({ type: "set_translation", language: target || null }));
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "pong") {
            this.lastPongAt = Date.now();
          } else if (msg.type === "transcript") {
            const text = String(msg.text ?? "").trim();
            if (!text) return;
            this.lastActivityAt = Date.now();
            // The live stream has no speaker names: in a room the mic hears
            // everyone. Names come from the batch pass after upload.
            const line = msg.speaker ? `[${msg.speaker}] ${text}` : text;
            if (msg.isFinal) {
              phraseLines.remember(msg.id, this.snapshot.transcript);
              this.commitLine(line);
            } else {
              this.set({ interim: line });
            }
          } else if (msg.type === "translation") {
            // Shown under its phrase. Kept in memory only, never on disk.
            const translation = parseTranslationMessage(msg);
            const lineIndex = translation ? phraseLines.lineOf(translation.id) : null;
            if (translation && lineIndex !== null) {
              liveTranslationStore.setLine(lineIndex, translation.text);
            }
          } else if (msg.type === "translation_error") {
            // Not fatal: the recording and the transcript carry on.
            liveTranslationStore.fail(parseTranslationErrorCode(msg));
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
        if (this.ws !== ws) return; // an old socket we already replaced
        console.log("WS Stream Closed. Local WAV continues recording.");
        this.ws = null;
        this.set({ isWsConnected: false, isConnectingWs: false });
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("Failed to initialize WS (offline):", e);
      if (this.connectingGeneration === generation) this.connectingGeneration = null;
      if (stale()) return;
      this.set({ isWsConnected: false, isConnectingWs: false });
      this.scheduleReconnect();
    }
  };

  private commitLine(line: string) {
    const prev = this.snapshot.transcript;
    this.set({ transcript: prev + `${prev ? "\n" : ""}${line}`, interim: "" });
    const id = this.snapshot.sessionId;
    if (id) {
      try {
        appendTranscriptLine(id, line);
      } catch {
        // the audio is what matters; the text is re-made from it after upload
      }
    }
  }

  /** Keeps interim text that never finalized (socket closed on pause or stop). */
  private commitInterim() {
    const interim = this.snapshot.interim.trim();
    if (interim) this.commitLine(interim);
  }

  private closeWsQuietly(sendEnd = false) {
    this.wsGeneration++;
    this.connectingGeneration = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    try {
      if (sendEnd && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end_stream" }));
      }
      ws.close();
    } catch {
      // ignore
    }
  }

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

  /** Reconnects a dropped socket with a growing delay (2 s up to 30 s). */
  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const s = this.snapshot;
    if (
      !s.isRecording ||
      s.isPaused ||
      s.wsUnrecoverable ||
      this.connectingGeneration === this.wsGeneration
    )
      return;
    const delay = Math.min(30_000, 2000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const now = this.snapshot;
      if (now.isRecording && !now.isPaused && !this.ws) {
        console.log("🔄 Auto-reconnecting WebSocket...");
        void this.connectWebSocket();
      }
    }, delay);
  }

  /**
   * The socket can stay "open" after the phone changes network while nothing
   * gets through. The backend answers pings; no pong for 30 s means a dead
   * socket, which is replaced.
   */
  private heartbeat = () => {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.snapshot.isPaused) return;
    if (Date.now() - this.lastPongAt > HEARTBEAT_DEAD_MS) {
      console.warn("[recording] no pong for 30 s, replacing the socket");
      this.closeWsQuietly();
      this.set({ isWsConnected: false });
      this.scheduleReconnect();
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "ping" }));
    } catch {
      // onclose handles it
    }
  };

  /** Every 2 s while a session is open: capture watchdog, auto-pause, storage. */
  private tick = () => {
    const s = this.snapshot;
    if (!s.isRecording || s.isPaused) return;
    const now = Date.now();

    // Capture watchdog. While iOS reports an interruption (a call has the
    // microphone) the message stays, and restarts wait INTERRUPTED_RETRY_MS.
    if (now - this.lastChunkAt > STALL_MS) {
      const interrupted = s.captureProblem?.kind === "interrupted";
      if (!interrupted && s.captureProblem?.kind !== "stalled") {
        this.set({
          captureProblem: { kind: "stalled", message: "No audio is arriving from the microphone." },
        });
        Sentry.captureMessage("Recording capture stalled", "warning");
      }
      const waited = !interrupted || now - this.interruptedAt > INTERRUPTED_RETRY_MS;
      if (waited && now - this.lastStallRestartAt > STALL_RESTART_EVERY_MS) {
        this.lastStallRestartAt = now;
        audioCapture.restart();
      }
    }

    // Automatic pause.
    const silentFor = now - this.lastActivityAt;
    const unconfirmedFor = now - this.lastConfirmedAt;
    if (silentFor >= SILENCE_PAUSE_MS) {
      this.pause("silence");
      return;
    }
    if (unconfirmedFor >= LONG_RUN_WARN_MS + LONG_RUN_GRACE_MS) {
      this.pause("long");
      return;
    }
    if (silentFor >= SILENCE_WARN_MS) {
      if (this.warnedFor !== "silence") {
        this.warnedFor = "silence";
        this.set({ autoPauseWarning: { reason: "silence", at: this.lastActivityAt + SILENCE_PAUSE_MS } });
        void notify(
          "Nobody has spoken for 14 minutes",
          "Plan AI will pause the recording in a minute. Open the app to keep it going.",
        );
      }
    } else if (unconfirmedFor >= LONG_RUN_WARN_MS) {
      if (this.warnedFor !== "long") {
        this.warnedFor = "long";
        this.set({
          autoPauseWarning: {
            reason: "long",
            at: this.lastConfirmedAt + LONG_RUN_WARN_MS + LONG_RUN_GRACE_MS,
          },
        });
        void notify(
          "Recording for 3 hours",
          "Plan AI will pause it in 10 minutes. Open the app to keep it going.",
        );
      }
    } else if (s.autoPauseWarning) {
      this.warnedFor = null;
      this.set({ autoPauseWarning: null });
    }

    // Storage, every 30 s.
    if (now - this.lastStorageCheckAt > 30_000 && s.sessionId) {
      this.lastStorageCheckAt = now;
      const free = freeBytes();
      if (free !== null && free < CRITICAL_FREE_BYTES) {
        this.pause("storage");
        return;
      }
      const low = free !== null && free < LOW_FREE_BYTES;
      if (low !== s.lowStorage) this.set({ lowStorage: low });
      if (audioBytes(s.sessionId, null) > MAX_AUDIO_BYTES) this.pause("storage");
    }
  };

  private startTimers() {
    this.stopTimers();
    this.tickTimer = setInterval(this.tick, 2000);
    this.heartbeatTimer = setInterval(this.heartbeat, HEARTBEAT_MS);
  }

  private stopTimers() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pauseDrainTimer) clearTimeout(this.pauseDrainTimer);
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.pauseDrainTimer = null;
  }

  private async startForegroundService() {
    if (Platform.OS !== "android") return;
    try {
      // Android 13+ needs this for the ongoing notification to show.
      await notifee.requestPermission().catch(() => undefined);
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
          // Required to keep the microphone in the background (Android 14+).
          foregroundServiceTypes: [
            AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
          ],
          color: "#0284c7",
          ongoing: true,
        },
      });
    } catch (err) {
      console.warn("Failed to start Android Foreground Daemon:", err);
      Sentry.captureException(err, { tags: { source: "foreground_service" } });
    }
  }

  private async stopForegroundService() {
    if (Platform.OS !== "android") return;
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

  // ---- public lifecycle ---------------------------------------------------

  /**
   * Starts a meeting. The microphone and the file on disk start first; the
   * live transcription connects afterwards and retries on its own, so a bad
   * network at the start no longer delays or loses the beginning.
   */
  async start(opts: StartRecordingOptions): Promise<void> {
    if (this.snapshot.isRecording || this.snapshot.isStarting) return;
    this.set({ isStarting: true });
    // Only the session this call creates may be cleaned up on failure; the
    // snapshot can still hold a stopped meeting waiting to be saved.
    let createdId: string | null = null;
    try {
      const free = freeBytes();
      if (free !== null && free < MIN_START_FREE_BYTES) {
        throw new Error(
          `Only ${Math.round(free / 1024 / 1024)} MB free on this phone. A meeting needs about 115 MB per hour. Free some space and try again.`,
        );
      }

      this.api = opts.api;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: true,
      });
      await notifee.requestPermission().catch(() => undefined);
      await this.startForegroundService();

      const sessionId = newSessionId();
      const now = Date.now();
      createdId = sessionId;
      this.wsGeneration++;
      createSession({
        sessionId,
        startedAt: now,
        language: opts.language,
        projectId: opts.projectId,
        contextIds: opts.contextIds,
        workspaceId: opts.workspaceId,
        ownerUid: opts.ownerUid ?? undefined,
        sampleRate: SAVED_SAMPLE_RATE,
        ...(opts.calendarEvent ? { calendarEvent: opts.calendarEvent } : {}),
      });
      this.resampler = new Resampler24To16();
      this.savedSamples = 0;
      liveTranslationStore.resetLines();

      this.chunkCount = 0;
      this.diskWriteFailures = 0;
      this.reconnectAttempts = 0;
      this.lastChunkAt = now;
      this.lastActivityAt = now;
      this.lastConfirmedAt = now;
      this.lastStallRestartAt = now;
      this.warnedFor = null;
      this.set({
        ...INITIAL_SNAPSHOT,
        isStarting: true,
        isRecording: true,
        sessionId,
        startedAt: now,
        segmentStartedAt: now,
        language: opts.language,
        projectId: opts.projectId,
        contextIds: opts.contextIds,
        lowStorage: free !== null && free < LOW_FREE_BYTES,
      });

      if (!audioCapture.acquire("meeting")) {
        throw new Error("The microphone is busy.");
      }
      this.startTimers();
      void this.connectWebSocket();
    } catch (err) {
      const previousStopped = this.snapshot.stoppedSessionId;
      audioCapture.release("meeting");
      this.stopTimers();
      await this.stopForegroundService();
      if (createdId) deleteSession(createdId);
      this.set({ ...INITIAL_SNAPSHOT, stoppedSessionId: previousStopped });
      throw err;
    } finally {
      this.set({ isStarting: false });
    }
  }

  /**
   * Pause: nothing is recorded, written or sent until resume(). The
   * microphone is released (the OS indicator turns off). The live socket
   * closes after a short drain so utterances in flight still come back.
   */
  pause(reason: AutoPauseReason | null = null): void {
    const s = this.snapshot;
    if (!s.isRecording || s.isPaused) return;
    const now = Date.now();
    const recordedMsBefore = recordedMsOf(s, now);
    audioCapture.release("meeting");
    setVolume(0);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.warnedFor = null;
    this.set({
      isPaused: true,
      isSpeaking: false,
      recordedMsBefore,
      segmentStartedAt: null,
      autoPausedBy: reason,
      autoPauseWarning: null,
      captureProblem: reason === "storage" ? s.captureProblem : null,
    });
    if (s.sessionId) safeUpdateManifest(s.sessionId, { recordedMs: recordedMsBefore });
    this.pauseDrainTimer = setTimeout(() => {
      this.pauseDrainTimer = null;
      if (!this.snapshot.isPaused) return;
      this.closeWsQuietly(true);
      this.commitInterim();
      this.set({ isWsConnected: true, isConnectingWs: false });
    }, PAUSE_DRAIN_MS);

    if (reason === "silence") {
      void notify("Recording paused", "Nobody spoke for 15 minutes. Open Plan AI to resume or stop.");
    } else if (reason === "long") {
      void notify("Recording paused", "It ran for over 3 hours without a check. Open Plan AI to resume or stop.");
    } else if (reason === "storage") {
      void notify("Recording paused", "The phone is almost out of space. Free some space, then resume or stop.");
    }
  }

  resume(): void {
    const s = this.snapshot;
    if (!s.isRecording || !s.isPaused) return;
    if (this.pauseDrainTimer) clearTimeout(this.pauseDrainTimer);
    this.pauseDrainTimer = null;
    if (!audioCapture.acquire("meeting")) {
      this.set({ captureProblem: { kind: "error", message: "The microphone is busy." } });
      return;
    }
    const now = Date.now();
    this.lastChunkAt = now;
    this.lastActivityAt = now;
    this.lastConfirmedAt = now;
    this.lastStallRestartAt = now;
    this.diskWriteFailures = 0;
    this.set({
      isPaused: false,
      segmentStartedAt: now,
      autoPausedBy: null,
      captureProblem: null,
    });
    if (!this.ws) {
      this.reconnectAttempts = 0;
      void this.connectWebSocket();
    }
  }

  /**
   * Marks the current moment of the recording. The time is counted from the
   * samples written so far, so it is the position in the saved audio. Returns the
   * bookmark's index for setBookmarkNote, or null when nothing is recording.
   */
  addBookmark(): number | null {
    const s = this.snapshot;
    if (!s.isRecording || s.isPaused || !s.sessionId) return null;
    const atSeconds = Math.round((this.savedSamples / SAVED_SAMPLE_RATE) * 10) / 10;
    const bookmarks = [...s.bookmarks, { atSeconds }];
    this.set({ bookmarks });
    safeUpdateManifest(s.sessionId, { bookmarks });
    return bookmarks.length - 1;
  }

  /** Adds a note to a bookmark. Works while paused and on the save screen too. */
  setBookmarkNote(index: number, note: string): void {
    const s = this.snapshot;
    const id = s.sessionId ?? s.stoppedSessionId;
    const text = note.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!id || !s.bookmarks[index]) return;
    const bookmarks = s.bookmarks.map((b, i) =>
      i === index ? (text ? { ...b, note: text } : { atSeconds: b.atSeconds }) : b,
    );
    this.set({ bookmarks });
    safeUpdateManifest(id, { bookmarks });
  }

  /** The user is still there: resets the automatic-pause clocks. */
  confirmStillRecording(): void {
    const now = Date.now();
    this.lastActivityAt = now;
    this.lastConfirmedAt = now;
    this.warnedFor = null;
    this.set({ autoPauseWarning: null });
  }

  /**
   * Stops capture and closes the session file. Returns the session id when
   * there is something to save (audio or text); the session then waits on
   * the save screen, and on the dashboard if the app closes first.
   */
  async stop(): Promise<{ sessionId: string | null; hasAudio: boolean }> {
    const s = this.snapshot;
    if (!s.isRecording || !s.sessionId) return { sessionId: null, hasAudio: false };
    const id = s.sessionId;
    const now = Date.now();
    const recordedMs = recordedMsOf(s, now);
    audioCapture.release("meeting");
    this.stopTimers();
    this.commitInterim();
    this.closeWsQuietly(true);
    setVolume(0);
    await this.stopForegroundService();

    const hasAudio = audioBytes(id, null) > WAV_HEADER_BYTES;
    const hasText = this.snapshot.transcript.trim().length > 0;
    const keep = hasAudio || hasText;
    if (keep) {
      safeUpdateManifest(id, { status: "stopped", stoppedAt: now, recordedMs });
    } else {
      deleteSession(id);
    }
    this.set({
      isRecording: false,
      isPaused: false,
      isSpeaking: false,
      segmentStartedAt: null,
      recordedMsBefore: recordedMs,
      stoppedSessionId: keep ? id : null,
      autoPauseWarning: null,
      captureProblem: null,
    });
    return { sessionId: keep ? id : null, hasAudio };
  }

  /** The stopped session was handed to the uploader: clear the screen state. */
  finishSaved(): void {
    this.set({ ...INITIAL_SNAPSHOT });
  }

  /** Discard the session without saving (and delete it from the phone). */
  async discard(): Promise<void> {
    const id = this.snapshot.sessionId ?? this.snapshot.stoppedSessionId;
    try {
      if (this.snapshot.isRecording) {
        audioCapture.release("meeting");
        await this.stopForegroundService();
      }
    } finally {
      this.stopTimers();
      this.closeWsQuietly(true);
      setVolume(0);
      if (id) deleteSession(id);
      this.set({ ...INITIAL_SNAPSHOT });
    }
  }

  /** Switch the live transcription language mid-session. */
  changeLanguage(language: string) {
    this.set({ language });
    const id = this.snapshot.sessionId ?? this.snapshot.stoppedSessionId;
    if (id) safeUpdateManifest(id, { language });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "change_language", language }));
    }
  }

  /**
   * Turns live translation on, off ("") or to another language. It applies
   * to the next phrases. With no open socket the next connection carries it.
   */
  setTranslation(language: string) {
    liveTranslationStore.setTarget(language);
    const target = liveTranslationStore.getState().target;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "set_translation", language: target || null }));
    }
  }

  /** Manual "Reconnect" affordance — clears the unrecoverable flag and retries. */
  reconnect() {
    if (!this.snapshot.isRecording || this.snapshot.isPaused) return;
    this.set({ wsUnrecoverable: false });
    this.closeWsQuietly();
    this.reconnectAttempts = 0;
    void this.connectWebSocket();
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
