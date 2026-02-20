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

export interface RecordingConfig {
  systemSourceId: string | null;
}

const CONFIG_KEY = "recorder-config";
export const saveConfig = (config: RecordingConfig) =>
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
export const loadConfig = (): RecordingConfig | null => {
  const raw = sessionStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as RecordingConfig) : null;
};

const Home: React.FC = () => {
  const { user, token, signOut, api } = useAuth();
  const navigate = useNavigate();

  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [systemSourceId, setSystemSourceId] = useState<string | null>(null);

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

  useEffect(() => {
    window.electron
      .getDesktopSources()
      .then(setDesktopSources)
      .catch(() => setDesktopSources([]));
  }, []);

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
            justifyContent: "center",
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

          <Box sx={{ width: "100%", maxWidth: 300 }}>
            {/* System audio source */}
            <FormControl size="small" fullWidth sx={{ mb: 4 }}>
              <InputLabel>System audio source</InputLabel>
              <Select
                value={systemSourceId ?? "default"}
                label="System audio source"
                onChange={(e) =>
                  setSystemSourceId(e.target.value === "default" ? null : e.target.value)
                }
                renderValue={(selected) => {
                  if (selected === "default") {
                    return (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <MicIcon fontSize="small" />
                        <span>Microphone only</span>
                      </Stack>
                    );
                  }
                  const src = desktopSources.find((s) => s.id === selected);
                  return (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DesktopIcon fontSize="small" />
                      <span>{src?.name || "Unknown"}</span>
                    </Stack>
                  );
                }}
              >
                <MenuItem value="default">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <MicIcon fontSize="small" />
                    <span>Microphone only</span>
                  </Stack>
                </MenuItem>
                {desktopSources.map((src) => (
                  <MenuItem key={src.id} value={src.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DesktopIcon fontSize="small" />
                      <span>{src.name}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="large"
              startIcon={<MicIcon />}
              onClick={handleStartRecording}
              fullWidth
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
