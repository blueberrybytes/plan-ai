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
} from "@mui/material";
import { Send as SendIcon, Add as AddIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { ChatMessage, ChatThread } from "../../store/apis/chatApi";
import { useListContextsQuery } from "../../store/apis/contextApi";

interface ChatWindowProps {
  activeThread: ChatThread | null;
  messages: ChatMessage[];
  isSending: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onNewChat: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  activeThread,
  messages,
  isSending,
  onSendMessage,
  onNewChat,
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch contexts here to display chips only
  const { data: contextResponse } = useListContextsQuery();
  const contexts = contextResponse?.data?.contexts ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await onSendMessage(input);
      setInput("");
    } catch (error) {
      console.error("Failed to send message", error);
      // Error handling is up to parent or toast
    }
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
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {activeThread.title || t("chat.heading")}
          </Typography>
          <Box>
            {activeThread.contextIds.map((cid) => {
              const ctx = contexts.find((c) => c.id === cid);
              return ctx ? <Chip key={cid} label={ctx.name} size="small" sx={{ mr: 1 }} /> : null;
            })}
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: 2, overflowY: "auto" }} ref={scrollRef}>
        {messages.map((msg) => (
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
                maxWidth: "70%",
                bgcolor: msg.role === "USER" ? "primary.main" : "background.paper",
                color: msg.role === "USER" ? "primary.contrastText" : "text.primary",
              }}
            >
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                {msg.content}
              </Typography>
            </Paper>
          </Box>
        ))}
        {isSending && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>

      <Box sx={{ p: 2, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
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
