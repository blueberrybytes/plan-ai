import React, { useEffect, useMemo, useState } from "react";
import { Box, Paper, Typography, Chip, Tooltip, IconButton, Button, Collapse } from "@mui/material";
import {
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Psychology as PsychologyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useTranslation } from "react-i18next";
import { ChatMessage } from "../../store/apis/chatApi";
import AssistantMessageRenderer from "./AssistantMessageRenderer";
import CitationChip from "./CitationChip";
import ThinkingIndicator from "./ThinkingIndicator";
import { AiGraphTrace, ContextGraph } from "../project/ContextGraph";

// Feature flag — flip to true to re-enable the AI Graph Trace visualization.
const SHOW_AI_GRAPH_TRACE = false;

/**
 * Collapsible "Thinking" panel showing the model's streamed reasoning.
 * Auto-expanded while thinking, collapses once the answer begins.
 */
const ThinkingPanel: React.FC<{ thinking: string; streaming: boolean }> = ({
  thinking,
  streaming,
}) => {
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (!streaming) setOpen(false);
  }, [streaming]);

  return (
    <Box
      sx={{
        mb: 1,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "action.hover",
        overflow: "hidden",
      }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.5,
          cursor: "pointer",
        }}
      >
        <PsychologyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", flex: 1 }}>
          {streaming ? "Thinking…" : "Thinking"}
        </Typography>
        {open ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        )}
      </Box>
      <Collapse in={open}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            px: 1.5,
            pb: 1,
            whiteSpace: "pre-wrap",
            color: "text.secondary",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {thinking}
        </Typography>
      </Collapse>
    </Box>
  );
};

interface ParsedMessage {
  thinking: string | null;
  contentToRender: string;
  citations: Array<{ filename: string; lines: string }>;
  latencyMs?: number;
  toolsUsed: string[];
  aiGraphTrace: AiGraphTrace | null;
}

/** Pure parse of a stored/streamed message into its renderable parts. */
function parseMessage(role: ChatMessage["role"], content: string): ParsedMessage {
  let thinking: string | null = null;
  let rawContent = content;
  if (role !== "USER") {
    const thinkMatch = rawContent.match(/<think>([\s\S]*?)(<\/think>|$)/);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim() || null;
      rawContent = rawContent.slice(thinkMatch[0].length);
    }
  }

  let contentToRender = rawContent;
  let citations: Array<{ filename: string; lines: string }> = [];
  let latencyMs: number | undefined;
  let toolsUsed: string[] = [];
  let aiGraphTrace: AiGraphTrace | null = null;

  if (role !== "USER") {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed.text) contentToRender = parsed.text;
      if (Array.isArray(parsed.citations)) citations = parsed.citations;
      if (typeof parsed.latencyMs === "number") latencyMs = parsed.latencyMs;
      if (Array.isArray(parsed.tools)) toolsUsed = parsed.tools;
      if (parsed.aiGraphTrace && Array.isArray(parsed.aiGraphTrace.nodes)) {
        aiGraphTrace = parsed.aiGraphTrace;
      }
    } catch {
      contentToRender = rawContent;
      const textMatch = rawContent.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)/);
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
    contentToRender = contentToRender.replace(/\[\s*\{\s*"filename"[\s\S]*?\]/g, "");
    contentToRender = contentToRender.split("---CITATIONS---")[0].trim();
  }

  return { thinking, contentToRender, citations, latencyMs, toolsUsed, aiGraphTrace };
}

interface ChatMessageItemProps {
  msg: ChatMessage;
  /** True ONLY for the message currently streaming in (the temp-ai bubble). */
  streaming: boolean;
  onSendMessage: (msg: string) => void;
}

/**
 * One chat bubble. Memoized so that streaming a new message (or typing in the
 * input) does NOT re-parse + re-render every other message's markdown/mermaid
 * — the cause of the "chat gets very slow in long conversations" report.
 */
const ChatMessageItemInner: React.FC<ChatMessageItemProps> = ({
  msg,
  streaming,
  onSendMessage,
}) => {
  const { t } = useTranslation();
  const { thinking, contentToRender, citations, latencyMs, toolsUsed, aiGraphTrace } = useMemo(
    () => parseMessage(msg.role, msg.content),
    [msg.role, msg.content],
  );

  return (
    <Box
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
        {msg.role !== "USER" && thinking && (
          <Box sx={{ width: "100%" }}>
            <ThinkingPanel thinking={thinking} streaming={!contentToRender} />
          </Box>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              mb: contentToRender ? 1 : 0,
              width: "100%",
            }}
          >
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
                  {att.type === "application/pdf" ? (
                    <PdfIcon color="error" />
                  ) : (
                    <FileIcon color="action" />
                  )}
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
            {msg.role === "ASSISTANT" && !contentToRender && streaming ? (
              <ThinkingIndicator />
            ) : (
              <AssistantMessageRenderer
                content={contentToRender}
                onSendMessage={onSendMessage}
                isStreaming={streaming}
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
                const grouped = citations.reduce(
                  (acc, cite) => {
                    if (!acc[cite.filename]) acc[cite.filename] = [];
                    acc[cite.filename].push(cite.lines);
                    return acc;
                  },
                  {} as Record<string, string[]>,
                );
                return Object.entries(grouped).map(([filename, linesArray]) => (
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
};

const ChatMessageItem = React.memo(ChatMessageItemInner);
export default ChatMessageItem;
