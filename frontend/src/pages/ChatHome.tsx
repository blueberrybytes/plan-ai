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
} from "@mui/material";
import { Send as SendIcon, AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store/store";
import { setChatHomeMessages } from "../store/slices/chatHome/chatHomeSlice";
import { useNavigate } from "react-router-dom";
import MarkdownRenderer from "../components/common/MarkdownRenderer";

const ChatHome: React.FC = () => {
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const initialChatMessages = useSelector((state: RootState) => state.chatHome.messages);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${process.env.REACT_APP_API_BACKEND_URL || ""}/api/chat/assistant/stream`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    onToolCall: ({ toolCall }: { toolCall: any }) => {
      if (toolCall.toolName === "navigate") {
        const path = (toolCall.args as { path: string }).path;
        if (path) {
          navigate(path);
        }
      }
    },
  });

  console.log("[ChatHome] Render. useChat messages length:", messages?.length);
  console.log("[ChatHome] Render. initialChatMessages length:", initialChatMessages?.length);
  if (messages?.length > 0) {
    console.log("[ChatHome] First message structure:", messages[0]);
  }

  const isLoading = status === "streaming" || status === "submitted";

  const [input, setInput] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input?.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestionClick = (prompt: string) => {
    sendMessage({ text: prompt });
  };

  const hasInitialized = useRef(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!hasInitialized.current) {
      if (initialChatMessages && initialChatMessages.length > 0) {
        setMessages(initialChatMessages);
      }
      if (initialChatMessages !== undefined) {
        hasInitialized.current = true;
      }
    }
  }, [initialChatMessages, setMessages]);

  useEffect(() => {
    // Prevent wiping the Redux store with the initial empty array on mount
    if (isInitialMount.current && messages.length === 0) {
      isInitialMount.current = false;
      return;
    }
    isInitialMount.current = false;

    // Deep clone the messages so Redux doesn't freeze the Vercel AI SDK's internal objects
    try {
      const clonedMessages = JSON.parse(JSON.stringify(messages));
      dispatch(setChatHomeMessages(clonedMessages));
    } catch (e) {
      console.error("Failed to clone messages before dispatch:", e);
    }
  }, [messages, dispatch]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
        {/* Messages Area */}
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: { xs: 2, md: 5 } }}>
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
              <Typography variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
                How can I help you today?
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 6, fontWeight: 400 }}>
                I&apos;m your Plan AI Assistant. Ask me anything about your projects, tasks, or
                documents.
              </Typography>

              <Grid container spacing={2} maxWidth="md">
                {suggestions.map((s, i) => (
                  <Grid item xs={12} sm={6} key={i}>
                    <Paper
                      elevation={0}
                      onClick={() => handleSuggestionClick(s.prompt)}
                      sx={{
                        p: 3,
                        textAlign: "left",
                        cursor: "pointer",
                        bgcolor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 3,
                        transition: "all 0.2s ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          transform: "translateY(-2px)",
                          bgcolor: "rgba(67,97,238,0.05)",
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
                      borderRadius: 3,
                      bgcolor: m.role === "user" ? "primary.main" : "background.paper",
                      color: m.role === "user" ? "primary.contrastText" : "text.primary",
                      border: m.role !== "user" ? "1px solid rgba(255,255,255,0.1)" : "none",
                    }}
                  >
                    {!m.parts || m.parts.length === 0 ? (
                      <MarkdownRenderer content={(m as any).content || ""} />
                    ) : (
                      m.parts.map((part: any, index: number) => {
                        if (part.type === "text") {
                          return (
                            <Box key={`text-${index}`} sx={{ mb: 1 }}>
                              <MarkdownRenderer content={part.text || ""} />
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
                      })
                    )}
                  </Paper>
                </Box>
              ))}
              {isLoading && (
                <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 3 }}>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      bgcolor: "background.paper",
                      border: "1px solid rgba(255,255,255,0.1)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      Thinking...
                    </Typography>
                  </Paper>
                </Box>
              )}
              <div ref={messagesEndRef} />
            </Box>
          )}
        </Box>

        {/* Input Area */}
        <Box
          sx={{
            p: 3,
            bgcolor: "background.default",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <Box sx={{ maxWidth: "md", mx: "auto" }}>
            <Paper
              component="form"
              onSubmit={handleSubmit}
              elevation={2}
              sx={{
                p: "4px 8px",
                display: "flex",
                alignItems: "center",
                borderRadius: "24px",
                bgcolor: "background.paper",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <TextField
                fullWidth
                placeholder="Ask me anything..."
                value={input}
                onChange={handleInputChange}
                variant="standard"
                disabled={isLoading}
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
                disabled={!input.trim() || isLoading}
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
