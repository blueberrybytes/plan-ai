import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  Stop as StopIcon,
  FiberManualRecord as RecordIcon,
  CheckCircle as DoneIcon,
  ArrowBack as BackIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AudioRecorder } from "../services/audioRecorder";
import { planAiApi } from "../services/planAiApi";
import { loadConfig } from "./Home";

type Phase = "recording" | "analyzing" | "done" | "error";

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = h > 0 ? [h, m, s] : [m, s];
  return parts.map((v) => String(v).padStart(2, "0")).join(":");
};

// Animated waveform bars
const Waveform: React.FC<{ active: boolean }> = ({ active }) => (
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: 40 }}>
    {Array.from({ length: 20 }).map((_, i) => (
      <Box
        key={i}
        sx={{
          width: 3,
          borderRadius: 2,
          bgcolor: "primary.main",
          transition: "height 0.15s ease",
          height: active ? `${8 + Math.random() * 28}px` : "4px",
          animation: active
            ? `wave${i % 4} ${0.8 + (i % 3) * 0.2}s ease-in-out infinite alternate`
            : "none",
          opacity: active ? 0.9 : 0.3,
          "@keyframes wave0": { from: { height: "4px" }, to: { height: "32px" } },
          "@keyframes wave1": { from: { height: "8px" }, to: { height: "24px" } },
          "@keyframes wave2": { from: { height: "12px" }, to: { height: "36px" } },
          "@keyframes wave3": { from: { height: "6px" }, to: { height: "20px" } },
          animationDelay: `${i * 0.06}s`,
        }}
      />
    ))}
  </Stack>
);

const Recording: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const config = loadConfig();

  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  const appendText = (text: string) => {
    const updated = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
    transcriptRef.current = updated;
    setTranscript(updated);
    setChunkCount((n) => n + 1);
    // Auto-scroll
    setTimeout(() => {
      if (transcriptBoxRef.current) {
        transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
      }
    }, 50);
  };

  const handleChunk = useCallback(
    async (blob: Blob) => {
      if (!token || !sessionId) return;
      try {
        const text = await planAiApi.transcribeChunk(token, sessionId, blob);
        if (text.trim()) appendText(text.trim());
      } catch (err) {
        console.error("Chunk transcription error:", err);
        // Non-fatal — continue recording
      }
    },
    [token, sessionId],
  );

  const handleStop = useCallback(async () => {
    if (!token || !sessionId) return;
    setPhase("analyzing");

    try {
      await planAiApi.submitTranscript(token, sessionId, {
        transcript: transcriptRef.current,
        title: config?.sessionTitle ?? "Live Recording",
        persona: config?.persona,
        contextIds: config?.selectedContextIds,
        objective: config?.objective || undefined,
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit transcript.");
      setPhase("error");
    }
  }, [token, sessionId, config]);

  // Start recorder on mount
  useEffect(() => {
    if (!token || !sessionId) return;

    const recorder = new AudioRecorder({
      onChunk: (blob) => void handleChunk(blob),
      onStop: () => void handleStop(),
      onError: (err) => {
        setError(err.message);
        setPhase("error");
      },
    });

    recorderRef.current = recorder;
    void recorder.start(config?.systemSourceId ?? undefined);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed((t) => t + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  // ── Done / Error states ───────────────────────────────────────────────────
  if (phase === "analyzing") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <CircularProgress size={48} />
        <Typography variant="h6">Analyzing transcript with AI…</Typography>
        <Typography variant="body2" color="text.secondary">
          Generating tasks and summary. This may take a moment.
        </Typography>
        <LinearProgress sx={{ width: "100%", maxWidth: 320 }} />
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <DoneIcon sx={{ fontSize: 64, color: "success.main" }} />
        <Typography variant="h6">Recording analyzed!</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Your transcript and tasks have been added to <strong>{config?.sessionTitle}</strong>.
          <br />
          Open Plan AI in your browser to review them.
        </Typography>
        <Button variant="contained" startIcon={<BackIcon />} onClick={() => navigate("/")}>
          Back to sessions
        </Button>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <Alert severity="error" sx={{ width: "100%", maxWidth: 400 }}>
          {error ?? "An unexpected error occurred."}
        </Alert>
        <Button variant="outlined" startIcon={<BackIcon />} onClick={() => navigate("/")}>
          Back to sessions
        </Button>
      </Box>
    );
  }

  // ── Active recording ──────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Drag region */}
      <Box sx={{ height: 28, WebkitAppRegion: "drag", bgcolor: "background.default" }} />

      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 3,
          py: 1.5,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: "error.main",
              animation: "pulse 1.2s ease-in-out infinite",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.3 },
              },
            }}
          />
          <Typography variant="subtitle2" fontWeight={700}>
            {config?.sessionTitle ?? "Recording"}
          </Typography>
          <Chip label={formatTime(elapsed)} size="small" variant="outlined" />
        </Stack>

        <Button
          variant="contained"
          color="error"
          startIcon={<StopIcon />}
          onClick={stopRecording}
          size="small"
        >
          Stop & Analyze
        </Button>
      </Stack>

      {/* Waveform */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 3,
          px: 3,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Waveform active />
      </Box>

      {/* Transcript area */}
      <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 3, py: 1 }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}
          >
            Live Transcript
          </Typography>
          {chunkCount > 0 && (
            <Chip
              label={`${chunkCount} segment${chunkCount !== 1 ? "s" : ""}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>

        <Divider sx={{ opacity: 0.3 }} />

        <Box
          ref={transcriptBoxRef}
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 3,
            py: 2,
          }}
        >
          {transcript ? (
            <Typography
              variant="body2"
              sx={{ lineHeight: 1.8, color: "text.primary", whiteSpace: "pre-wrap" }}
            >
              {transcript}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              Transcription will appear here every ~30 seconds…
            </Typography>
          )}
        </Box>
      </Box>

      {/* Config chips */}
      {config && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            px: 3,
            py: 1.5,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={config.persona}
            size="small"
            variant="outlined"
            icon={<RecordIcon sx={{ fontSize: "0.75rem !important" }} />}
          />
          {config.selectedContextIds.length > 0 && (
            <Chip
              label={`${config.selectedContextIds.length} context(s)`}
              size="small"
              variant="outlined"
            />
          )}
          {config.systemSourceId && (
            <Chip label="System audio + mic" size="small" variant="outlined" />
          )}
        </Stack>
      )}
    </Box>
  );
};

export default Recording;
