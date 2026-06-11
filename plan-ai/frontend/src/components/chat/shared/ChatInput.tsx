import React from "react";
import { Box, Divider, IconButton, Paper, TextField, Typography, useTheme } from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Disable the input + send button (typically while streaming/uploading). */
  disabled?: boolean;
  /** Disable JUST the send button (e.g. while there's nothing to send). */
  sendDisabled?: boolean;
  placeholder?: string;
  /** Optional content rendered ABOVE the input (e.g. attachment previews). */
  topSlot?: React.ReactNode;
  /** Optional content rendered to the LEFT of the textfield (e.g. attach button). */
  leftSlot?: React.ReactNode;
  /** Optional content rendered BELOW the input (e.g. disclaimer). */
  bottomSlot?: React.ReactNode;
  /** Constrain the inner content width — defaults to "md". */
  maxContentWidth?: string | number;
  /** Allow multiline input (Shift+Enter for newline). Default true. */
  multiline?: boolean;
}

/**
 * The chat input affordance: textfield + send button, with slots for
 * surface-specific extras (attachment thumbnails, attach button, model
 * selector). Shared by ChatWindow, FloatingAssistant, AssistantChatPanel.
 */
const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  sendDisabled,
  placeholder = "Ask me anything...",
  topSlot,
  leftSlot,
  bottomSlot,
  maxContentWidth = "md",
  multiline = true,
}) => {
  const theme = useTheme();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sendDisabled || disabled) return;
    onSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!multiline) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendDisabled && !disabled) onSubmit();
    }
  };

  return (
    <Box
      sx={{
        p: 3,
        bgcolor: "background.default",
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ maxWidth: maxContentWidth, mx: "auto" }}>
        {topSlot}
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
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          {leftSlot}
          <TextField
            fullWidth
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="standard"
            disabled={disabled}
            multiline={multiline}
            maxRows={multiline ? 4 : undefined}
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
            disabled={disabled || sendDisabled}
          >
            <SendIcon />
          </IconButton>
        </Paper>
        {bottomSlot ?? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 1.5 }}
          >
            AI Assistant can make mistakes. Verify important information.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default ChatInput;
