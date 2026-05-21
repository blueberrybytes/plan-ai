/* eslint-disable @typescript-eslint/no-explicit-any */
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
} from "@mui/icons-material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useTranslation } from "react-i18next";
import { ChatAttachment, ChatMessage, ChatThread } from "../../store/apis/chatApi";
import AssistantMessageRenderer from "./AssistantMessageRenderer";
import CitationChip from "./CitationChip";
import { AiGraphTrace, ContextGraph } from "../project/ContextGraph";
import ThinkingIndicator from "./ThinkingIndicator";
import { useListContextsQuery } from "../../store/apis/contextApi";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import { useNavigate } from "react-router-dom";
import AiModelSelector from "../common/AiModelSelector";

// Feature flag — set to true to re-enable the AI Graph Trace visualization in chat replies.
const SHOW_AI_GRAPH_TRACE = false;

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
  const { data: contextResponse } = useListContextsQuery();
  const contexts = contextResponse?.data?.contexts ?? [];

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
        const res = await fetch(
          `${baseUrl}/api/chat/threads/${activeThread.id}/attachments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "x-workspace-id": activeWorkspaceId || "",
            },
            body: formData,
          },
        );
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
        {allMessages.map((msg) => {
          let contentToRender = msg.content;
          let citations: Array<{ filename: string; lines: string }> = [];
          let latencyMs: number | undefined;
          let toolsUsed: string[] = [];
          let aiGraphTrace: AiGraphTrace | null = null;

          if (msg.role !== "USER") {
            try {
              const parsed = JSON.parse(msg.content);
              if (parsed.text) {
                contentToRender = parsed.text;
              }
              if (Array.isArray(parsed.citations)) {
                citations = parsed.citations;
              }
              if (typeof parsed.latencyMs === "number") {
                latencyMs = parsed.latencyMs;
              }
              if (Array.isArray(parsed.tools)) {
                toolsUsed = parsed.tools;
              }
              if (parsed.aiGraphTrace && Array.isArray(parsed.aiGraphTrace.nodes)) {
                aiGraphTrace = parsed.aiGraphTrace;
              }
            } catch {
              // Not JSON, fallback to raw content.
              contentToRender = msg.content;

              // Handle partial JSON from streamObject streaming raw stringified chunks
              const textMatch = msg.content.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)/);
              if (textMatch) {
                try {
                  contentToRender = JSON.parse(`"${textMatch[1]}"`);
                } catch {
                  contentToRender = textMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                }
              }
            }
          }

          if (typeof contentToRender === "string") {
            // Clean inline citations stringified from old messages
            contentToRender = contentToRender.replace(/\[\s*\{\s*"filename"[\s\S]*?\]/g, "");
            // Also strip ---CITATIONS--- entirely if it was streamed before the update
            contentToRender = contentToRender.split("---CITATIONS---")[0].trim();
          }

          console.log(`[DEBUG Chat Message ${msg.id}]`, {
            role: msg.role,
            hasContent: !!contentToRender,
            citationsCount: citations.length,
            toolsUsed: toolsUsed,
            rawContent: msg.content.substring(0, 50) + "..."
          });

          return (
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
                  overflowX: "auto",
                  wordBreak: "break-word",
                  bgcolor: msg.role === "USER" ? "primary.main" : "background.paper",
                  color: msg.role === "USER" ? "primary.contrastText" : "text.primary",
                  opacity: msg.id.startsWith("temp-user") ? 0.7 : 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                {msg.attachments && msg.attachments.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: contentToRender ? 1 : 0, width: "100%" }}>
                    {msg.attachments.map((att, idx) => {
                      const isImage = att.type.startsWith("image/");
                      return isImage ? (
                        <Box
                          key={`${att.url}-${idx}`}
                          component="a"
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: "block",
                            maxWidth: 220,
                            maxHeight: 220,
                            borderRadius: 1,
                            overflow: "hidden",
                            border: 1,
                            borderColor: "divider",
                          }}
                        >
                          <Box
                            component="img"
                            src={att.url}
                            alt={att.name}
                            sx={{ display: "block", maxWidth: "100%", maxHeight: 220 }}
                          />
                        </Box>
                      ) : (
                        <Box
                          key={`${att.url}-${idx}`}
                          component="a"
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            p: 1,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                            bgcolor: "background.default",
                            textDecoration: "none",
                            color: "text.primary",
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <PdfIcon color="error" />
                          <Typography variant="caption" sx={{ maxWidth: 180 }} noWrap>
                            {att.name}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
                <Box sx={{ display: "flex", width: "100%", gap: 1 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0, overflowX: "auto" }}>
                    {msg.role === "ASSISTANT" && !contentToRender && isStreaming ? (
                      <ThinkingIndicator />
                    ) : (
                      <AssistantMessageRenderer
                        content={contentToRender}
                        onSendMessage={(msg) => handleSend(msg)}
                        isStreaming={isStreaming && msg.id.startsWith("temp-ai")}
                      />
                    )}
                  </Box>
                  {contentToRender && msg.role === "USER" && (
                    <Tooltip title={t("chat.window.copyResponse")}>
                      <IconButton
                        onClick={() => navigator.clipboard.writeText(contentToRender)}
                        size="small"
                        sx={{
                          alignSelf: "flex-start",
                          opacity: 0.7,
                          "&:hover": { opacity: 1 },
                          color: "inherit",
                          mt: -1,
                          mr: -1,
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {citations.length > 0 && (
                  <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: "divider" }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.5, fontWeight: 500 }}
                    >
                      Sources
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {(() => {
                        const groupedCitations = citations.reduce(
                          (acc, cite) => {
                            if (!acc[cite.filename]) acc[cite.filename] = [];
                            acc[cite.filename].push(cite.lines);
                            return acc;
                          },
                          {} as Record<string, string[]>,
                        );
                        return Object.entries(groupedCitations).map(([filename, linesArray]) => (
                          <CitationChip
                            key={filename}
                            filename={filename}
                            lines={(linesArray as string[]).join(", ")}
                          />
                        ));
                      })()}
                    </Box>
                  </Box>
                )}

                {/* AI Graph Trace temporarily hidden — flip SHOW_AI_GRAPH_TRACE to re-enable. */}
                {SHOW_AI_GRAPH_TRACE && aiGraphTrace && aiGraphTrace.nodes.length > 0 && (
                  <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: "divider" }}>
                    <Box sx={{ mt: 1, minWidth: { xs: "250px", sm: "400px" }, width: "100%" }}>
                      <Typography
                        variant="caption"
                        color="primary.main"
                        sx={{ display: "block", mb: 1, fontWeight: 600 }}
                      >
                        ✨ AI Graph Trace
                      </Typography>
                      <ContextGraph height={250} nodes={aiGraphTrace.nodes} links={aiGraphTrace.links} />
                    </Box>
                  </Box>
                )}

                {msg.role === "ASSISTANT" && contentToRender && (
                  <Box
                    sx={{
                      mt: 1,
                      pt: 1,
                      borderTop: citations.length > 0 ? 0 : 1,
                      borderColor: "divider",
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Tooltip title={t("chat.window.copyResponse")}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyIcon fontSize="small" />}
                        onClick={() => navigator.clipboard.writeText(contentToRender)}
                        sx={{
                          minWidth: 0,
                          py: 0.25,
                          px: 1,
                          fontSize: "0.7rem",
                          textTransform: "none",
                          color: "text.secondary",
                          borderColor: "divider",
                        }}
                      >
                        {t("chat.window.copyResponse")}
                      </Button>
                    </Tooltip>
                    {latencyMs && (
                      <Typography variant="caption" color="text.secondary">
                        ⏱️ {(latencyMs / 1000).toFixed(1)}s
                      </Typography>
                    )}
                    {toolsUsed.length > 0 &&
                      toolsUsed.map((toolName) => (
                        <Chip
                          key={toolName}
                          label={toolName}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: "0.65rem",
                            height: 18,
                            color: "text.secondary",
                            borderColor: "divider",
                          }}
                        />
                      ))}
                  </Box>
                )}
              </Paper>
            </Box>
          );
        })}
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
            {activeThread.contextIds.map((cid) => {
              const ctx = contexts.find((c) => c.id === cid);
              return ctx ? (
                <Chip
                  key={cid}
                  label={ctx.name}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 22 }}
                />
              ) : null;
            })}
            {onEditChat && (
              <Tooltip title={t("chat.sidebar.edit") || "Edit contexts"}>
                <IconButton
                  size="small"
                  onClick={() => onEditChat(activeThread)}
                  sx={{ ml: 0.5 }}
                >
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
                      <PdfIcon fontSize="large" color="error" />
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
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf"
            onChange={(e) => void handleAttachFiles(e.target.files)}
          />
          <Tooltip title={t("chat.window.attachFile") || "Attach image or PDF"}>
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
