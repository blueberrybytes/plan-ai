/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Box, CircularProgress, Paper, Typography, useTheme, keyframes } from "@mui/material";
import AssistantMessageRenderer from "../AssistantMessageRenderer";

// Three dots that pulse one after another — classic "still working" affordance.
const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
  40%           { opacity: 1;    transform: scale(1); }
`;

const WorkingDots: React.FC<{ label?: string }> = ({ label = "Working" }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, minHeight: 16 }}>
    <Box sx={{ display: "inline-flex", gap: 0.4 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: "text.secondary",
            animation: `${dotPulse} 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </Box>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontStyle: "italic", fontSize: "0.7rem" }}
    >
      {label}…
    </Typography>
  </Box>
);

/**
 * A single chat bubble. Handles:
 * - User vs assistant styling (color, alignment)
 * - Empty assistant + isStreaming → "Thinking..." placeholder
 * - Plain `content` string OR Vercel-AI-SDK `parts` array (text + tool-invocations)
 * - Forwarding markdown actions (UI:CONFIRM_DOC/TASK) via onSendMessage
 *
 * Used by ChatWindow, FloatingAssistant, and AssistantChatPanel.
 */
export interface ChatBubbleMessage {
  id: string;
  role: "user" | "assistant" | "USER" | "ASSISTANT";
  content: string;
  parts?: any[];
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  /** True if THIS message is the in-flight assistant stream. */
  isStreaming?: boolean;
  /** Forwarded to AssistantMessageRenderer for confirm-card actions. */
  onSendMessage?: (msg: string) => void;
  /** Override the default 85% bubble width cap. */
  maxWidth?: string | number;
  /** Optional content rendered AFTER the message body (citations, latency chips, copy button). */
  footer?: React.ReactNode;
  /** Optional content rendered BEFORE the message body (e.g. attachment thumbnails). */
  header?: React.ReactNode;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isStreaming,
  onSendMessage,
  maxWidth = "85%",
  footer,
  header,
}) => {
  const theme = useTheme();
  const isUser = message.role === "user" || message.role === "USER";

  const renderEmptyStreaming = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minHeight: 24 }}>
      <CircularProgress size={16} />
      <Typography variant="body2" color="text.secondary">
        Thinking...
      </Typography>
    </Box>
  );

  const renderContent = () => {
    const hasContent = Boolean(message.content);
    const hasParts = Array.isArray(message.parts) && message.parts.length > 0;
    if (!hasContent && !hasParts && !isUser && isStreaming) {
      return renderEmptyStreaming;
    }

    // When the assistant has already emitted some text AND we're still
    // streaming, show a persistent "Working…" pulse so tool calls between
    // text chunks don't feel like the chat froze.
    const showWorkingDots = !isUser && isStreaming && (hasContent || hasParts);

    return (
      <Box>
        {hasContent && (
          <AssistantMessageRenderer
            content={message.content}
            onSendMessage={onSendMessage}
            isStreaming={isStreaming}
          />
        )}
        {!hasContent &&
          hasParts &&
          message.parts?.map((part: any, index: number) => {
            if (part.type === "text") {
              return (
                <Box key={`text-${index}`} sx={{ mb: 1 }}>
                  <AssistantMessageRenderer
                    content={part.text || ""}
                    onSendMessage={onSendMessage}
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
        {showWorkingDots && <WorkingDots />}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 3,
      }}
    >
      <Paper
        elevation={isUser ? 0 : 1}
        sx={{
          p: 2.5,
          maxWidth,
          overflowX: "auto",
          wordBreak: "break-word",
          borderRadius: 3,
          bgcolor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
          border: !isUser ? `1px solid ${theme.palette.divider}` : "none",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {header}
        {renderContent()}
        {footer}
      </Paper>
    </Box>
  );
};

export default ChatBubble;
