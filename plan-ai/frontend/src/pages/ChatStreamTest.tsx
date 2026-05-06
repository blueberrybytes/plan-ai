/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Box, Typography, TextField, Button, Paper, CircularProgress, Alert } from "@mui/material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

// --- CUSTOM TOOL RENDERERS ---
const ToolSumarRender = ({ args, result }: { args: any; result: any }) => {
  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        bgcolor: "background.default",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        variant="body2"
        fontWeight="bold"
        color="secondary"
        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
      >
        🧮 Operación Matemática
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
        Sumando: <b>{args?.a}</b> + <b>{args?.b}</b>
      </Typography>
      {result !== null && (
        <Box
          sx={{
            mt: 1,
            p: 1,
            bgcolor: "rgba(46, 125, 50, 0.1)",
            borderRadius: 1,
            borderLeft: "3px solid #2e7d32",
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontFamily: "monospace", color: "#2e7d32", fontWeight: 600 }}
          >
            Resultado: {result?.result ?? JSON.stringify(result)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const ToolGenericRender = ({
  toolName,
  args,
  result,
}: {
  toolName: string;
  args: any;
  result: any;
}) => {
  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        bgcolor: "background.default",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        variant="body2"
        fontWeight="bold"
        color="secondary"
        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
      >
        🛠 Herramienta: {toolName}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontFamily: "monospace", color: "text.secondary", mt: 0.5, display: "block" }}
      >
        Input: {JSON.stringify(args)}
      </Typography>
      {result !== null && (
        <Box
          sx={{
            mt: 1,
            p: 1,
            bgcolor: "rgba(0, 0, 0, 0.05)",
            borderRadius: 1,
            borderLeft: "3px solid #555",
          }}
        >
          <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.primary" }}>
            Output: {JSON.stringify(result)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
// -----------------------------

const ChatStreamTest: React.FC = () => {
  const [notification, setNotification] = useState<{ message: string; level: string } | null>(null);

  const [input, setInput] = useState("");

  const backendUrl = process.env.REACT_APP_API_BACKEND_URL || "http://localhost:8080";
  const endpoint = `${backendUrl.replace(/\/$/, "")}/api/chat-streaming/api/chat/stream`;

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: endpoint,
      fetch: (url, options) => {
        console.log("AI SDK Transport Output URL:", url, "Overriding to:", endpoint);
        return fetch(endpoint, options);
      },
    }),
    onFinish: (message) => {
      console.log("Received finish:", message);
    },
    onData: (dataPart: { type: string; data?: any; errorText?: string }) => {
      console.log("Received data part:", dataPart);
      // Handle transient notifications!
      if (dataPart?.type === "data-custom" && dataPart?.data?.status === "thinking") {
        setNotification({ message: "Nginx heartbeat received (thinking...)", level: "info" });
      } else if (dataPart?.type === "error") {
        setNotification({ message: `Error: ${dataPart?.errorText}`, level: "error" });
      }
    },
    onError: (err: Error) => {
      console.error(err);
      setNotification({ message: err.message, level: "error" });
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  console.log(messages, status);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: 4, height: "100%", display: "flex", flexDirection: "column" }}>
        <Typography variant="h4" fontWeight={800} gutterBottom>
          Stream Testing Surface
        </Typography>

        {notification && (
          <Alert
            severity={notification.level as any}
            sx={{ mb: 2 }}
            onClose={() => setNotification(null)}
          >
            {notification.message}
          </Alert>
        )}

        <Paper
          sx={{
            flexGrow: 1,
            p: 3,
            mb: 2,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {messages.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ mt: 10 }}>
              Start a conversation to test streaming!
            </Typography>
          ) : (
            messages.map((m) => (
              <Box
                key={m.id}
                sx={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}
              >
                <Box
                  sx={{
                    bgcolor: m.role === "user" ? "primary.main" : "background.paper",
                    color: m.role === "user" ? "primary.contrastText" : "text.primary",
                    p: 2,
                    borderRadius: 2,
                    border: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    variant="caption"
                    color={m.role === "user" ? "inherit" : "primary"}
                    fontWeight="bold"
                    display="block"
                    gutterBottom
                  >
                    {m.role === "user" ? "You" : "AI"}
                  </Typography>

                  {/* Render Custom Stream Parts! */}
                  {m.parts
                    ? m.parts.map((part, index: number) => {
                        console.log("part", part);
                        if (part.type === "text") {
                          return (
                            <Typography key={index} variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                              {part.text}
                            </Typography>
                          );
                        }
                        if (part.type === "data-custom") {
                          // Disappear totally once the stream finishes or once text starts writing!
                          const isFinished = status !== "streaming" && status !== "submitted";
                          const hasText = m.parts.some(
                            (p) => p.type === "text" && p.text.trim().length > 0,
                          );

                          // VERY IMPORTANT: Only show loaders on the VERY LAST message in the conversation!
                          const isCurrentMessage = m.id === messages[messages.length - 1].id;

                          if (isFinished || hasText || !isCurrentMessage) return null;

                          // Only display if it's the last data-custom part in the list to avoid clutter
                          const isLast = !m.parts
                            .slice(index + 1)
                            .some((p) => p.type === "data-custom");
                          if (!isLast) return null;

                          // Extract the message depending on the new backend structure
                          const statusStr =
                            typeof part.data === "object" &&
                            part.data !== null &&
                            "status" in part.data
                              ? (part.data as any).status
                              : JSON.stringify(part.data);

                          return (
                            <Box
                              key={index}
                              sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}
                            >
                              <CircularProgress size={14} color="secondary" />
                              <Typography
                                variant="caption"
                                sx={{
                                  background: "linear-gradient(90deg, #8A2387, #E94057, #F27121)",
                                  WebkitBackgroundClip: "text",
                                  WebkitTextFillColor: "transparent",
                                  fontStyle: "italic",
                                  fontWeight: "bold",
                                  animation: "pulse 2s infinite",
                                }}
                              >
                                {statusStr}
                              </Typography>
                            </Box>
                          );
                        }
                        if ("toolCallId" in part) {
                          const toolTypeField = part.type || "";
                          const rawToolName = toolTypeField.startsWith("tool-")
                            ? toolTypeField.replace("tool-", "")
                            : "desconocida";
                          const actualToolName =
                            "toolName" in part ? (part as any).toolName : rawToolName;

                          const state =
                            "state" in part
                              ? (part as any).state
                              : "result" in part
                                ? "result"
                                : "call";

                          const rawArgs =
                            "args" in part
                              ? (part as any).args
                              : "input" in part
                                ? (part as any).input
                                : null;
                          const rawResult =
                            "result" in part
                              ? (part as any).result
                              : "output" in part
                                ? (part as any).output
                                : null;

                          // Scalable per-tool component routing
                          switch (actualToolName) {
                            case "sumar":
                              return (
                                <ToolSumarRender key={index} args={rawArgs} result={rawResult} />
                              );
                            default:
                              return (
                                <ToolGenericRender
                                  key={index}
                                  toolName={actualToolName}
                                  args={rawArgs}
                                  result={rawResult}
                                />
                              );
                          }
                        }
                        return null;
                      })
                    : null}
                </Box>
              </Box>
            ))
          )}
          {isLoading && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={16} />
            </Box>
          )}
        </Paper>

        <Box component="form" onSubmit={handleInputSubmit} sx={{ display: "flex", gap: 2 }}>
          <TextField
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            variant="outlined"
            disabled={isLoading}
          />
          <Button type="submit" variant="contained" disabled={isLoading || !input.trim()}>
            Send Stream
          </Button>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default ChatStreamTest;
