/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Chip,
  CircularProgress,
  TextField,
  IconButton,
  Button,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  Send as SendIcon,
  Add as AddIcon,
  OpenInFull,
  ArrowBack,
  Download as DownloadIcon,
  Edit as EditIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { ChatAttachment, ChatMessage, ChatThread } from "../../store/apis/chatApi";
import ChatMessageItem from "./ChatMessageItem";
import { useListProjectsQuery } from "../../store/apis/projectApi";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import { useNavigate } from "react-router-dom";
import AiModelSelector from "../common/AiModelSelector";

interface ChatWindowProps {
  activeThread: ChatThread | null;
  messages: ChatMessage[];
  isSending: boolean;
  onNewChat: () => void;
  onRefetch?: () => void;
  isFullScreen?: boolean;
  onBack?: () => void;
  onEditChat?: (thread: ChatThread) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  activeThread,
  messages,
  isSending,
  onNewChat,
  onRefetch,
  isFullScreen = false,
  onBack,
  onEditChat,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  // Hydrate from localStorage synchronously so the selector doesn't flash "Auto Model"
  // before the saved preference loads.
  const [modelKey, setModelKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("preferred_ai_model");
  });
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);

  // Fetch contexts here to display chips only
  const { data: projectsResponse } = useListProjectsQuery(undefined);
  const projects = projectsResponse?.data?.projects ?? [];

  // Reset optimistic messages when the thread changes or new real messages arrive.
  // We do NOT clear on `!isStreaming` to prevent UI blinking while waiting for the network refetch.
  useEffect(() => {
    setOptimisticMessages([]);
  }, [activeThread?.id, messages.length]);

  // Re-sync model selection from localStorage when the thread changes — the
  // value may have been updated by another chat surface (FloatingAssistant,
  // ChatContextDialog) while this window was idle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setModelKey(localStorage.getItem("preferred_ai_model"));
  }, [activeThread?.id]);

  // Auto-scroll to bottom only when the user hasn't scrolled up manually.
  // When a new message is sent, always force-scroll to bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, optimisticMessages]);

  // Reset "scrolled up" flag and snap to bottom whenever a new send starts.
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

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeThread) return;
    const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
    setIsUploading(true);
    setErrorMsg(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${baseUrl}/api/chat/threads/${activeThread.id}/attachments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-workspace-id": activeWorkspaceId || "",
          },
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `Failed to upload ${file.name}`);
        }
        const attachment = (await res.json()) as ChatAttachment;
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (error: any) {
      setErrorMsg(error?.message || "Failed to upload attachment");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = async (customMsg?: string) => {
    if (isStreaming || isSending || isUploading) return;
    const trimmedInput = (customMsg || input).trim();
    if (!activeThread) return;
    if (!trimmedInput && pendingAttachments.length === 0) return;
    const attachmentsToSend = pendingAttachments;

    // 1. Optimistic User Message
    const userTempId = `temp-user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userTempId,
      threadId: activeThread.id,
      role: "USER",
      content: trimmedInput,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
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
    setPendingAttachments([]);
    setIsStreaming(true);
    setErrorMsg(null);

    try {
      const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/chat/threads/${activeThread.id}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-workspace-id": activeWorkspaceId || "",
        },
        body: JSON.stringify({
          content: trimmedInput,
          modelKey: modelKey || undefined,
          attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
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
    } catch (error: any) {
      console.error("Streaming error", error);
      setErrorMsg(error?.message || "Failed to generate AI response");
      // Display error inline instead of deleting user's message so they don't lose context
      setOptimisticMessages((prev) =>
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
      if (onRefetch) onRefetch();
    }
  };

  // Stable identity for the per-message send callback. handleSend is recreated
  // on every render (it closes over input/state), so passing it directly would
  // bust ChatMessageItem's memo on every keystroke. The ref keeps the latest
  // handleSend while the callback identity stays constant.
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const stableSend = useCallback((m: string) => {
    void handleSendRef.current(m);
  }, []);

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
          display: { xs: "none", md: "flex" },
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
      sx={{
        flexGrow: 1,
        minWidth: 0,
        display: { xs: !activeThread ? "none" : "flex", md: "flex" },
        flexDirection: "column",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Toolbar>
          <IconButton
            onClick={() => {
              if (isFullScreen) navigate(-1);
              else onBack?.();
            }}
            size="small"
            sx={{ mr: 1, display: { xs: "flex", md: isFullScreen ? "flex" : "none" } }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {activeThread.title || t("chat.heading")}
          </Typography>
          <Box>
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

      <Box
        sx={{ flexGrow: 1, minWidth: 0, p: 2, overflowY: "auto", overflowX: "hidden" }}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {allMessages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            streaming={isStreaming && msg.id.startsWith("temp-ai")}
            onSendMessage={stableSend}
          />
        ))}
        {isSending && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>

      {errorMsg && (
        <Box sx={{ p: 2, pb: 0 }}>
          <Alert severity="error" onClose={() => setErrorMsg(null)} sx={{ fontSize: "0.9rem" }}>
            {errorMsg}
          </Alert>
        </Box>
      )}

      <Box
        sx={{ p: 3, pb: 4, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleAttachFiles(e.dataTransfer.files);
          }
        }}
        onPaste={(e) => {
          if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            void handleAttachFiles(e.clipboardData.files);
          }
        }}
      >
        <Box
          sx={{
            mb: 2,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexWrap: "wrap",
              flexGrow: 1,
              minWidth: 0,
            }}
          >
            {(activeThread.projectIds ?? []).map((pid) => {
              const proj = projects.find((p) => p.id === pid);
              return proj ? (
                <Chip
                  key={pid}
                  label={proj.title}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 22 }}
                />
              ) : null;
            })}
            {onEditChat && (
              <Tooltip title={t("chat.sidebar.edit") || "Edit contexts"}>
                <IconButton size="small" onClick={() => onEditChat(activeThread)} sx={{ ml: 0.5 }}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <AiModelSelector value={modelKey} onChange={setModelKey} disabled={isStreaming} />
        </Box>
        {pendingAttachments.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            {pendingAttachments.map((att, idx) => {
              const isImage = att.type.startsWith("image/");
              return (
                <Box
                  key={`${att.url}-${idx}`}
                  sx={{
                    position: "relative",
                    width: 80,
                    height: 80,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "background.default",
                    overflow: "hidden",
                  }}
                >
                  {isImage ? (
                    <Box
                      component="img"
                      src={att.url}
                      alt={att.name}
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <>
                      {att.type === "application/pdf" ? (
                        <PdfIcon fontSize="large" color="error" />
                      ) : (
                        <FileIcon fontSize="large" color="action" />
                      )}
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.6rem",
                          px: 0.5,
                          textAlign: "center",
                          width: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {att.name}
                      </Typography>
                    </>
                  )}
                  <IconButton
                    size="small"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    sx={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      bgcolor: "background.paper",
                      width: 18,
                      height: 18,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              );
            })}
            {isUploading && <CircularProgress size={24} sx={{ alignSelf: "center" }} />}
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf,text/csv,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json"
            onChange={(e) => void handleAttachFiles(e.target.files)}
          />
          <Tooltip title={t("chat.window.attachFile") || "Attach files"}>
            <span>
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                sx={{ flexShrink: 0, mb: 0.5 }}
              >
                <AttachFileIcon />
              </IconButton>
            </span>
          </Tooltip>
          <TextField
            fullWidth
            placeholder={t("chat.placeholders.typeMessage")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (
                  !isStreaming &&
                  !isSending &&
                  !isUploading &&
                  (input.trim() || pendingAttachments.length > 0)
                ) {
                  handleSend();
                }
              }
            }}
            multiline
            maxRows={4}
          />
          <IconButton
            color="primary"
            onClick={() => handleSend()}
            disabled={
              (!input.trim() && pendingAttachments.length === 0) ||
              isSending ||
              isStreaming ||
              isUploading
            }
            sx={{ flexShrink: 0, mb: 0.5 }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatWindow;
