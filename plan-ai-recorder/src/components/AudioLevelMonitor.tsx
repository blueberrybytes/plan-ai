import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, LinearProgress, Stack } from "@mui/material";

interface AudioLevelMonitorProps {
  systemSourceId: string | null;
  micDeviceId?: string;
}

export const AudioLevelMonitor: React.FC<AudioLevelMonitorProps> = ({
  systemSourceId,
  micDeviceId,
}) => {
  const [micLevel, setMicLevel] = useState(0);
  const [sysLevel, setSysLevel] = useState(0);

  const contextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sysStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const sysAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();
  const activeRef = useRef(true);
  const lastActiveRecorderTime = useRef(0); // Add tracker for active recording overlay

  // Resume context on any interaction globally
  useEffect(() => {
    const handleGlobalInteraction = () => {
      if (contextRef.current && contextRef.current.state === "suspended") {
        void contextRef.current
          .resume()
          .then(() =>
            console.log(
              "[Monitor] AudioContext resumed via global interaction.",
            ),
          );
      }
    };
    window.addEventListener("click", handleGlobalInteraction);
    window.addEventListener("mousemove", handleGlobalInteraction, {
      once: true,
    });
    window.addEventListener("keydown", handleGlobalInteraction, { once: true });
    return () => {
      window.removeEventListener("click", handleGlobalInteraction);
      window.removeEventListener("mousemove", handleGlobalInteraction);
      window.removeEventListener("keydown", handleGlobalInteraction);
    };
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    contextRef.current = ctx;

    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyserRef.current = micAnalyser;

    const sysAnalyser = ctx.createAnalyser();
    sysAnalyser.fftSize = 256;
    sysAnalyserRef.current = sysAnalyser;

    const micData = new Uint8Array(micAnalyser.frequencyBinCount);
    const sysData = new Uint8Array(sysAnalyser.frequencyBinCount);

    let frameCount = 0;
    const updateLevels = () => {
      if (!activeRef.current) return;

      // If we received a real level from AudioRecorder in the last 1 second, prioritize it!
      if (Date.now() - lastActiveRecorderTime.current < 1000) {
        animationRef.current = requestAnimationFrame(updateLevels);
        return;
      }

      if (micAnalyserRef.current) {
        micAnalyserRef.current.getByteFrequencyData(micData);
        const avg = micData.reduce((acc, v) => acc + v, 0) / micData.length;
        // High sensitivity for mic
        setMicLevel(Math.min(100, (avg / 30) * 100));

        // Log every ~5 seconds to verify data flow
        frameCount++;
        if (frameCount % 300 === 0) {
          const track = micStreamRef.current?.getAudioTracks()[0];
          console.log(`[Monitor] 🎤 mic health:`, {
            ctxState: ctx.state,
            micAvg: avg.toFixed(3),
            micLevel: Math.min(100, (avg / 30) * 100).toFixed(1),
            stream: micStreamRef.current ? 'connected' : 'null',
            trackState: track?.readyState ?? 'n/a',
            trackMuted: track?.muted ?? 'n/a',
            trackLabel: track?.label ?? 'n/a',
          });
        }
      }

      if (!navigator.userAgent.includes("Mac OS X")) {
        if (sysAnalyserRef.current && systemSourceId) {
          sysAnalyserRef.current.getByteFrequencyData(sysData);
          const avg = sysData.reduce((acc, v) => acc + v, 0) / sysData.length;
          // Massive sensitivity for system audio (often padded)
          setSysLevel(Math.min(100, (avg / 15) * 100));
        } else {
          setSysLevel(0);
        }
      }

      animationRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();

    return () => {
      activeRef.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (contextRef.current && contextRef.current.state !== "closed") {
        void contextRef.current
          .close()
          .then(() => console.log("[Monitor] AudioContext closed."));
      }
    };
  }, []); // Only run once on mount

  // Re-runs whenever micDeviceId changes (including on mount)
  useEffect(() => {
    let cancelled = false;

    const startMic = async () => {
      // Stop any existing stream first
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      const ctx = contextRef.current;
      const micAnalyser = micAnalyserRef.current;
      if (!ctx || !micAnalyser) return;

      // Build constraint list: prefer chosen device, fall back to any mic
      const constraints: MediaStreamConstraints[] = [];
      if (micDeviceId && micDeviceId !== "default") {
        constraints.push({ audio: { deviceId: { exact: micDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      }
      constraints.push({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      constraints.push({ audio: true });

      for (const cons of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(cons);
          if (cancelled || !contextRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          micStreamRef.current = stream;
          const source = ctx.createMediaStreamSource(stream);
          source.connect(micAnalyser);

          // Diagnostic: log device details
          const track = stream.getAudioTracks()[0];
          const settings = track?.getSettings();
          console.log(`[Monitor] ✅ Mic stream acquired:`, {
            deviceId: micDeviceId,
            label: track?.label,
            trackState: track?.readyState,
            muted: track?.muted,
            sampleRate: settings?.sampleRate,
            channelCount: settings?.channelCount,
            autoGainControl: settings?.autoGainControl,
            noiseSuppression: settings?.noiseSuppression,
            echoCancellation: settings?.echoCancellation,
            contextState: ctx.state,
            contextSampleRate: ctx.sampleRate,
          });

          // Monitor track health: warn if it ends unexpectedly
          track.onended = () => console.warn(`[Monitor] ⚠️ Mic track ENDED unexpectedly (label: ${track.label})`);
          track.onmute = () => console.warn(`[Monitor] ⚠️ Mic track MUTED (label: ${track.label})`);
          track.onunmute = () => console.log(`[Monitor] Mic track UN-MUTED (label: ${track.label})`);

          void ctx.resume().then(() => console.log(`[Monitor] ctx.resume() done, state=${ctx.state}`));
          return;
        } catch (e) {
          console.warn("[Monitor] Mic attempt failed:", cons, e);
        }
      }
      console.warn("[Monitor] All mic attempts failed.");
    };

    void startMic();

    return () => {
      cancelled = true;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    };
  }, [micDeviceId]);

  // Handle System Audio Change separately
  useEffect(() => {
    if (
      !systemSourceId ||
      systemSourceId === "none" ||
      !contextRef.current ||
      !sysAnalyserRef.current
    ) {
      console.log("[Monitor] System audio disabled (none/null)");
      setSysLevel(0);
      return;
    }

    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    if (navigator.userAgent.includes("Mac OS X")) {
      console.log(
        "[Monitor] macOS system audio active. Simulating preview visualizer (native audio pipe offline until recording).",
      );

      // We simulate a gentle bounce because Chromium on macOS cannot access system audio via getUserMedia.
      // True audio is only captured via our ScreenCaptureKit Swift binary during active recording.
      const interval = setInterval(() => {
        if (!activeRef.current) return;
        // Generate a random gentle bounce between 5 and 35
        const bounce = 5 + Math.random() * 30;
        setSysLevel(bounce);
      }, 150);

      return () => clearInterval(interval);
    }

    console.log(
      "[Monitor] Connecting to system source via getUserMedia:",
      systemSourceId,
    );

    void navigator.mediaDevices
      .getUserMedia({
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
      })
      .then((stream) => {
        if (!activeRef.current)
          return stream.getTracks().forEach((t) => t.stop());

        // Stop the video tracks immediately to ensure AudioContext processes the audio
        // Keeping an unconsumed video track can cause the audio track to stall on Windows
        stream.getVideoTracks().forEach((t) => t.stop());

        sysStreamRef.current = stream;

        const source = contextRef.current!.createMediaStreamSource(stream);
        source.connect(sysAnalyserRef.current!);
      })
      .catch((err) => {
        console.error("[Monitor] System audio error:", err);
        alert(
          `Failed to grab System Audio stream: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return () => {
      if (sysStreamRef.current) sysStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [systemSourceId]);

  // Listen to the global RMS events emitted by AudioRecorder during active recording
  useEffect(() => {
    const handleAudioLevel = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { rmsMic, rmsSys } = customEvent.detail || {};

      // Flag that AudioRecorder is actively providing telemetry
      lastActiveRecorderTime.current = Date.now();

      // KILL standard monitor stream so recorder gets exclusive access without clock conflicts!
      if (micStreamRef.current) {
        console.log(
          "[Monitor] KILLING standard mic stream to prevent clock conflicts with AudioRecorder...",
        );
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      if (sysStreamRef.current) {
        console.log(
          "[Monitor] KILLING standard sys stream to release exclusive capture on Windows...",
        );
        sysStreamRef.current.getTracks().forEach((t) => t.stop());
        sysStreamRef.current = null;
      }

      // We scale the raw RMS value (typically 0.01 - 0.2 for normal speech) up to 100 for the progress bar
      if (rmsMic !== undefined && rmsMic > 0) {
        setMicLevel(Math.min(100, rmsMic * 400));
      }

      if (
        rmsSys !== undefined &&
        rmsSys > 0 &&
        (navigator.userAgent.includes("Mac OS X") ||
          (systemSourceId && systemSourceId !== "none"))
      ) {
        setSysLevel(Math.min(100, rmsSys * 400));
      }
    };

    window.addEventListener("plan-ai-audio-level", handleAudioLevel);
    return () =>
      window.removeEventListener("plan-ai-audio-level", handleAudioLevel);
  }, [systemSourceId]);

  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <Box>
        <Stack direction="row" justifyContent="space-between" mb={0.5}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: "bold" }}
          >
            Microphone (Your Voice)
          </Typography>
          <Typography
            variant="caption"
            color={micLevel > 1 ? "success.main" : "text.secondary"}
          >
            {micLevel > 1 ? "Active" : "Waiting for sound..."}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={micLevel}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.05)",
            "& .MuiLinearProgress-bar": {
              bgcolor: micLevel > 70 ? "warning.main" : "primary.main",
            },
          }}
        />
      </Box>

      <Box>
        <Stack direction="row" justifyContent="space-between" mb={0.5}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: "bold" }}
          >
            System Audio (PC Sound)
          </Typography>
          <Typography
            variant="caption"
            color={
              !systemSourceId
                ? "text.disabled"
                : navigator.userAgent.includes("Mac OS X")
                  ? "success.main"
                  : sysLevel > 1
                    ? "success.main"
                    : "text.secondary"
            }
          >
            {!systemSourceId
              ? "OFF (Disabled)"
              : navigator.userAgent.includes("Mac OS X")
                ? "Active (macOS System Audio Link)"
                : sysLevel > 1
                  ? "Active (Capturing PC Audio)"
                  : "Waiting for sound..."}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={sysLevel}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.05)",
            "& .MuiLinearProgress-bar": {
              bgcolor: sysLevel > 70 ? "warning.main" : "secondary.main",
            },
          }}
        />
      </Box>
    </Stack>
  );
};
