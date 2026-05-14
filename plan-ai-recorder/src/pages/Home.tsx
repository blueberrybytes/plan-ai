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
  TextField,
  Autocomplete,
} from "@mui/material";
import {
  Logout as LogoutIcon,
  Mic as MicIcon,
  DesktopWindows as DesktopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  BugReport as BugIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Transcript } from "../services/planAiApi";
import type { DesktopSource } from "../types/electron";
import { AudioLevelMonitor } from "../components/AudioLevelMonitor";
import { saveConfig, type RecordingConfig } from "../utils/recorderConfig";
import { DEEPGRAM_LANGUAGES } from "../utils/deepgramLanguages";
import { PrivacyConsentDialog } from "../components/PrivacyConsentDialog";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher";

const Home: React.FC = () => {
  const { user, dbUser, token, signOut, api, activeWorkspaceId } = useAuth();
  const navigate = useNavigate();

  // Check role injected by backend via AuthProvider
  const isAdmin = dbUser?.role === "ADMIN";

  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [systemSourceId, setSystemSourceId] = useState<string | null>(null);
  const [hasScreenPermission, setHasScreenPermission] = useState(true);
  const [hasMicPermission, setHasMicPermission] = useState(true);

  const [language, setLanguage] = useState<string>(""); // "" = auto
  const [micInputs, setMicInputs] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string>("default");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    // Apple App Store Privacy Consent Requirement Check
    const hasConsented = localStorage.getItem("planai_privacy_consent_v1");
    if (!hasConsented) {
      setConsentOpen(true);
    }
  }, []);

  const handleAcceptConsent = () => {
    localStorage.setItem("planai_privacy_consent_v1", "true");
    setConsentOpen(false);
  };

  const handleDeclineConsent = async () => {
    // Forcefully stop user from using internal app without consenting to privacy policy
    await signOut();
  };

  console.log(
    "[Home] Rendering component. sources:",
    desktopSources.length,
    "systemSourceId:",
    systemSourceId,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTranscripts(debouncedSearch);
      setTranscripts(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recordings.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspaceId, debouncedSearch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Enumerate microphone input devices
  useEffect(() => {
    const loadMicDevices = async () => {
      try {
        // Need to request permission first so labels are available
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setMicInputs(inputs);
        // Auto-select the built-in mic if FreeBuds (or headphones-only) is default
        const builtin = inputs.find(
          (d) =>
            d.label.toLowerCase().includes("built-in") ||
            d.label.toLowerCase().includes("macbook"),
        );
        if (builtin) {
          setMicDeviceId(builtin.deviceId);
        }
      } catch (err) {
        console.warn("[Home] Failed to enumerate mic devices:", err);
      }
    };
    void loadMicDevices();
  }, []);

  const handleEditStart = (e: React.MouseEvent, t: Transcript) => {
    e.stopPropagation();
    setEditingId(t.id);
    setEditTitle(t.title || "Untitled Recording");
  };

  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle("");
  };

  const handleEditSave = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editTitle.trim() || !api) return;

    try {
      setSavingId(id);
      await api.updateTranscript(id, { title: editTitle.trim() });
      setTranscripts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: editTitle.trim() } : t)),
      );
      setEditingId(null);
    } catch (err) {
      console.error("Failed to update title:", err);
      // Optional: show error toast here
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteTranscript = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this recording?"))
      return;
    try {
      await api.deleteTranscript(id);
      void fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete transcript",
      );
    }
  };

  const fetchDesktopSources = useCallback(async () => {
    try {
      const screenPerms =
        await window.electron.checkScreenRecordingPermission?.();
      setHasScreenPermission(screenPerms ?? true);

      const micPerms = await window.electron.checkMicrophonePermission?.();
      setHasMicPermission(micPerms ?? true);

      if (window.electron.platform !== "darwin" || screenPerms) {
        const sources = await window.electron.getDesktopSources();
        if (sources && sources.length > 0) {
          setDesktopSources(sources);
          // Immediate auto-select primary screen if nothing picked
          if (!systemSourceId) {
            const primary = sources.find((s) => s.id.startsWith("screen:"));
            if (primary) {
              console.log(
                "[Home] Automatically defaulted to primary screen audio:",
                primary.name,
              );
              setSystemSourceId(primary.id);
            }
          }
        }
      } else {
        console.warn(
          "[Home] Screen permissions missing, skipping desktop capturer mapping.",
        );
        setDesktopSources([]);
      }
    } catch (err) {
      console.error("[Home] Failed to fetch desktop sources:", err);
      // Give the user visibility on exactly why system sources failed to load
      alert(
        `System Audio Init Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      setDesktopSources([]);
    }
  }, [systemSourceId]);

  useEffect(() => {
    void fetchDesktopSources();

    const handleFocus = () => {
      console.log(
        "[Home] Window focused, re-checking permissions and sources...",
      );
      void fetchDesktopSources();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchDesktopSources]);

  useEffect(() => {
    console.log("[Home] desktopSources state:", desktopSources.length);
  }, [desktopSources]);

  useEffect(() => {
    console.log("[Home] systemSourceId state:", systemSourceId);
  }, [systemSourceId]);

  const handleStartRecording = () => {
    const config: RecordingConfig = { systemSourceId, language, micDeviceId };
    saveConfig(config);
    navigate(`/recording`);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <PrivacyConsentDialog
        open={consentOpen}
        onAccept={handleAcceptConsent}
        onDecline={handleDeclineConsent}
      />

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
          <WorkspaceSwitcher />

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

          <Box sx={{ px: 2, pb: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                sx: { fontSize: "0.875rem", borderRadius: 2 },
              }}
            />
          </Box>

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
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ p: 2, textAlign: "center" }}
            >
              No recordings yet.
            </Typography>
          ) : (
            <List
              dense
              disablePadding
              sx={{
                overflowY: "auto",
                flex: 1,
                "&::-webkit-scrollbar": { width: 6 },
                "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: "rgba(255,255,255,0.1)",
                  borderRadius: 3,
                  "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
                },
              }}
            >
              {transcripts.map((t) => (
                <ListItemButton
                  key={t.id}
                  onClick={() => {
                    if (editingId !== t.id) navigate(`/transcript/${t.id}`);
                  }}
                  sx={{
                    px: 2,
                    py: 1,
                  }}
                >
                  {editingId === t.id ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        flex: 1,
                        mr: 1,
                        gap: 0.5,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TextField
                        size="small"
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void handleEditSave(e as any, t.id);
                          if (e.key === "Escape") handleEditCancel(e as any);
                        }}
                        sx={{ flex: 1 }}
                        InputProps={{
                          sx: { fontSize: "0.875rem", py: 0 },
                        }}
                      />
                      <IconButton
                        size="small"
                        color="success"
                        onClick={(e) => void handleEditSave(e, t.id)}
                        disabled={savingId === t.id}
                      >
                        {savingId === t.id ? (
                          <CircularProgress size={16} />
                        ) : (
                          <CheckIcon fontSize="small" />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
                        color="default"
                        onClick={handleEditCancel}
                        disabled={savingId === t.id}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.875rem" }}>
                              {t.title || "Untitled Recording"}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              {t.durationSeconds && (
                                <Typography variant="caption" sx={{ border: '1px solid rgba(255,255,255,0.2)', px: 0.5, py: 0.2, borderRadius: 1, fontSize: '0.65rem', color: "text.secondary" }}>
                                  ⏱️ {Math.floor(t.durationSeconds / 60)}m {t.durationSeconds % 60}s
                                </Typography>
                              )}
                              {t.speakerCount ? (
                                <Typography variant="caption" sx={{ border: '1px solid rgba(255,255,255,0.2)', px: 0.5, py: 0.2, borderRadius: 1, fontSize: '0.65rem', color: "text.secondary" }}>
                                  🎙️ {t.speakerCount}
                                </Typography>
                              ) : null}
                              {t.sentiment && (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                  <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
                                    Sentiment:
                                  </Typography>
                                  <Typography variant="caption" sx={{ border: `1px solid ${t.sentiment === 'POSITIVE' ? '#4ade80' : t.sentiment === 'NEGATIVE' ? '#f87171' : '#fbbf24'}`, px: 0.5, py: 0.2, borderRadius: 1, fontSize: '0.65rem', color: t.sentiment === 'POSITIVE' ? '#4ade80' : t.sentiment === 'NEGATIVE' ? '#f87171' : '#fbbf24' }}>
                                    {t.sentiment}
                                  </Typography>
                                </Box>
                              )}
                              {(t.metadata as any)?.processingStatus === "FAILED" && (
                                <Tooltip title={(t.metadata as any)?.errorMessage || "Failed to process"}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="caption" sx={{ border: '1px solid #f87171', px: 0.5, py: 0.2, borderRadius: 1, fontSize: '0.65rem', color: '#f87171', bgcolor: 'rgba(248, 113, 113, 0.1)' }}>
                                      ⚠️ Failed
                                    </Typography>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        api.reprocessTranscript(t.id).then(() => fetchData()).catch((err) => setError(err instanceof Error ? err.message : "Failed to retry transcript."));
                                      }}
                                      sx={{ fontSize: "0.6rem", py: 0, minWidth: 0 }}
                                    >
                                      Retry
                                    </Button>
                                  </Box>
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        }
                        secondary={new Date(t.createdAt).toLocaleString()}
                        secondaryTypographyProps={{
                          fontSize: "0.7rem",
                          mt: 0.5,
                        }}
                      />
                      <IconButton
                        size="small"
                        color="default"
                        onClick={(e) => handleEditStart(e, t)}
                        sx={{ mr: 0.5 }}
                      >
                        <EditIcon
                          fontSize="small"
                          sx={{ fontSize: "1.1rem" }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => void handleDeleteTranscript(e, t.id)}
                      >
                        <DeleteIcon
                          fontSize="small"
                          sx={{ fontSize: "1.1rem" }}
                        />
                      </IconButton>
                    </>
                  )}
                </ListItemButton>
              ))}
            </List>
          )}

          <Divider sx={{ mt: "auto", opacity: 0.4 }} />

          <Box sx={{ px: 2, pt: 2, pb: 0 }}>
            <Button
              variant="outlined"
              fullWidth
              size="small"
              onClick={() => {
                const webUrl =
                  import.meta.env.VITE_PLAN_AI_WEB_URL ||
                  "https://plan-ai.blueberrybytes.com";
                void window.electron.openExternalUrl(webUrl);
              }}
              sx={{
                color: "text.secondary",
                borderColor: "rgba(255,255,255,0.1)",
                textTransform: "none",
                fontSize: "0.75rem",
                "&:hover": {
                  borderColor: "primary.main",
                  color: "primary.main",
                },
              }}
            >
              Explore Web Features ↗
            </Button>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 2, py: 1.5, minWidth: 0 }}
          >
            <Box
              onClick={() => navigate("/profile")}
              sx={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                gap: 1,
                cursor: "pointer",
                p: 0.5,
                borderRadius: 1,
                minWidth: 0,
                "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
              }}
            >
              <Avatar
                src={user?.photoURL || undefined}
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: "primary.dark",
                  fontSize: "0.7rem",
                  flexShrink: 0,
                }}
              >
                {!user?.photoURL && user?.email?.[0]?.toUpperCase()}
              </Avatar>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ flex: 1, minWidth: 0 }}
              >
                {user?.email}
              </Typography>
            </Box>
            {isAdmin && (
              <Tooltip title="Admin Debug">
                <IconButton
                  size="small"
                  onClick={() => navigate("/debug")}
                  sx={{ flexShrink: 0 }}
                >
                  <BugIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Sign out">
              <IconButton
                size="small"
                onClick={async () => {
                  if (window.electron?.clearAuthSession) {
                    try {
                      console.log(
                        "[Home Logout] Wiping Chromium Apple Cookies...",
                      );
                      await window.electron.clearAuthSession();
                    } catch (err) {
                      console.warn(
                        "[Home Logout] Failed to clear Electron auth session:",
                        err,
                      );
                    }
                  }
                  await signOut();
                }}
                sx={{ flexShrink: 0 }}
              >
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
          {/* Global Permission Warnings */}
          <Box
            sx={{
              width: "100%",
              maxWidth: 600,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              mb: 2,
            }}
          >
            {!hasScreenPermission && window.electron.platform === "darwin" && (
              <Alert
                severity="error"
                variant="filled"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() =>
                      window.electron.openSystemPreferences?.("screen")
                    }
                  >
                    Open Settings
                  </Button>
                }
              >
                Screen Recording permission is required to capture system audio.
                Please enable it in macOS System Settings &rarr; Privacy &
                Security, then <strong>restart the app.</strong>
              </Alert>
            )}
            {!hasMicPermission && window.electron.platform === "darwin" && (
              <Alert
                severity="warning"
                variant="filled"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() =>
                      window.electron.openSystemPreferences?.("microphone")
                    }
                  >
                    Open Settings
                  </Button>
                }
              >
                Microphone permission is required to record your voice. Please
                enable it in macOS System Settings &rarr; Privacy & Security.
              </Alert>
            )}
          </Box>

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
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontWeight: "bold" }}
            >
              Active Audio Sources
            </Typography>

            {/* Live Audio Monitors (Mic & System) */}
            <AudioLevelMonitor
              systemSourceId={systemSourceId}
              micDeviceId={micDeviceId}
            />

            {/* Microphone Source Selector */}
            {micInputs.length > 1 && (
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel id="mic-source-label">
                  <MicIcon
                    sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }}
                  />
                  Microphone
                </InputLabel>
                <Select
                  labelId="mic-source-label"
                  value={micDeviceId}
                  label="Microphone"
                  onChange={(e) => setMicDeviceId(e.target.value)}
                  sx={{ fontSize: "0.8rem" }}
                >
                  {micInputs.map((d) => (
                    <MenuItem
                      key={d.deviceId}
                      value={d.deviceId}
                      sx={{ fontSize: "0.8rem" }}
                    >
                      {d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1, fontStyle: "italic", mb: 2 }}
            >
              * Automatically capturing Microphone and System Audio (Screen 1)
            </Typography>

            <Divider sx={{ mb: 2, opacity: 0.2 }} />

            <Autocomplete
              size="small"
              fullWidth
              options={[
                { code: "", name: "Auto-Detect (May mix languages)" },
                ...Object.entries(DEEPGRAM_LANGUAGES)
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([code, name]) => ({ code, name })),
              ]}
              getOptionLabel={(option) => option.name}
              value={
                language === ""
                  ? { code: "", name: "Auto-Detect (May mix languages)" }
                  : {
                      code: language,
                      name: DEEPGRAM_LANGUAGES[language] || language,
                    }
              }
              onChange={(_, newValue) => {
                setLanguage(newValue ? newValue.code : "");
              }}
              isOptionEqualToValue={(option, value) =>
                option.code === value.code
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Spoken Language"
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                  }}
                />
              )}
            />
          </Box>

          <Box
            sx={{
              width: "100%",
              maxWidth: 350,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Button
              variant="contained"
              size="large"
              startIcon={<MicIcon />}
              onClick={handleStartRecording}
              fullWidth
              disabled={
                window.electron.platform === "darwin" &&
                (!hasScreenPermission || !hasMicPermission)
              }
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
