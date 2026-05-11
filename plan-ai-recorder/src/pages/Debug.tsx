import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Stack,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Tabs,
  Tab,
  Button,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  CheckCircle,
  Cancel,
  ContentCopy as CopyIcon,
  FileDownload as DownloadIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { SystemDiagnostics } from "../types/electron";

interface LogEntry {
  timestamp: string;
  type: "log" | "warn" | "error";
  message: string;
}

// Global in-memory log sink to catch messages before/after the component mounts
const memoryLogSink: LogEntry[] = [];
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

const proxyConsole = (
  type: "log" | "warn" | "error",
  originalFn: any,
  ...args: any[]
) => {
  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  memoryLogSink.push({
    timestamp: new Date().toISOString(),
    type,
    message,
  });
  // Keep memory tight
  if (memoryLogSink.length > 200) memoryLogSink.shift();
  originalFn(...args);
};

console.log = (...args) => proxyConsole("log", originalConsoleLog, ...args);
console.warn = (...args) => proxyConsole("warn", originalConsoleWarn, ...args);
console.error = (...args) =>
  proxyConsole("error", originalConsoleError, ...args);

const Debug: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sysInfo, setSysInfo] = useState<
    | ({
        appVersion: string;
        micPerms: boolean;
        screenPerms: boolean;
      } & Partial<SystemDiagnostics>)
    | null
  >(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    // Poll the memory sink into state every second
    const interval = setInterval(() => {
      setLogs([...memoryLogSink]);
    }, 1000);
    // Initial sync
    setLogs([...memoryLogSink]);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadSysInfo = async () => {
      try {
        const [appVersion, micPerms, screenPerms, extendedDiag] =
          await Promise.all([
            window.electron.getAppVersion?.() || Promise.resolve("Unknown"),
            window.electron.checkMicrophonePermission?.() ||
              Promise.resolve(false),
            window.electron.checkScreenRecordingPermission?.() ||
              Promise.resolve(false),
            window.electron.getSystemDiagnostics?.() || Promise.resolve(null),
          ]);
        setSysInfo({ appVersion, micPerms, screenPerms, ...extendedDiag });
      } catch (err) {
        console.error("Failed to load debug sys info:", err);
      }
    };

    void loadSysInfo();
  }, [navigate]);

  const buildLogText = () =>
    logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.type.toUpperCase()}] ${l.message}`,
      )
      .join("\n");

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(buildLogText()).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleDownloadLogs = () => {
    const text = buildLogText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-ai-recorder-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: "background.default",
      }}
    >
      {/* Drag region header */}
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
          flex: 1,
          p: 3,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Navigation Bar */}
        <Box
          sx={{ width: "100%", display: "flex", alignItems: "center", mb: 4 }}
        >
          <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight="bold">
            Admin Debug Panel
          </Typography>
        </Box>

        <Tabs
          value={tabIndex}
          onChange={(_, newValue: number) => setTabIndex(newValue)}
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
          textColor="inherit"
          indicatorColor="primary"
        >
          <Tab label="Environment Vars" />
          <Tab label="System & Permissions" />
          <Tab label="Runtime Logs" />
          <Tab label="Sentry / Crash" />
        </Tabs>

        {/* Environment Variables Tab */}
        {tabIndex === 0 && (
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              gutterBottom
              color="primary.light"
            >
              Environment Variables (Vite define)
            </Typography>
            <List dense disablePadding>
              <ListItem disableGutters>
                <ListItemText
                  primary="VITE_PLAN_AI_API_URL"
                  secondary={
                    import.meta.env.VITE_PLAN_AI_API_URL || "undefined"
                  }
                  secondaryTypographyProps={{
                    sx: {
                      fontFamily: "monospace",
                      color: import.meta.env.VITE_PLAN_AI_API_URL
                        ? "success.light"
                        : "error.light",
                    },
                  }}
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary="VITE_PLAN_AI_WEB_URL"
                  secondary={
                    import.meta.env.VITE_PLAN_AI_WEB_URL || "undefined"
                  }
                  secondaryTypographyProps={{
                    sx: {
                      fontFamily: "monospace",
                      color: import.meta.env.VITE_PLAN_AI_WEB_URL
                        ? "success.light"
                        : "error.light",
                    },
                  }}
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary="NODE_ENV (Mode)"
                  secondary={import.meta.env.MODE || "undefined"}
                  secondaryTypographyProps={{ sx: { fontFamily: "monospace" } }}
                />
              </ListItem>
            </List>
          </Paper>
        )}

        {/* System & Electron Status Tab */}
        {tabIndex === 1 && (
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              gutterBottom
              color="secondary.light"
            >
              System & Permissions
            </Typography>
            {!sysInfo ? (
              <CircularProgress size={24} />
            ) : (
              <List dense disablePadding>
                <ListItem disableGutters>
                  <ListItemText
                    primary="App Version"
                    secondary={sysInfo.appVersion}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="User Agent"
                    secondary={navigator.userAgent}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText primary="Microphone Permission" />
                  {sysInfo.micPerms ? (
                    <CheckCircle color="success" fontSize="small" />
                  ) : (
                    <Cancel color="error" fontSize="small" />
                  )}
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText primary="Screen Recording Permission" />
                  {sysInfo.screenPerms ? (
                    <CheckCircle color="success" fontSize="small" />
                  ) : (
                    <Cancel color="error" fontSize="small" />
                  )}
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="OS Platform"
                    secondary={`${sysInfo.platform} (${sysInfo.arch})`}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="macOS Kernel"
                    secondary={sysInfo.osRelease}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="System Total Memory"
                    secondary={`${sysInfo.totalMemMB} MB`}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="System Free Memory"
                    secondary={`${sysInfo.freeMemMB} MB`}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Node Runtime"
                    secondary={sysInfo.nodeVersion}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Electron Shell"
                    secondary={sysInfo.electronVersion}
                    secondaryTypographyProps={{
                      sx: { fontFamily: "monospace" },
                    }}
                  />
                </ListItem>
              </List>
            )}
          </Paper>
        )}

        {/* Console Logs Tab */}
        {tabIndex === 2 && (
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(255,255,255,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Typography
                variant="subtitle1"
                fontWeight="bold"
                color="warning.light"
              >
                Runtime Session Logs
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Chip label={`${logs.length} entries`} size="small" />
                <IconButton
                  onClick={handleDownloadLogs}
                  size="small"
                  title="Download Logs as TXT"
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={handleCopyLogs}
                  size="small"
                  color={copySuccess ? "success" : "default"}
                  title="Copy Logs to Clipboard"
                >
                  {copySuccess ? (
                    <CheckCircle fontSize="small" />
                  ) : (
                    <CopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                maxHeight: 300,
                overflowY: "auto",
                bgcolor: "background.paper",
                borderRadius: 1,
                p: 2,
                fontFamily: "monospace",
                fontSize: "0.75rem",
              }}
            >
              {logs.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Waiting for logs...
                </Typography>
              ) : (
                logs.map((log, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      mb: 1,
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      pb: 0.5,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ color: "text.secondary", mr: 1 }}
                    >
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        color:
                          log.type === "error"
                            ? "error.main"
                            : log.type === "warn"
                              ? "warning.main"
                              : "text.primary",
                        wordBreak: "break-all",
                      }}
                    >
                      {log.message}
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Paper>
        )}

        {/* Sentry / Crash Tab */}
        {tabIndex === 3 && (
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              gutterBottom
              color="error.light"
            >
              Forced Crash Testing (Sentry)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Use these buttons to intentionally crash the application and verify that 
              Sentry successfully intercepts the exceptions and generates a report.
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="error"
                onClick={() => {
                  // Simulate an undefined function in React (Renderer Process)
                  // @ts-ignore
                  window.triggerRendererCrashSentry();
                }}
              >
                Crash Renderer Process
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={() => {
                  // Trigger native IPC crash simulating C++/Node failure
                  window.electron.simulateMainCrash();
                }}
              >
                Crash Main Process
              </Button>
            </Stack>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default Debug;
