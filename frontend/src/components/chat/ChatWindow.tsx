import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Chip,
  Paper,
  CircularProgress,
  TextField,
  IconButton,
  Button,
  Tooltip,
} from "@mui/material";
import {
  Send as SendIcon,
  Add as AddIcon,
  OpenInFull,
  ArrowBack,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { ChatMessage, ChatThread } from "../../store/apis/chatApi";
import MarkdownRenderer from "../common/MarkdownRenderer";
import { useListContextsQuery } from "../../store/apis/contextApi";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import { useNavigate } from "react-router-dom";

interface ChatWindowProps {
  activeThread: ChatThread | null;
  messages: ChatMessage[];
  isSending: boolean;
  onNewChat: () => void;
  onRefetch?: () => void;
  isFullScreen?: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  activeThread,
  messages,
  isSending,
  onNewChat,
  onRefetch,
  isFullScreen = false,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useSelector((state: RootState) => state.session.user?.token);

  // Fetch contexts here to display chips only
  const { data: contextResponse } = useListContextsQuery();
  const contexts = contextResponse?.data?.contexts ?? [];

  // Reset optimistic messages when the thread changes or new real messages arrive
  useEffect(() => {
    if (!isStreaming) {
      setOptimisticMessages([]);
    }
  }, [activeThread?.id, messages.length, isStreaming]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, optimisticMessages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeThread) return;

    // 1. Optimistic User Message
    const userTempId = `temp-user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userTempId,
      threadId: activeThread.id,
      role: "USER",
      content: trimmedInput,
      createdAt: new Date().toISOString(),
    };

    // 2. Optimistic AI Message (Empty at first)
    const aiTempId = `temp-ai-${Date.now()}`;
    const aiMsg: ChatMessage = {
      id: aiTempId,
      threadId: activeThread.id,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setOptimisticMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const baseUrl = process.env.REACT_APP_API_BACKEND_URL || "";
      const response = await fetch(`${baseUrl}/api/chat/threads/${activeThread.id}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: trimmedInput }),
      });

      if (!response.ok) throw new Error("Stream request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let isDone = false;

      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) {
          isDone = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        setOptimisticMessages((prev) =>
          prev.map((m) => (m.id === aiTempId ? { ...m, content: m.content + chunk } : m)),
        );
      }
    } catch (error) {
      console.error("Streaming error", error);
      // Clean up optimistic messages on error
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== userTempId && m.id !== aiTempId));
    } finally {
      setIsStreaming(false);
      if (onRefetch) onRefetch();
    }
  };

  const handleExport = () => {
    if (!activeThread) return;

    const transcript = allMessages
      .map((m) => `[${m.role}] ${new Date(m.createdAt).toLocaleString()}\n${m.content}\n`)
      .join("\n" + "=".repeat(30) + "\n\n");

    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${activeThread.title || "transcript"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!activeThread) {
    return (
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center",
          bgcolor: "background.default",
        }}
      >
        <Typography variant="h5" color="text.primary" gutterBottom>
          {t("chat.placeholders.emptyStateTitle")}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {t("chat.placeholders.emptyStateSubtitle")}
        </Typography>
        <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onNewChat}>
          {t("chat.buttons.start")}
        </Button>
      </Box>
    );
  }

  const allMessages = [...messages, ...optimisticMessages];

  return (
    <Box
      sx={{ flexGrow: 1, display: "flex", flexDirection: "column", bgcolor: "background.default" }}
    >
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Toolbar>
          {isFullScreen && (
            <IconButton onClick={() => navigate(-1)} size="small" sx={{ mr: 1 }}>
              <ArrowBack />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {activeThread.title || t("chat.heading")}
          </Typography>
          <Box>
            {activeThread.contextIds.map((cid) => {
              const ctx = contexts.find((c) => c.id === cid);
              return ctx ? <Chip key={cid} label={ctx.name} size="small" sx={{ mr: 1 }} /> : null;
            })}
            {!isFullScreen && (
              <Tooltip title={t("chat.window.viewFullScreen")}>
                <IconButton
                  onClick={() => navigate(`/chat/view?chat=${activeThread.id}`)}
                  size="small"
                >
                  <OpenInFull />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t("chat.window.exportChat") || "Export Chat"}>
              <IconButton onClick={handleExport} size="small">
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: 2, overflowY: "auto" }} ref={scrollRef}>
        {allMessages.map((msg) => (
          <Box
            key={msg.id}
            sx={{
              display: "flex",
              justifyContent: msg.role === "USER" ? "flex-end" : "flex-start",
              mb: 2,
            }}
          >
            <Paper
              sx={{
                p: 2,
                maxWidth: "85%",
                bgcolor: msg.role === "USER" ? "primary.main" : "background.paper",
                color: msg.role === "USER" ? "primary.contrastText" : "text.primary",
                opacity: msg.id.startsWith("temp-") ? 0.7 : 1,
              }}
            >
              <MarkdownRenderer content={msg.content} />
            </Paper>
          </Box>
        ))}
        {isSending && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>

      <Box sx={{ p: 3, pb: 4, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            placeholder={t("chat.placeholders.typeMessage")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            multiline
            maxRows={4}
          />
          <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || isSending}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatWindow;
