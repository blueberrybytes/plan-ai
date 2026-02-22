import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, LinearProgress, Stack } from "@mui/material";

interface AudioLevelMonitorProps {
  systemSourceId: string | null;
}

export const AudioLevelMonitor: React.FC<AudioLevelMonitorProps> = ({ systemSourceId }) => {
  const [micLevel, setMicLevel] = useState(0);
  const [sysLevel, setSysLevel] = useState(0);

  const contextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const sysAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();
  const activeRef = useRef(true);

  // Resume context on any interaction within the component
  const handleInteraction = () => {
    if (contextRef.current && contextRef.current.state === "suspended") {
      void contextRef.current
        .resume()
        .then(() => console.log("[Monitor] AudioContext resumed via interaction."));
    }
  };

  useEffect(() => {
    activeRef.current = true;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    contextRef.current = ctx;

    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyserRef.current = micAnalyser;

    const sysAnalyser = ctx.createAnalyser();
    sysAnalyser.fftSize = 256;
    sysAnalyserRef.current = sysAnalyser;

    const micData = new Uint8Array(micAnalyser.frequencyBinCount);
    const sysData = new Uint8Array(sysAnalyser.frequencyBinCount);

    const updateLevels = () => {
      if (!activeRef.current) return;

      if (micAnalyserRef.current) {
        micAnalyserRef.current.getByteFrequencyData(micData);
        const avg = micData.reduce((acc, v) => acc + v, 0) / micData.length;
        // High sensitivity for mic
        setMicLevel(Math.min(100, (avg / 30) * 100));
      }

      if (sysAnalyserRef.current && systemSourceId) {
        sysAnalyserRef.current.getByteFrequencyData(sysData);
        const avg = sysData.reduce((acc, v) => acc + v, 0) / sysData.length;
        // Massive sensitivity for system audio (often padded)
        setSysLevel(Math.min(100, (avg / 15) * 100));
      } else {
        setSysLevel(0);
      }

      animationRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();

    // Help debug by listing all devices
    const logDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        console.log(
          "[Monitor] Available audio inputs:",
          inputs.map((i) => `${i.label || "Unnamed"} (${i.deviceId})`),
        );
        return inputs;
      } catch (err) {
        console.error("[Monitor] device enumeration failed:", err);
        return [];
      }
    };
    void logDevices();

    // Init Mic with fallbacks
    const startMic = async () => {
      // 1. Ensure we have permission first (macOS)
      if (window.electron.checkMicrophonePermission) {
        try {
          const hasPerm = await window.electron.checkMicrophonePermission();
          if (!hasPerm) {
            console.warn("[Monitor] Microphone permission not granted.");
            return;
          }
        } catch (perErr) {
          console.warn("[Monitor] Permission check failed, trying anyway:", perErr);
        }
      }

      const inputs = await logDevices();

      // Try constraints: high quality default, simple default, then each specific device
      const constraintSets = [
        { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        { audio: true },
        ...inputs
          .filter((i) => i.deviceId && i.deviceId !== "default")
          .map((i) => ({
            audio: { deviceId: { exact: i.deviceId } },
          })),
      ];

      for (const cons of constraintSets) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(cons);
          if (!activeRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          micStreamRef.current = stream;
          const source = ctx.createMediaStreamSource(stream);
          source.connect(micAnalyser);
          console.log("[Monitor] Mic acquired:", JSON.stringify(cons));

          // Ensure context is running
          if (ctx.state === "suspended") void ctx.resume();
          return;
        } catch (e) {
          console.warn("[Monitor] Mic attempt failed:", e);
        }
      }
      console.warn(
        "[Monitor] All mic attempts failed. This is likely due to Granola or another app locking the device.",
      );
    };

    void startMic();

    return () => {
      activeRef.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (contextRef.current && contextRef.current.state !== "closed") {
        void contextRef.current.close().then(() => console.log("[Monitor] AudioContext closed."));
      }
    };
  }, []); // Only run once on mount

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

    let cleanupStream: MediaStream | null = null;
    console.log("[Monitor] Connecting to system source:", systemSourceId);

    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: systemSourceId } as any,
        } as any,
        video: {
          mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: systemSourceId } as any,
        } as any,
      })
      .then((stream) => {
        if (!activeRef.current) return stream.getTracks().forEach((t) => t.stop());
        cleanupStream = stream;

        // Don't stop the video tracks immediately if it causes the stream to die
        // cleanupStream = stream;

        const source = contextRef.current!.createMediaStreamSource(stream);
        source.connect(sysAnalyserRef.current!);
      })
      .catch((err) => console.error("[Monitor] System audio error:", err));

    return () => {
      if (cleanupStream) cleanupStream.getTracks().forEach((t) => t.stop());
    };
  }, [systemSourceId]);

  return (
    <Stack spacing={2} sx={{ mb: 2 }} onClick={handleInteraction} onMouseMove={handleInteraction}>
      <Box>
        <Stack direction="row" justifyContent="space-between" mb={0.5}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: "bold" }}>
            Microphone (Your Voice)
          </Typography>
          <Typography variant="caption" color={micLevel > 1 ? "success.main" : "text.secondary"}>
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
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: "bold" }}>
            System Audio (PC Sound)
          </Typography>
          <Typography
            variant="caption"
            color={
              !systemSourceId ? "text.disabled" : sysLevel > 1 ? "success.main" : "text.secondary"
            }
          >
            {!systemSourceId
              ? "OFF (Disabled)"
              : sysLevel > 1
                ? "Active (Capturing)"
                : "Quiet (Selected)"}
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
