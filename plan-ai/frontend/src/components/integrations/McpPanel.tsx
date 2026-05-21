import React, { useState, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import TokenIcon from "@mui/icons-material/Token";
import LockIcon from "@mui/icons-material/Lock";
import {
  useListMcpTokensQuery,
  useCreateMcpTokenMutation,
  useRevokeMcpTokenMutation,
} from "../../store/apis/mcpApi";

// ─── Constants ───────────────────────────────────────────────────────────────

const MCP_SSE_ENDPOINT = "https://api.plan-ai.blueberrybytes.com/mcp/sse";

const MCP_CONNECT_TABS = [
  { label: "Claude Code", id: "claude-code" },
  { label: "Claude Desktop", id: "claude-desktop" },
  { label: "Cursor", id: "cursor" },
];

type OsId = "mac" | "windows" | "linux";

const CLAUDE_DESKTOP_PATHS: Record<OsId, string> = {
  mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
  windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
  linux: "~/.config/Claude/claude_desktop_config.json",
};

const CURSOR_PATHS: Record<OsId, string> = {
  mac: "~/.cursor/mcp.json",
  windows: "%USERPROFILE%\\.cursor\\mcp.json",
  linux: "~/.cursor/mcp.json",
};

const CLAUDE_DESKTOP_STEPS = [
  { icon: "1️⃣", text: "Open Claude Desktop" },
  { icon: "2️⃣", text: 'Click "Claude" in the macOS menu bar → Settings…' },
  { icon: "3️⃣", text: 'Go to the "Developer" tab' },
  { icon: "4️⃣", text: 'Click "Edit Config" — it opens the JSON file directly' },
  { icon: "5️⃣", text: "Paste the snippet above (merge into mcpServers if you already have others)" },
  { icon: "6️⃣", text: "Save the file and fully quit + reopen Claude Desktop" },
];

const CURSOR_STEPS = [
  { icon: "1️⃣", text: "Open Cursor" },
  { icon: "2️⃣", text: "Press Cmd/Ctrl + Shift + P → type \"Cursor Settings\"" },
  { icon: "3️⃣", text: 'Go to "Tools & Integrations" (or "Features → MCP")' },
  { icon: "4️⃣", text: 'Click "Add new global MCP server" or edit the config file directly' },
  { icon: "5️⃣", text: "Paste the snippet above and save" },
];

function getMcpConnectSnippet(tab: string, token: string): string {
  switch (tab) {
    case "claude-code":
      return `claude mcp add plan-ai -- npx mcp-remote@latest \\\n  ${MCP_SSE_ENDPOINT} \\\n  --header "Authorization: Bearer ${token}"`;
    case "claude-desktop":
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            "plan-ai": {
              command: "npx",
              args: ["mcp-remote@latest", MCP_SSE_ENDPOINT],
              env: { MCP_HEADER_AUTHORIZATION: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      );
    default:
      return "";
  }
}

// ─── OS Picker ───────────────────────────────────────────────────────────────

function detectOs(): OsId {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Mac")) return "mac";
  return "linux";
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: "get_recent_meetings",
    emoji: "🎙️",
    description: "Lists your latest meetings with title, date, duration, and which project they belong to.",
  },
  {
    name: "get_meeting_detail",
    emoji: "📋",
    description: "Fetches the full transcript, summary, and linked tasks for a specific meeting by ID.",
  },
  {
    name: "search_meetings",
    emoji: "🔍",
    description: "Full-text search across meeting titles, summaries, and transcripts using any keyword or phrase.",
  },
  {
    name: "get_projects",
    emoji: "📁",
    description: "Returns all projects in your workspace with their status, meeting count, and task count.",
  },
  {
    name: "get_tasks",
    emoji: "✅",
    description: "Lists tasks filtered by status (Todo, In Progress, Done…) or by a specific project.",
  },
  {
    name: "search_tasks",
    emoji: "🎯",
    description: "Searches task titles and descriptions for a keyword — useful for finding action items.",
  },
];

// ─── Step-by-step hint ───────────────────────────────────────────────────────

interface SetupHintProps {
  steps: { icon: string; text: string }[];
  configPath: string;
  os: OsId;
  onOsChange: (os: OsId) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}

const SetupHint: React.FC<SetupHintProps> = ({
  steps,
  configPath,
  os,
  onOsChange,
  onCopy,
  copied,
}) => (
  <Box
    sx={(theme) => ({
      mt: 1,
      p: 2,
      borderRadius: 2,
      border: `1px solid ${theme.palette.divider}`,
      bgcolor: "action.hover",
    })}
  >
    <Stack spacing={2}>
      {/* Steps */}
      <Stack spacing={1}>
        {steps.map((step) => (
          <Stack key={step.icon} direction="row" spacing={1} alignItems="flex-start">
            <Typography sx={{ fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>
              {step.icon}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {step.text}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Divider />

      {/* Fallback: manual file path */}
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Or edit the config file directly:
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={os}
            onChange={(_, v: OsId | null) => { if (v) onOsChange(v); }}
            sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1, fontSize: 11, textTransform: "none" } }}
          >
            <ToggleButton value="mac">macOS</ToggleButton>
            <ToggleButton value="windows">Windows</ToggleButton>
            <ToggleButton value="linux">Linux</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            component="code"
            sx={{
              flex: 1,
              fontSize: 11,
              fontFamily: "monospace",
              bgcolor: "background.paper",
              px: 1,
              py: 0.5,
              borderRadius: 1,
              wordBreak: "break-all",
            }}
          >
            {configPath}
          </Box>
          <Tooltip title={copied ? "Copied!" : "Copy path"}>
            <IconButton size="small" onClick={() => onCopy(configPath)}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Stack>
  </Box>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface McpPanelProps {
  workspaceId: string;
}

const McpPanel: React.FC<McpPanelProps> = ({ workspaceId }) => {
  const { data: tokensData, isLoading: isTokensLoading } = useListMcpTokensQuery();
  const [createToken, { isLoading: isCreating }] = useCreateMcpTokenMutation();
  const [revokeToken] = useRevokeMcpTokenMutation();

  const [newTokenName, setNewTokenName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // rawToken is only available right after creation — never stored after dialog closes
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [connectTabIdx, setConnectTabIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string>("");
  const [os, setOs] = useState<OsId>(detectOs);

  const tokens = useMemo(() => tokensData?.tokens ?? [], [tokensData]);

  // Auto-select first token when list loads
  React.useEffect(() => {
    if (tokens.length > 0 && !selectedTokenId) {
      setSelectedTokenId(tokens[0].id);
    }
  }, [tokens, selectedTokenId]);

  const selectedToken = tokens.find((t) => t.id === selectedTokenId);

  const handleCreate = async () => {
    if (!newTokenName.trim() || !workspaceId) return;
    try {
      const result = await createToken({ name: newTokenName.trim(), workspaceId }).unwrap();
      setRawToken(result.rawToken);
      setNewTokenName("");
    } catch (e) {
      console.error("Failed to create MCP token", e);
    }
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setRawToken(null);
    setNewTokenName("");
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTabId = MCP_CONNECT_TABS[connectTabIdx].id;

  // Snippet in the main panel uses the token PREFIX as a visual label only.
  // The REAL token copy happens inside the creation dialog.
  const panelSnippet = getMcpConnectSnippet(
    currentTabId,
    selectedToken ? selectedToken.prefix + "…  ← replace with your full token" : "",
  );

  const claudeDesktopPath = CLAUDE_DESKTOP_PATHS[os];
  const cursorPath = CURSOR_PATHS[os];

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Stack spacing={4}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="h5">Plan AI MCP</Typography>
            <Chip label="NEW" size="small" color="primary" sx={{ fontWeight: "bold" }} />
          </Stack>
          <Typography variant="body1" color="text.secondary">
            Connect AI coding tools like Claude Code, Claude Desktop, or Cursor directly to your
            Plan AI workspace. Once connected, you can ask questions about your meetings, tasks,
            and projects in natural language — without leaving your editor.
          </Typography>
        </Box>

        {/* ── Step 1 — Tokens ────────────────────────────────────────── */}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <TokenIcon fontSize="small" color="action" />
              <Typography variant="subtitle1" fontWeight="bold">
                Step 1 — Create a Personal Access Token
              </Typography>
            </Stack>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              disabled={!workspaceId}
            >
              New Token
            </Button>
          </Stack>

          {!workspaceId && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              Select an active workspace to manage MCP tokens.
            </Alert>
          )}

          {isTokensLoading ? (
            <CircularProgress size={24} sx={{ display: "block", my: 2 }} />
          ) : tokens.length === 0 ? (
            <Alert severity="info">
              No tokens yet — create one above to unlock the connection snippet below.
            </Alert>
          ) : (
            <Stack divider={<Divider />}>
              {tokens.map((token) => (
                <ListItem
                  key={token.id}
                  disableGutters
                  secondaryAction={
                    <Tooltip title="Revoke token">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void revokeToken(token.id)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight={600}>
                          {token.name}
                        </Typography>
                        <Chip
                          label={token.prefix + "…"}
                          size="small"
                          sx={{ fontFamily: "monospace", fontSize: 11 }}
                        />
                      </Stack>
                    }
                    secondary={
                      token.lastUsedAt
                        ? `Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                        : `Created ${new Date(token.createdAt).toLocaleDateString()} — never used`
                    }
                  />
                </ListItem>
              ))}
            </Stack>
          )}
        </Box>

        {/* ── Step 2 — Connect ───────────────────────────────────────── */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Step 2 — Connect Your Tool
            </Typography>
            {tokens.length === 0 && (
              <Chip
                icon={<LockIcon sx={{ fontSize: 14 }} />}
                label="Create a token first"
                size="small"
                variant="outlined"
                color="warning"
              />
            )}
          </Stack>

          {tokens.length === 0 ? (
            <Alert severity="warning">
              Create a token above to get your ready-to-paste connection snippet. The snippet will
              include your real token so you can copy it in one click.
            </Alert>
          ) : (
            <Stack spacing={2}>
              {/* Token selector */}
              <FormControl size="small" sx={{ maxWidth: 320 }}>
                <InputLabel>Token</InputLabel>
                <Select
                  label="Token"
                  value={selectedTokenId}
                  onChange={(e) => setSelectedTokenId(e.target.value)}
                >
                  {tokens.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 1, fontFamily: "monospace" }}
                      >
                        ({t.prefix}…)
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Alert severity="info" sx={{ py: 0.5 }}>
                Your full token was shown <strong>once</strong> when you created it. If you lost
                it, revoke this one and create a new token — the snippet will include the real value
                right after creation.
              </Alert>

              {/* Connect tabs */}
              <Tabs
                value={connectTabIdx}
                onChange={(_, v: number) => setConnectTabIdx(v)}
                sx={{ borderBottom: 1, borderColor: "divider" }}
              >
                {MCP_CONNECT_TABS.map((t) => (
                  <Tab key={t.id} label={t.label} sx={{ textTransform: "none" }} />
                ))}
              </Tabs>

              {/* Snippet block */}
              <Box sx={{ position: "relative" }}>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1.5,
                    p: 2,
                    pr: 6,
                    fontSize: 12,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    overflowX: "auto",
                    m: 0,
                  }}
                >
                  {panelSnippet}
                </Box>
                <Tooltip title={copied ? "Copied!" : "Copy"}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(panelSnippet)}
                    sx={{ position: "absolute", top: 8, right: 8 }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Claude Code — just run the command, nothing extra needed */}
              {currentTabId === "claude-code" && (
                <Typography variant="caption" color="text.secondary">
                  Run this command in your terminal. Claude Code will automatically pick up the new
                  server on next launch.
                </Typography>
              )}

              {/* Claude Desktop — step-by-step guide + file path fallback */}
              {currentTabId === "claude-desktop" && (
                <SetupHint
                  steps={CLAUDE_DESKTOP_STEPS}
                  configPath={claudeDesktopPath}
                  os={os}
                  onOsChange={setOs}
                  onCopy={handleCopy}
                  copied={copied}
                />
              )}

              {/* Cursor — step-by-step guide + file path fallback */}
              {currentTabId === "cursor" && (
                <SetupHint
                  steps={CURSOR_STEPS}
                  configPath={cursorPath}
                  os={os}
                  onOsChange={setOs}
                  onCopy={handleCopy}
                  copied={copied}
                />
              )}
            </Stack>
          )}
        </Box>

        {/* ── Available tools ────────────────────────────────────────── */}
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Available Tools
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These tools are automatically available to your AI assistant once connected. It can call
            them silently in the background to answer your questions.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 1.5,
            }}
          >
            {MCP_TOOLS.map((tool) => (
              <Box
                key={tool.name}
                sx={(theme) => ({
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: "action.hover",
                  transition: "border-color 0.15s",
                  "&:hover": { borderColor: "primary.main" },
                })}
              >
                <Box sx={{ fontSize: 20, lineHeight: 1, mt: 0.2, flexShrink: 0 }}>
                  {tool.emoji}
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", fontWeight: 700, display: "block" }}
                  >
                    {tool.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tool.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Stack>

      {/* ── Create token dialog ─────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {rawToken ? "🎉 Token Created — Copy it now" : "New MCP Token"}
        </DialogTitle>
        <DialogContent>
          {rawToken ? (
            <Stack spacing={2}>
              <Alert severity="warning">
                This is the <strong>only time</strong> you&apos;ll see this token. Copy it before
                closing.
              </Alert>

              {/* Raw token */}
              <Box sx={{ position: "relative" }}>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1.5,
                    p: 2,
                    pr: 6,
                    fontSize: 12,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    whiteSpace: "pre-wrap",
                    m: 0,
                  }}
                >
                  {rawToken}
                </Box>
                <Tooltip title={copied ? "Copied!" : "Copy token"}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(rawToken)}
                    sx={{ position: "absolute", top: 8, right: 8 }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              <Divider />

              {/* Ready-to-paste snippet for Claude Code */}
              <Typography variant="subtitle2" fontWeight={600}>
                Or copy the ready-to-paste Claude Code command:
              </Typography>
              <Box sx={{ position: "relative" }}>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1.5,
                    p: 1.5,
                    pr: 6,
                    fontSize: 11,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    m: 0,
                  }}
                >
                  {getMcpConnectSnippet("claude-code", rawToken)}
                </Box>
                <Tooltip title={copied ? "Copied!" : "Copy command"}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(getMcpConnectSnippet("claude-code", rawToken))}
                    sx={{ position: "absolute", top: 8, right: 8 }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Give this token a label so you can identify it later (e.g. &quot;Claude Code —
                MacBook&quot;).
              </Typography>
              <TextField
                fullWidth
                label="Token name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog}>{rawToken ? "Done" : "Cancel"}</Button>
          {!rawToken && (
            <Button
              variant="contained"
              onClick={() => void handleCreate()}
              disabled={!newTokenName.trim() || isCreating || !workspaceId}
              startIcon={isCreating ? <CircularProgress size={16} /> : undefined}
            >
              Create Token
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default McpPanel;
