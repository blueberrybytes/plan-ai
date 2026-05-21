/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Fab,
  Popover,
  Typography,
  IconButton,
  TextField,
  Paper,
  CircularProgress,
  Divider,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import {
  Chat as ChatIcon,
  Send as SendIcon,
  Remove as RemoveIcon,
  ContentCopy as ContentCopyIcon,
  AutoFixHigh as AutoFixHighIcon,
} from "@mui/icons-material";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import AssistantMessageRenderer from "./AssistantMessageRenderer";
import AiModelSelector from "../common/AiModelSelector";
import { useGetAssistantSkillsQuery } from "../../store/apis/chatApi";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";

export interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "data";
  content: string;
  parts?: any[];
}

export const FloatingAssistant: React.FC = () => {
  const { productName } = useBrandIdentity();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);

  // RTK Query for tools
  const { data: skills, isLoading: isLoadingSkills } = useGetAssistantSkillsQuery();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isStreaming) {
      userScrolledUp.current = false;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [isStreaming]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSend = async (text: string) => {
    const trimmedInput = text.trim();
    if (!trimmedInput || isStreaming) return;

    const userTempId = `temp-user-${Date.now()}`;
    const userMsg: Message = {
      id: userTempId,
      role: "user",
      content: trimmedInput,
      parts: [{ type: "text", text: trimmedInput }],
    };

    const aiTempId = `temp-ai-${Date.now()}`;
    const aiMsg: Message = {
      id: aiTempId,
      role: "assistant",
      content: "",
      parts: [],
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setIsStreaming(true);
    setErrorMsg(null);

    try {
      const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
      const endpoint = `${baseUrl}/api/chat/assistant/stream${modelKey ? `?modelKey=${modelKey}` : ""}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-workspace-id": activeWorkspaceId || "",
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error?.message || errData?.message || "Stream request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let isDone = false;
      let currentAiContent = "";

      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) {
          isDone = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log("[FloatingAssistant] Received chunk:", chunk);
        currentAiContent += chunk;

        setMessages((prev) =>
          prev.map((m) => (m.id === aiTempId ? { ...m, content: currentAiContent } : m)),
        );
      }
    } catch (error: any) {
      console.error("Streaming error", error);
      setErrorMsg(error?.message || "Failed to generate AI response");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiTempId
            ? {
                ...m,
                content: `**⚠️ Error:**\n\n${error?.message || "Failed to generate AI response."}`,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const id = isOpen ? "assistant-popover" : undefined;

  return (
    <>
      <Fab
        color="primary"
        aria-label="chat"
        onClick={handleClick}
        ref={anchorRef}
        sx={{
          position: "fixed",
          bottom: 150,
          right: 24,
          zIndex: 1000,
        }}
      >
        <ChatIcon />
      </Fab>

      <Popover
        id={id}
        open={isOpen}
        anchorEl={anchorRef.current}
        onClose={(event, reason) => {
          if (reason !== "backdropClick") {
            handleClose();
          }
        }}
        disableAutoFocus
        disableEnforceFocus
        anchorOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        sx={{
          mt: -2,
          mr: 2,
          pointerEvents: "none",
        }}
      >
        <Paper
          elevation={8}
          sx={{
            width: 350,
            height: 500,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <Typography variant="subtitle1" fontWeight="bold">
              {productName} Assistant
            </Typography>
            <IconButton size="small" onClick={handleClose} sx={{ color: "inherit" }}>
              <RemoveIcon />
            </IconButton>
          </Box>

          <Divider />

          <Box sx={{ px: 2, pb: 1 }}>
            <AiModelSelector value={modelKey} onChange={setModelKey} disabled={isStreaming} />
          </Box>

          {/* Messages Area */}
          <Box
            ref={scrollRef}
            onScroll={handleScroll}
            sx={{ flexGrow: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column" }}
          >
            {messages.length === 0 && !isStreaming ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
                Hi! I can help you navigate the app or answer quick questions.
              </Typography>
            ) : null}

            {messages.map((m: Message) => (
              <Box
                key={m.id}
                sx={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  mb: 2,
                }}
              >
                <Paper
                  sx={{
                    p: 1.5,
                    maxWidth: "85%",
                    bgcolor: m.role === "user" ? "primary.main" : "background.paper",
                    color: m.role === "user" ? "primary.contrastText" : "text.primary",
                    borderRadius: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0, overflowX: "auto" }}>
                    {!m.content &&
                    (!m.parts || m.parts.length === 0) &&
                    m.role === "assistant" &&
                    isStreaming ? (
                      <Box sx={{ display: "flex", alignItems: "center", minHeight: "24px" }}>
                        <CircularProgress size={16} sx={{ mr: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                          Thinking...
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        {m.content && (
                          <AssistantMessageRenderer
                            content={m.content}
                            onSendMessage={handleSend}
                          />
                        )}
                        {!m.content &&
                          m.parts &&
                          m.parts.length > 0 &&
                          m.parts.map((part: any, index: number) => {
                            if (part.type === "text") {
                              return (
                                <Box key={`text-${index}`} sx={{ mb: 1 }}>
                                  <AssistantMessageRenderer
                                    content={part.text || ""}
                                    onSendMessage={handleSend}
                                  />
                                </Box>
                              );
                            }
                            if (part.type === "tool-invocation" || part.type.startsWith("tool-")) {
                              const toolName = part.toolName || part.type.replace("tool-", "");
                              const toolArgs = part.args || part.input;
                              const toolState = part.state;
                              return (
                                <Box
                                  key={`tool-${index}`}
                                  component="span"
                                  sx={{
                                    fontStyle: "italic",
                                    fontSize: "0.85rem",
                                    opacity: 0.8,
                                    display: "block",
                                    mb: 0.5,
                                  }}
                                >
                                  {toolName === "navigate"
                                    ? `Navigating to ${toolArgs?.path}...`
                                    : toolState === "output-available"
                                      ? `Finished running ${toolName}.`
                                      : `Running ${toolName}...`}
                                </Box>
                              );
                            }
                            return null;
                          })}
                      </Box>
                    )}
                  </Box>
                  {m.content && m.role === "user" && (
                    <Tooltip title="Copy">
                      <IconButton
                        onClick={() => {
                          navigator.clipboard.writeText(m.content);
                        }}
                        size="small"
                        sx={{
                          alignSelf: "flex-start",
                          opacity: 0.7,
                          "&:hover": { opacity: 1 },
                          color: "inherit",
                          mt: -0.5,
                          mr: -0.5,
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  </Box>
                  {m.content && m.role === "assistant" && (
                    <Box
                      sx={{
                        mt: 0.5,
                        pt: 0.5,
                        borderTop: 1,
                        borderColor: "divider",
                        display: "flex",
                      }}
                    >
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<ContentCopyIcon fontSize="small" />}
                        onClick={() => navigator.clipboard.writeText(m.content)}
                        sx={{
                          py: 0,
                          px: 1,
                          fontSize: "0.7rem",
                          textTransform: "none",
                          color: "text.secondary",
                        }}
                      >
                        Copy
                      </Button>
                    </Box>
                  )}
                </Paper>
              </Box>
            ))}
          </Box>

          {errorMsg && (
            <Box sx={{ p: 2, pb: 0 }}>
              <Alert
                severity="error"
                onClose={() => setErrorMsg(null)}
                sx={{ fontSize: "0.8rem", p: 0, px: 1, py: 0.5 }}
              >
                {errorMsg}
              </Alert>
            </Box>
          )}

          <Divider />

          {/* Input Area */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              p: 1,
              display: "flex",
              alignItems: "center",
              bgcolor: "background.paper",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <Tooltip title="View Assistant Skills">
              <IconButton
                onClick={() => setSkillsOpen(true)}
                size="small"
                sx={{ mr: 1, color: "text.secondary" }}
              >
                <AutoFixHighIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask the assistant..."
              value={input}
              onChange={handleInputChange}
              disabled={isStreaming}
              sx={{ mr: 1 }}
            />
            <IconButton type="submit" color="primary" disabled={isStreaming || !input?.trim()}>
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      </Popover>

      <Dialog open={skillsOpen} onClose={() => setSkillsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assistant Skills</DialogTitle>
        <DialogContent dividers>
          {isLoadingSkills ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <List disablePadding>
              {skills && skills.length > 0 ? (
                skills.map((skill, index) => (
                  <ListItem key={index} sx={{ py: 1.5, px: 0 }}>
                    <ListItemText
                      primaryTypographyProps={{ fontWeight: 600, color: "primary.main" }}
                      primary={skill.name}
                      secondary={skill.description}
                    />
                  </ListItem>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No skills documented yet.
                </Typography>
              )}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FloatingAssistant;
