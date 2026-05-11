/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  TextField,
  IconButton,
  Typography,
  Stack,
  CircularProgress,
  Paper,
  Tooltip,
  Chip,
  Divider,
  Alert,
  Button,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import BugReportIcon from "@mui/icons-material/BugReport";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getAuth } from "firebase/auth";
import { useSelector } from "react-redux";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";

interface GitNexusChatDialogProps {
  open: boolean;
  repoFullName: string;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "What are the main execution flows?",
  "How does authentication work?",
  "List the key API routes and handlers",
  "What are the main services and their dependencies?",
  "Trace the push event handler",
];

const GitNexusChatDialog: React.FC<GitNexusChatDialogProps> = ({ open, repoFullName, onClose }) => {
  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);

  const backendUrl = process.env.REACT_APP_API_BACKEND_URL || "";
  const endpoint = `${backendUrl.replace(/\/$/, "")}/api/gitnexus/chat`;

  const transport = React.useMemo(() => {
    return new DefaultChatTransport({
      api: endpoint,
      body: { repoFullName, organizationId: activeWorkspaceId },
      fetch: async (url, options) => {
        try {
          // selectUser is a plain object (Redux-serialized) — use getAuth().currentUser
          // to get the real Firebase User instance with getIdToken()
          const firebaseUser = getAuth().currentUser;
          const token = firebaseUser ? await firebaseUser.getIdToken() : "";
          const response = await fetch(endpoint, {
            ...(options as RequestInit),
            headers: {
              ...((options as RequestInit)?.headers as Record<string, string>),
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
          if (!response.ok) {
            const body = await response.text();
            console.error("[GitNexusChat] Error response:", response.status, body);
          }
          return response;
        } catch (err) {
          console.error("[GitNexusChat] fetch exception:", err);
          throw err;
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";
  const isError = status === "error";

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        sendMessage({ text: input });
        setInput("");
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          height: "80vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 3,
          overflow: "hidden",
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          py: 1.5,
          px: 2.5,
          borderBottom: 1,
          borderColor: "divider",
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
          flexShrink: 0,
        }}
      >
        <BugReportIcon sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
            ✨ PlanAI Code Intelligence
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {repoFullName}
          </Typography>
        </Box>
        <Chip
          size="small"
          label="AI Power Graph"
          icon={<AutoAwesomeIcon sx={{ fontSize: "0.75rem !important" }} />}
          sx={{
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "#fff",
            fontWeight: 700,
            fontSize: "0.65rem",
            "& .MuiChip-icon": { color: "#fff" },
          }}
        />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Messages */}
      <DialogContent
        sx={{
          flex: 1,
          overflow: "auto",
          p: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 4,
              gap: 2,
            }}
          >
            <AutoAwesomeIcon
              sx={{
                fontSize: 52,
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            />
            <Typography variant="h6" fontWeight={700} color="text.primary" textAlign="center">
              Ask anything about your codebase
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
              sx={{ maxWidth: 420 }}
            >
              PlanAI&apos;s code intelligence traces execution flows, resolves symbols, and explains
              how your code works — powered by your connected repository.
            </Typography>
            <Divider sx={{ width: "100%", mt: 1 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
              letterSpacing={0.8}
            >
              SUGGESTED QUESTIONS
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Chip
                  key={prompt}
                  label={prompt}
                  size="small"
                  variant="outlined"
                  clickable
                  onClick={() => setInput(prompt)}
                  sx={{ cursor: "pointer", fontSize: "0.75rem" }}
                />
              ))}
            </Stack>
          </Box>
        ) : (
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <Stack
                  key={m.id}
                  direction="row"
                  justifyContent={isUser ? "flex-end" : "flex-start"}
                  alignItems="flex-start"
                  spacing={1}
                >
                  {!isUser && (
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        mt: 0.5,
                      }}
                    >
                      <AutoAwesomeIcon sx={{ fontSize: 14, color: "#fff" }} />
                    </Box>
                  )}
                  <Paper
                    variant="outlined"
                    sx={{
                      px: 2,
                      py: 1.5,
                      maxWidth: "80%",
                      overflowX: "auto",
                      wordBreak: "break-word",
                      borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      bgcolor: isUser ? "primary.main" : "background.paper",
                      borderColor: isUser ? "primary.main" : "divider",
                    }}
                  >
                    {m.parts?.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <Typography
                            key={i}
                            variant="body2"
                            sx={{
                              color: isUser ? "primary.contrastText" : "text.primary",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {part.text}
                          </Typography>
                        );
                      }

                      if (part.type === "data-custom") {
                        const isFinished = status !== "streaming" && status !== "submitted";
                        const hasText = m.parts.some(
                          (p) => p.type === "text" && (p as any).text?.trim().length > 0,
                        );
                        const isCurrentMessage = m.id === messages[messages.length - 1].id;
                        if (isFinished || hasText || !isCurrentMessage) return null;

                        const isLast = !m.parts.slice(i + 1).some((p) => p.type === "data-custom");
                        if (!isLast) return null;

                        const statusStr =
                          typeof (part as any).data === "object" &&
                          (part as any).data !== null &&
                          "status" in (part as any).data
                            ? (part as any).data.status
                            : "Thinking...";

                        return (
                          <Box
                            key={i}
                            sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 1 }}
                          >
                            <CircularProgress size={12} color="primary" />
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary", fontStyle: "italic" }}
                            >
                              {statusStr}
                            </Typography>
                          </Box>
                        );
                      }

                      if ("toolCallId" in part) {
                        const toolTypeField = (part as any).type || "";
                        const rawToolName = toolTypeField.startsWith("tool-")
                          ? toolTypeField.replace("tool-", "")
                          : "unknown";
                        const actualToolName =
                          "toolName" in part ? (part as any).toolName : rawToolName;
                        const rawArgs =
                          "args" in part
                            ? (part as any).args
                            : "input" in part
                              ? (part as any).input
                              : null;

                        return (
                          <Box
                            key={i}
                            sx={{
                              mt: 0.5,
                              p: 1,
                              bgcolor: alpha(theme.palette.primary.main, 0.06),
                              borderRadius: 1,
                              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                color: "primary.main",
                                fontWeight: 600,
                              }}
                            >
                              <AutoAwesomeIcon sx={{ fontSize: 11 }} />
                              {actualToolName}
                            </Typography>
                            {rawArgs && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  fontFamily: "monospace",
                                  display: "block",
                                  mt: 0.5,
                                  fontSize: "0.65rem",
                                }}
                              >
                                {JSON.stringify(rawArgs)}
                              </Typography>
                            )}
                          </Box>
                        );
                      }

                      return null;
                    })}
                  </Paper>
                </Stack>
              );
            })}

            {/* Error banner */}
            {isError && (
              <Alert
                severity="error"
                sx={{ mx: 2, mb: 1 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      if (input.trim()) {
                        sendMessage({ text: input });
                      } else if (messages.length > 0) {
                        // Retry last user message
                        const lastUser = [...messages].reverse().find((m) => m.role === "user");
                        if (lastUser) {
                          const lastText = lastUser.parts
                            ?.filter((p) => p.type === "text")
                            .map((p) => (p as any).text)
                            .join("");
                          if (lastText) sendMessage({ text: lastText });
                        }
                      }
                    }}
                  >
                    Retry
                  </Button>
                }
              >
                {error?.message
                  ? `Something went wrong: ${error.message}`
                  : "Something went wrong. The AI could not respond — please try again."}
              </Alert>
            )}

            <div ref={messagesEndRef} />
          </Box>
        )}
      </DialogContent>

      {/* Input */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          flexShrink: 0,
          display: "flex",
          gap: 1,
          alignItems: "flex-end",
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Ask about execution flows, functions, architecture..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          sx={{ flex: 1 }}
        />
        <Tooltip title="Send (Enter)">
          <span>
            <IconButton
              type="submit"
              disabled={!input.trim() || isLoading}
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                color: "#fff",
                "&:hover": { opacity: 0.9 },
                "&:disabled": { bgcolor: "action.disabledBackground", background: "none" },
              }}
            >
              {isLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Dialog>
  );
};

export default GitNexusChatDialog;
