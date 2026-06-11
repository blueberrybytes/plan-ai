import React from "react";
import { Box, IconButton, Typography, CircularProgress } from "@mui/material";
import {
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
} from "@mui/icons-material";
import type { ChatAttachment } from "../../../store/apis/chatApi";

interface AttachmentPreviewStripProps {
  attachments: ChatAttachment[];
  onRemove: (idx: number) => void;
  isUploading?: boolean;
}

/**
 * Row of pending-upload thumbnails shown above the chat input.
 * - Images render as 80×80 thumbnails
 * - PDFs render as a red PDF icon + filename
 * - Other docs render as a generic file icon + filename
 * - Hover to reveal a remove (×) button on each
 * - Trailing CircularProgress when an upload is still in flight
 */
const AttachmentPreviewStrip: React.FC<AttachmentPreviewStripProps> = ({
  attachments,
  onRemove,
  isUploading,
}) => {
  if (attachments.length === 0 && !isUploading) return null;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
      {attachments.map((att, idx) => {
        const isImage = att.type.startsWith("image/");
        const isPdf = att.type === "application/pdf";
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
                {isPdf ? (
                  <PdfIcon fontSize="large" color="error" />
                ) : (
                  <FileIcon fontSize="large" color="primary" />
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
              onClick={() => onRemove(idx)}
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
  );
};

export default AttachmentPreviewStrip;
