import React from "react";
import { Box, Typography } from "@mui/material";
import { PictureAsPdf as PdfIcon, InsertDriveFile as FileIcon } from "@mui/icons-material";
import type { ChatAttachment } from "../../../store/apis/chatApi";

interface AttachmentMessageStripProps {
  attachments: ChatAttachment[];
}

/**
 * Render attachments inside a SENT chat bubble: images inline (clickable to
 * open), PDFs / docs as a clickable file card. Used by ChatWindow and the
 * AssistantChatPanel so attachments look identical across surfaces.
 */
const AttachmentMessageStrip: React.FC<AttachmentMessageStripProps> = ({ attachments }) => {
  if (attachments.length === 0) return null;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.5, width: "100%" }}>
      {attachments.map((att, idx) => {
        const isImage = att.type.startsWith("image/");
        const isPdf = att.type === "application/pdf";
        if (isImage) {
          return (
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
          );
        }
        return (
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
            {isPdf ? <PdfIcon color="error" /> : <FileIcon color="primary" />}
            <Typography variant="caption" sx={{ maxWidth: 180 }} noWrap>
              {att.name}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default AttachmentMessageStrip;
