import React, { useState, useRef } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link as MuiLink,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { NavLink } from "react-router-dom";
import ElectricalServicesIcon from "@mui/icons-material/ElectricalServices";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useListMcpTokensQuery, useRevokeMcpTokenMutation } from "../store/apis/mcpApi";

const getBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_BACKEND_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return window.location.origin;
};

const MCP_SSE_ENDPOINT = `${getBaseUrl()}/mcp/sse`;

// ─── SSE Tester ──────────────────────────────────────────────────────────────

interface LogLine {
  ts: string;
  type: "info" | "data" | "error" | "connected" | "closed";
  text: string;
}

const SseTester: React.FC = () => {
  const [token, setToken] = useState("");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const push = (type: LogLine["type"], text: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { ts, type, text }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const start = () => {
    if (!token.trim()) return;
    push("info", `Connecting to ${MCP_SSE_ENDPOINT} …`);
    setRunning(true);

    const url = `${MCP_SSE_ENDPOINT}`;
    // EventSource doesn't support custom headers natively — use a URL param workaround via fetch
    // Instead we'll use fetch + ReadableStream to simulate SSE with the Bearer header
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    void fetch(url, {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          push("error", `HTTP ${res.status} ${res.statusText}`);
          setRunning(false);
          return;
        }
        push("connected", `Connected — HTTP ${res.status}. Listening for events…`);
        const reader = res.body?.getReader();
        if (!reader) {
          push("error", "No readable body");
          setRunning(false);
          return;
        }
        const decoder = new TextDecoder();
        let buf = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            push("closed", "Stream closed by server.");
            setRunning(false);
            break;
          }
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data:")) push("data", line);
            else if (line.startsWith("event:")) push("info", line);
            else if (line.trim()) push("info", line);
          }
        }
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") push("error", err.message);
        setRunning(false);
      });
  };

  const stop = () => {
    abortCtrlRef.current?.abort();
    push("closed", "Disconnected by user.");
    setRunning(false);
  };

  const copyLogs = () => {
    void navigator.clipboard.writeText(logs.map((l) => `[${l.ts}] ${l.text}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const logColor: Record<LogLine["type"], string> = {
    info: "text.secondary",
    data: "success.main",
    error: "error.main",
    connected: "primary.main",
    closed: "warning.main",
  };

  return (
    <Card sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ElectricalServicesIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            SSE Connection Tester
          </Typography>
          <Chip
            label={running ? "LIVE" : "IDLE"}
            size="small"
            color={running ? "success" : "default"}
            sx={{ fontWeight: 700, animation: running ? "none" : undefined }}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Paste a token to open a real SSE connection to the MCP server and watch the raw stream.
        </Typography>

        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Bearer token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !running) start();
            }}
            sx={{ fontFamily: "monospace" }}
          />
          {!running ? (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={start}
              disabled={!token.trim()}
              sx={{ whiteSpace: "nowrap" }}
            >
              Connect
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={stop}
              sx={{ whiteSpace: "nowrap" }}
            >
              Disconnect
            </Button>
          )}
        </Stack>

        {/* Log output */}
        <Box
          sx={{
            position: "relative",
            bgcolor: "action.hover",
            borderRadius: 2,
            p: 1.5,
            minHeight: 180,
            maxHeight: 340,
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {logs.length === 0 ? (
            <Typography variant="caption" color="text.disabled">
              Waiting for connection…
            </Typography>
          ) : (
            logs.map((l, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1, mb: 0.3 }}>
                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                  {l.ts}
                </Typography>
                <Typography
                  variant="caption"
                  color={logColor[l.type]}
                  sx={{ wordBreak: "break-all" }}
                >
                  {l.text}
                </Typography>
              </Box>
            ))
          )}
          <div ref={logsEndRef} />

          {logs.length > 0 && (
            <Tooltip title={copied ? "Copied!" : "Copy logs"}>
              <IconButton
                size="small"
                onClick={copyLogs}
                sx={{ position: "absolute", top: 6, right: 6 }}
              >
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {logs.length > 0 && (
          <Button size="small" variant="text" onClick={() => setLogs([])}>
            Clear logs
          </Button>
        )}
      </Stack>
    </Card>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AdminMcp: React.FC = () => {
  const { data: tokensData, isLoading, refetch, isFetching } = useListMcpTokensQuery();
  const [revokeToken] = useRevokeMcpTokenMutation();
  const tokens = tokensData?.tokens ?? [];

  return (
    <SidebarLayout>
      <Box sx={{ p: 3, maxWidth: 1100, margin: "0 auto" }}>
        {/* Breadcrumbs */}
        <Breadcrumbs sx={{ mb: 2 }}>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/home">
            Home
          </MuiLink>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin">
            Admin
          </MuiLink>
          <Typography color="text.primary">MCP</Typography>
        </Breadcrumbs>

        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <ElectricalServicesIcon fontSize="large" color="primary" />
            <Box>
              <Typography variant="h4" fontWeight={800}>
                MCP Admin
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monitor tokens and test the MCP SSE endpoint.
              </Typography>
            </Box>
          </Stack>
          <Tooltip title="Refresh">
            <IconButton
              onClick={refetch}
              disabled={isFetching}
              color="primary"
              sx={{ bgcolor: "rgba(67,97,238,0.08)" }}
            >
              <RefreshIcon
                sx={{
                  animation: isFetching ? "spin 1s linear infinite" : "none",
                  "@keyframes spin": { "100%": { transform: "rotate(360deg)" } },
                }}
              />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack spacing={3}>
          {/* SSE Tester — top priority for "test it" use case */}
          <SseTester />

          {/* Token list */}
          <Card sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                All MCP Tokens
              </Typography>
              <Chip label={`${tokens.length}`} size="small" />
            </Stack>

            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : tokens.length === 0 ? (
              <Alert severity="info">No tokens have been created yet.</Alert>
            ) : (
              <Stack divider={<Divider />}>
                {tokens.map((token) => (
                  <Stack
                    key={token.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ py: 1.5, gap: 2 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {token.name}
                        </Typography>
                        <Chip
                          label={token.prefix + "…"}
                          size="small"
                          sx={{ fontFamily: "monospace", fontSize: 11 }}
                        />
                        <Chip
                          label={`ws: ${token.workspaceId.slice(0, 8)}…`}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: "monospace", fontSize: 10 }}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {token.lastUsedAt
                          ? `Last used ${new Date(token.lastUsedAt).toLocaleString()}`
                          : `Created ${new Date(token.createdAt).toLocaleString()} — never used`}
                      </Typography>
                    </Box>
                    <Tooltip title="Revoke token">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void revokeToken(token.id)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
          </Card>

          {/* Endpoint info */}
          <Card sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Endpoint Reference
            </Typography>
            <Stack spacing={1}>
              {[
                { label: "SSE Transport", value: `GET ${MCP_SSE_ENDPOINT}` },
                { label: "Auth", value: "Authorization: Bearer <token>" },
                { label: "Protocol", value: "MCP 1.0 over SSE (mcp-remote compatible)" },
              ].map((row) => (
                <Stack key={row.label} direction="row" spacing={2} alignItems="flex-start">
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ minWidth: 110, flexShrink: 0, fontWeight: 600, pt: 0.4 }}
                  >
                    {row.label}
                  </Typography>
                  <Box
                    component="code"
                    sx={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      bgcolor: "action.hover",
                      px: 1,
                      py: 0.3,
                      borderRadius: 1,
                      wordBreak: "break-all",
                    }}
                  >
                    {row.value}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Stack>
      </Box>
    </SidebarLayout>
  );
};

export default AdminMcp;
