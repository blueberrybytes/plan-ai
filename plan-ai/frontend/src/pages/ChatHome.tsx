/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Grid,
  Paper,
  CircularProgress,
  Divider,
  useTheme,
} from "@mui/material";
import { Send as SendIcon, AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store/store";
import { setChatHomeMessages } from "../store/slices/chatHome/chatHomeSlice";
import AssistantMessageRenderer from "../components/chat/AssistantMessageRenderer";
import HomeTour from "../components/onboarding/HomeTour";

// Standardize message interface similar to UIMessage but basic
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: any[];
}

const ChatHome: React.FC = () => {
  const theme = useTheme();
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);
  const initialChatMessages = useSelector((state: RootState) => state.chatHome.messages);
  const dispatch = useDispatch();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      if (initialChatMessages && initialChatMessages.length > 0) {
        setMessages(initialChatMessages);
      }
      hasInitialized.current = true;
    }
  }, [initialChatMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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
    // Mark as "scrolled up" if more than 80px from the bottom.
    userScrolledUp.current = distanceFromBottom > 80;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSend = async (text: string) => {
    const trimmedInput = text.trim();
    if (!trimmedInput || isStreaming) return;

    const userTempId = `temp-user-${Date.now()}`;
    const userMsg: UIMessage = {
      id: userTempId,
      role: "user",
      content: trimmedInput,
      parts: [{ type: "text", text: trimmedInput }],
    };

    const aiTempId = `temp-ai-${Date.now()}`;
    const aiMsg: UIMessage = {
      id: aiTempId,
      role: "assistant",
      content: "",
      parts: [],
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMsg, aiMsg];
      dispatch(setChatHomeMessages(newMessages));
      return newMessages;
    });

    setInput("");
    setIsStreaming(true);

    try {
      const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
      const formattedMessages = [...messages, userMsg].map((m: any, i) => ({
        ...m,
        id: m.id || `msg-${Date.now()}-${i}`,
        parts: m.parts || [{ type: "text", text: m.content || "" }], // MUST be an array for SDK
      }));

      const response = await fetch(`${baseUrl}/api/chat/assistant/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-workspace-id": activeWorkspaceId || "",
        },
        body: JSON.stringify({
          messages: formattedMessages,
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
        console.log("[ChatHome] Received chunk:", chunk);
        currentAiContent += chunk;

        setMessages((prev) => {
          const newMessages = prev.map((m) =>
            m.id === aiTempId ? { ...m, content: currentAiContent } : m,
          );
          dispatch(setChatHomeMessages(newMessages));
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Streaming error", error);
      setMessages((prev) => {
        return prev.map((m) =>
          m.id === aiTempId
            ? {
                ...m,
                content: `**⚠️ Error:**\n\n${error?.message || "Failed to generate AI response."}`,
              }
            : m,
        );
      });
      // Optionally update Redux
      dispatch(
        setChatHomeMessages(
          messages.map((m) =>
            m.id === aiTempId
              ? {
                  ...m,
                  content: `**⚠️ Error:**\n\n${error?.message || "Failed to generate AI response."}`,
                }
              : m,
          ),
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

  const handleSuggestionClick = (prompt: string) => {
    handleSend(prompt);
  };

  const suggestions = [
    {
      label: "Create a new project",
      prompt: "I want to create a new project. Help me get started.",
    },
    { label: "List my open tasks", prompt: "Can you list all my open tasks?" },
    {
      label: "Help me write a document",
      prompt: "I need help drafting a document for my project.",
    },
    {
      label: "Show recent transcripts",
      prompt: "Show me the most recent transcripts I've recorded.",
    },
  ];

  return (
    <SidebarLayout fullHeight>
      <HomeTour />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
        {/* Messages Area */}
        <Box
          ref={scrollRef}
          onScroll={handleScroll}
          sx={{ flexGrow: 1, overflowY: "auto", p: { xs: 2, md: 5 } }}
        >
          {messages.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
                opacity: 0.9,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "20px",
                  bgcolor: "rgba(67,97,238,0.15)",
                  color: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 3,
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography id="tour-welcome" variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
                How can I help you today?
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 6, fontWeight: 400 }}>
                I&apos;m your Plan AI Assistant. Ask me anything about your projects, tasks, or
                documents.
              </Typography>

              <Grid id="tour-suggestions" container spacing={2} maxWidth="md">
                {suggestions.map((s, i) => (
                  <Grid item xs={12} sm={6} key={i}>
                    <Paper
                      elevation={0}
                      onClick={() => handleSuggestionClick(s.prompt)}
                      sx={{
                        p: 3,
                        textAlign: "left",
                        cursor: "pointer",
                        bgcolor: "background.paper",
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 3,
                        transition: "all 0.2s ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          transform: "translateY(-2px)",
                          boxShadow: theme.shadows[2],
                        },
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight="600">
                        {s.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {s.prompt}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Box sx={{ maxWidth: "md", mx: "auto", width: "100%" }}>
              {messages.map((m: UIMessage) => (
                <Box
                  key={m.id}
                  sx={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    mb: 3,
                  }}
                >
                  <Paper
                    elevation={m.role === "user" ? 0 : 1}
                    sx={{
                      p: 2.5,
                      maxWidth: "85%",
                      overflowX: "auto",
                      wordBreak: "break-word",
                      borderRadius: 3,
                      bgcolor: m.role === "user" ? "primary.main" : "background.paper",
                      color: m.role === "user" ? "primary.contrastText" : "text.primary",
                      border: m.role !== "user" ? `1px solid ${theme.palette.divider}` : "none",
                    }}
                  >
                    {!m.content &&
                    (!m.parts || m.parts.length === 0) &&
                    m.role === "assistant" &&
                    isStreaming ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <CircularProgress size={16} />
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
                  </Paper>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Input Area */}
        <Box
          sx={{
            p: 3,
            bgcolor: "background.default",
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ maxWidth: "md", mx: "auto" }}>
            <Paper
              id="tour-chat-input"
              component="form"
              onSubmit={handleSubmit}
              elevation={2}
              sx={{
                p: "4px 8px",
                display: "flex",
                alignItems: "center",
                borderRadius: "24px",
                bgcolor: "background.paper",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <TextField
                fullWidth
                placeholder="Ask me anything..."
                value={input}
                onChange={handleInputChange}
                variant="standard"
                disabled={isStreaming}
                InputProps={{
                  disableUnderline: true,
                  sx: { px: 2, py: 1 },
                }}
              />
              <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" />
              <IconButton
                color="primary"
                sx={{ p: "10px" }}
                type="submit"
                disabled={!input.trim() || isStreaming}
              >
                <SendIcon />
              </IconButton>
            </Paper>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", textAlign: "center", mt: 1.5 }}
            >
              AI Assistant can make mistakes. Verify important information.
            </Typography>
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default ChatHome;
