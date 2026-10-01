import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { audioCapture } from "../services/audioCapture";
import { recordingService } from "../services/recordingService";
import type { createPlanAiApi } from "../services/planAiApi";
import { reportUnexpected } from "../utils/reportError";

type Api = ReturnType<typeof createPlanAiApi>;

/** How long the socket stays open after stop, for the last words already sent. */
const FINAL_WAIT_MS = 1200;

/**
 * Live dictation through the same stream the Assistant uses: the microphone
 * goes to /api/audio/stream and final phrases come back as text.
 *
 * The microphone is shared with the meeting recorder through audioCapture, and
 * a meeting always wins: dictation is refused while one records, and ends when
 * one starts. Backgrounding the app or leaving the screen ends it too.
 */
export function useDictation(opts: {
  api: Api;
  /** Deepgram language code. Empty means auto-detect ("multi"), which returns nothing for Catalan. */
  language: string;
  onFinal: (text: string) => void;
}) {
  const [isDictating, setIsDictating] = useState(false);
  const [interim, setInterim] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onFinalRef = useRef(opts.onFinal);
  onFinalRef.current = opts.onFinal;

  const stop = useCallback((abort = false) => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    audioCapture.release("dictation");
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "end_stream" }));
      } catch {
        // The socket is closing anyway.
      }
      if (abort) {
        ws.close();
      } else {
        setTimeout(() => {
          if (
            ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING
          ) {
            ws.close();
          }
        }, FINAL_WAIT_MS);
      }
    }
    setIsDictating(false);
    setInterim("");
  }, []);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") stopRef.current(true);
    });
    const unsubscribeEvents = audioCapture.onEvent((e) => {
      if (e.type === "preempted" && e.owner === "dictation")
        stopRef.current(true);
    });
    return () => {
      sub.remove();
      unsubscribeEvents();
      stopRef.current(true);
    };
  }, []);

  const start = useCallback(async () => {
    if (wsRef.current) return;
    if (recordingService.isMeetingActive()) {
      Alert.alert(
        "A meeting is being recorded",
        "Dictation is off until the meeting stops, so it cannot take the microphone from the recording.",
      );
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone",
          "Allow the microphone in Settings to dictate your report.",
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: false,
      });
      const ws = await opts.api.startAudioStream(opts.language || undefined);
      wsRef.current = ws;
      // The server sends every phrase that ended once the stream closes. A
      // socket kept open after stop still delivers them here.
      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "transcript" || typeof msg.text !== "string") return;
          if (msg.isFinal) {
            if (msg.text.trim()) onFinalRef.current(msg.text.trim());
            setInterim("");
          } else if (wsRef.current === ws) {
            setInterim(msg.text);
          }
        } catch {
          // A message we do not know. Nothing to do.
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) stopRef.current(true);
      };
      if (!audioCapture.acquire("dictation")) {
        ws.close();
        wsRef.current = null;
        Alert.alert(
          "A meeting is being recorded",
          "Dictation is off until the meeting stops, so it cannot take the microphone from the recording.",
        );
        return;
      }
      unsubscribeRef.current = audioCapture.onData((data) => {
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({ type: "input_audio", source: "mic", audio: data }),
          );
        }
      });
      setIsDictating(true);
    } catch (err) {
      reportUnexpected(err, "daily_report", { op: "dictation_start" });
      stopRef.current(true);
      Alert.alert(
        "Dictation",
        "Could not start dictation. Check the connection and try again.",
      );
    }
  }, [opts.api, opts.language]);

  return { isDictating, interim, start, stop };
}
