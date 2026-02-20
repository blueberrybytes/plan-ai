import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Stack,
  Button,
  Alert,
  Tooltip,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Transcript } from "../services/planAiApi";

const TranscriptView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { api } = useAuth();

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscript = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTranscript(id);
      setTranscript(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recording.");
    } finally {
      setLoading(false);
    }
  }, [id, api]);

  useEffect(() => {
    void fetchTranscript();
  }, [fetchTranscript]);

  const handleCopy = () => {
    if (transcript?.transcript) {
      navigator.clipboard.writeText(transcript.transcript).catch(() => undefined);
    }
  };

  const handleDownload = () => {
    if (!transcript?.transcript) return;
    const blob = new Blob([transcript.transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${transcript.title || "recording"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Title bar (draggable) */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
          flexShrink: 0,
        }}
      />

      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, pb: 2, pt: 1, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={() => navigate("/")}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
            {transcript?.title || "Recording"}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Copy text">
            <IconButton size="small" onClick={handleCopy} disabled={!transcript?.transcript}>
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download .txt">
            <IconButton size="small" onClick={handleDownload} disabled={!transcript?.transcript}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 3, bgcolor: "background.paper" }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && transcript && (
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              {transcript.recordedAt
                ? new Date(transcript.recordedAt).toLocaleString()
                : new Date(transcript.createdAt).toLocaleString()}
            </Typography>

            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6, mt: 2 }}>
              {transcript.transcript || "No transcript content available."}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default TranscriptView;
