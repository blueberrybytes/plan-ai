/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Box, Button, TextField, IconButton, SxProps, Theme } from "@mui/material";
import { Edit as EditIcon, Check as CheckIcon, Close as CloseIcon } from "@mui/icons-material";
import MarkdownRenderer from "../common/MarkdownRenderer";
import type { MarkdownChunk } from "../../utils/markdownParser";

interface HybridChunkEditorProps {
  chunk: MarkdownChunk;
  theme?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  } | null;
  onSave: (chunk: MarkdownChunk, newRawText: string) => void;
  markdownStyle?: SxProps<Theme>;
}

const HybridChunkEditor: React.FC<HybridChunkEditorProps> = ({
  chunk,
  theme,
  onSave,
  markdownStyle,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(chunk.rawText);

  const handleSave = () => {
    onSave(chunk, draftText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftText(chunk.rawText);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Box
        sx={{
          border: "2px solid",
          borderColor: "primary.main",
          borderRadius: 1,
          p: 1,
          position: "relative",
          bgcolor: "background.paper",
        }}
      >
        <TextField
          multiline
          fullWidth
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          sx={{
            "& .MuiInputBase-root": {
              fontFamily: "monospace",
              fontSize: "0.95rem",
              alignItems: "flex-start",
              px: 1.5,
              py: 1,
            },
            "& fieldset": { border: "none" },
          }}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
          <Button size="small" variant="text" onClick={handleCancel} startIcon={<CloseIcon />}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={handleSave} startIcon={<CheckIcon />}>
            Save
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 1,
        transition: "all 0.2s ease",
        p: 2,
        border: "1px dashed transparent",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "divider",
          "& .edit-btn": { opacity: 1, transform: "scale(1)" },
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
        }}
      >
        <IconButton
          className="edit-btn"
          size="small"
          onClick={() => setIsEditing(true)}
          sx={{
            opacity: 0,
            transform: "scale(0.8)",
            transition: "all 0.2s ease",
            bgcolor: "background.paper",
            boxShadow: 1,
            "&:hover": { bgcolor: "background.paper", color: "primary.main" },
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box onClick={() => setIsEditing(true)} sx={{ cursor: "pointer", pointerEvents: "auto" }}>
        <MarkdownRenderer
          content={chunk.rawText}
          theme={theme}
          sx={{ ...(markdownStyle as any), p: 0, my: 0 } as any}
        />
      </Box>
    </Box>
  );
};

export default HybridChunkEditor;
