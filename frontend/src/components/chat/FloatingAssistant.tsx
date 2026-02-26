/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Fab,
  Popover,
  Typography,
  IconButton,
  TextField,
  Paper,
  CircularProgress,
  Divider,
} from "@mui/material";
import { Chat as ChatIcon, Send as SendIcon, Remove as RemoveIcon } from "@mui/icons-material";
import { useChat } from "@ai-sdk/react";
import { UIMessage, DefaultChatTransport } from "ai";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import MarkdownRenderer from "../common/MarkdownRenderer";
import { useNavigate } from "react-router-dom";

export interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "data";
  content: string;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any;
  }>;
}

export const FloatingAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${process.env.REACT_APP_API_BACKEND_URL || ""}/api/chat/assistant/stream`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    onToolCall: ({ toolCall }: { toolCall: any }) => {
      console.log("toolCall", toolCall);
      if (toolCall.toolName === "navigate") {
        const path = (toolCall.args as { path: string }).path;
        if (path) {
          navigate(path);
        }
      }
    },
    onFinish: (message) => {
      console.log("Message finished:", message);
    },
  });

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

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
          bottom: 24,
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
          horizontal: "left", // Popover opens above and to the left of the button
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
              Plan AI Assistant
            </Typography>
            <IconButton size="small" onClick={handleClose} sx={{ color: "inherit" }}>
              <RemoveIcon />
            </IconButton>
          </Box>

          <Divider />

          {/* Messages Area */}
          <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2, bgcolor: "background.default" }}>
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
                Hi! I can help you navigate the app or answer quick questions.
              </Typography>
            )}

            {messages.map((m: UIMessage) => (
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
            {status === "error" && (
              <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                <Paper
                  sx={{
                    p: 1.5,
                    bgcolor: "error.main",
                    color: "error.contrastText",
                    borderRadius: 2,
                    typography: "body2",
                  }}
                >
                  An error occurred. Please try again.
                </Paper>
              </Box>
            )}
            {isLoading && (
              <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
                <CircularProgress size={16} />
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

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
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Ask the assistant..."
              value={input}
              onChange={handleInputChange}
              disabled={isLoading}
              sx={{ mr: 1 }}
            />
            <IconButton type="submit" color="primary" disabled={isLoading || !input?.trim()}>
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      </Popover>
    </>
  );
};

export default FloatingAssistant;
