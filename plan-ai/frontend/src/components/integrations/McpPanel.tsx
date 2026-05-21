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
  IconButton,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import TokenIcon from "@mui/icons-material/Token";
import LockIcon from "@mui/icons-material/Lock";
import {
  useListMcpTokensQuery,
  useCreateMcpTokenMutation,
  useRevokeMcpTokenMutation,
} from "../../store/apis/mcpApi";
import { downloadMcpExtension } from "../../utils/downloadMcpExtension";

// ─── Constants ───────────────────────────────────────────────────────────────

const getBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_BACKEND_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return window.location.origin;
};

const MCP_SSE_ENDPOINT = `${getBaseUrl()}/mcp/sse`;

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
  const [copied, setCopied] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string>("");

  const tokens = useMemo(() => tokensData?.tokens ?? [], [tokensData]);

  // Auto-select first token when list loads
  React.useEffect(() => {
    if (tokens.length > 0 && !selectedTokenId) {
      setSelectedTokenId(tokens[0].id);
    }
  }, [tokens, selectedTokenId]);

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
              Create a token above to get started. Once created, you can download a Desktop Extension 
              to install in Claude Desktop in just one click!
            </Alert>
          ) : (
            <Stack spacing={3}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Your full token was shown <strong>once</strong> when you created it. If you lost
                it, revoke this one and create a new token. You can instantly download a pre-configured 
                extension right from the creation dialog!
              </Alert>

              <Box sx={{ p: 3, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography variant="h6" gutterBottom>
                  Connecting Claude Desktop
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  The easiest way to connect Claude Desktop to Plan AI is by using a Desktop Extension bundle (<code>.mcpb</code>). 
                  When you create a new token, click the <strong>Download Desktop Extension</strong> button.
                </Typography>
                
                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                  Installation Steps:
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {[
                    "1. Open Claude Desktop",
                    "2. Go to Settings (or Preferences on Mac)",
                    "3. Select the 'Extensions' tab",
                    "4. Go to 'Advanced' and click 'Install Extension...'",
                    "5. Select the plan-ai.mcpb file you downloaded"
                  ].map(step => (
                    <Typography key={step} variant="body2" sx={{ ml: 1 }}>
                      {step}
                    </Typography>
                  ))}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                  Note: Manual JSON configuration via <code>mcp-remote</code> is no longer supported as our server uses direct Bearer tokens for better security instead of OAuth. Support for Cursor and Claude Code is coming soon in our official NPM CLI package.
                </Typography>
              </Box>
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

              <Typography variant="subtitle2" fontWeight={600}>
                Claude Desktop Extension (.mcpb):
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<DownloadIcon />}
                onClick={() => downloadMcpExtension(rawToken, MCP_SSE_ENDPOINT)}
                sx={{ width: "fit-content" }}
              >
                Download Desktop Extension
              </Button>
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
