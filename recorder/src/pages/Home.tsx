import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Logout as LogoutIcon,
  Mic as MicIcon,
  DesktopWindows as DesktopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Transcript } from "../services/planAiApi";
import type { DesktopSource } from "../types/electron";
import { AudioLevelMonitor } from "../components/AudioLevelMonitor";
import { saveConfig, type RecordingConfig } from "../utils/recorderConfig";

const Home: React.FC = () => {
  const { user, token, signOut, api } = useAuth();
  const navigate = useNavigate();

  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [systemSourceId, setSystemSourceId] = useState<string | null>(null);
  const [hasScreenPermission, setHasScreenPermission] = useState(true);
  const [hasMicPermission, setHasMicPermission] = useState(true);

  console.log(
    "[Home] Rendering component. sources:",
    desktopSources.length,
    "systemSourceId:",
    systemSourceId,
  );

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTranscripts();
      setTranscripts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDeleteTranscript = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this recording?")) return;
    try {
      await api.deleteTranscript(id);
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete transcript");
    }
  };

  const fetchDesktopSources = useCallback(async () => {
    try {
      const screenPerms = await window.electron.checkScreenRecordingPermission?.();
      setHasScreenPermission(screenPerms ?? true);

      const micPerms = await window.electron.checkMicrophonePermission?.();
      setHasMicPermission(micPerms ?? true);

      const sources = await window.electron.getDesktopSources();
      if (sources && sources.length > 0) {
        setDesktopSources(sources);
        // Immediate auto-select primary screen if nothing picked
        if (!systemSourceId) {
          const primary = sources.find((s) => s.id.startsWith("screen:"));
          if (primary) {
            console.log("[Home] Automatically defaulted to primary screen audio:", primary.name);
            setSystemSourceId(primary.id);
          }
        }
      }
    } catch (err) {
      console.error("[Home] Failed to fetch desktop sources:", err);
      setDesktopSources([]);
    }
  }, [systemSourceId]);

  useEffect(() => {
    void fetchDesktopSources();
  }, [fetchDesktopSources]);

  useEffect(() => {
    console.log("[Home] desktopSources state:", desktopSources.length);
  }, [desktopSources]);

  useEffect(() => {
    console.log("[Home] systemSourceId state:", systemSourceId);
  }, [systemSourceId]);

  const handleStartRecording = () => {
    const config: RecordingConfig = { systemSourceId };
    saveConfig(config);
    navigate(`/recording`);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Drag region / title bar */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
          flexShrink: 0,
        }}
      />

      <Box
        sx={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* ── LEFT: Transcripts list ────────────────────────────── */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 2, py: 1.5 }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                letterSpacing: 1,
                color: "text.secondary",
                textTransform: "uppercase",
              }}
            >
              Recent Recordings
            </Typography>
            <Tooltip title="Refresh recordings">
              <IconButton size="small" onClick={() => void fetchData()}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Divider sx={{ opacity: 0.4 }} />

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" sx={{ fontSize: "0.75rem" }}>
                {error}
              </Alert>
            </Box>
          ) : transcripts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              No recordings yet.
            </Typography>
          ) : (
            <List dense disablePadding sx={{ overflowY: "auto", flex: 1 }}>
              {transcripts.map((t) => (
                <ListItemButton
                  key={t.id}
                  onClick={() => navigate(`/transcript/${t.id}`)}
                  sx={{
                    px: 2,
                    py: 1,
                  }}
                >
                  <ListItemText
                    primary={t.title || "Untitled Recording"}
                    primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
                    secondary={new Date(t.createdAt).toLocaleString()}
                    secondaryTypographyProps={{ fontSize: "0.7rem" }}
                  />
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => void handleDeleteTranscript(e, t.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
              ))}
            </List>
          )}

          <Divider sx={{ mt: "auto", opacity: 0.4 }} />

          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5 }}>
            <Avatar
              src={user?.photoURL || undefined}
              sx={{ width: 28, height: 28, bgcolor: "primary.dark", fontSize: "0.7rem" }}
            >
              {!user?.photoURL && user?.email?.[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
              {user?.email}
            </Typography>
            <Tooltip title="Sign out">
              <IconButton size="small" onClick={() => void signOut()}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* ── RIGHT: General Recording  ───────────────────────── */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            pt: 10,
            gap: 4,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Start capturing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Record meetings or voice notes directly from your desktop.
            </Typography>
          </Box>

          {/* Recording Sources Configuration (Hidden, Auto-selected) */}
          <Box
            sx={{
              width: "100%",
              maxWidth: 300,
              p: 2,
              borderRadius: 2,
              bgcolor: "background.paper",
              border: "1px solid rgba(255,255,255,0.1)",
              mb: 4,
            }}
          >
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold" }}>
              Active Audio Sources
            </Typography>

            {/* Live Audio Monitors (Mic & System) */}
            <AudioLevelMonitor systemSourceId={systemSourceId} />

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1, fontStyle: "italic" }}
            >
              * Automatically capturing Microphone and System Audio (Screen 1)
            </Typography>
          </Box>

          <Box
            sx={{ width: "100%", maxWidth: 350, display: "flex", flexDirection: "column", gap: 2 }}
          >
            {!hasScreenPermission && navigator.userAgent.includes("Mac OS X") && (
              <Alert
                severity="error"
                variant="filled"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => window.electron.openSystemPreferences?.("screen")}
                  >
                    Open Settings
                  </Button>
                }
              >
                Screen Recording permission is required to capture system audio. Please enable it in
                macOS System Settings &rarr; Privacy & Security.
              </Alert>
            )}
            {!hasMicPermission && navigator.userAgent.includes("Mac OS X") && (
              <Alert
                severity="warning"
                variant="filled"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => window.electron.openSystemPreferences?.("microphone")}
                  >
                    Open Settings
                  </Button>
                }
              >
                Microphone permission is required to capture your voice. Please enable it in macOS
                System Settings &rarr; Privacy & Security.
              </Alert>
            )}
            <Button
              variant="contained"
              size="large"
              startIcon={<MicIcon />}
              onClick={handleStartRecording}
              fullWidth
              disabled={!hasScreenPermission || !hasMicPermission}
              sx={{ py: 1.5, fontSize: "1rem", borderRadius: 2 }}
            >
              Start Recording
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Home;
