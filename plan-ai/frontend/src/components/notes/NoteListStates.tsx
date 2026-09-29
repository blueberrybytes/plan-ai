import React from "react";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import { StickyNote2Outlined as NotesIcon } from "@mui/icons-material";

/** Placeholder rows while the list loads. */
export const NoteListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <Stack spacing={1.5} sx={{ px: 1.5, py: 1 }} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <Box key={index}>
        <Skeleton variant="text" width={`${60 + ((index * 13) % 35)}%`} height={22} />
        <Skeleton variant="text" width="85%" height={16} />
        <Skeleton variant="text" width="30%" height={14} />
      </Box>
    ))}
  </Stack>
);

interface NoteEmptyStateProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const NoteEmptyState: React.FC<NoteEmptyStateProps> = ({
  title,
  body,
  actionLabel,
  onAction,
}) => (
  <Box sx={{ textAlign: "center", px: 3, py: 5, color: "text.secondary" }}>
    <NotesIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
    <Typography variant="subtitle2" color="text.primary">
      {title}
    </Typography>
    {body && (
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {body}
      </Typography>
    )}
    {actionLabel && onAction && (
      <Button size="small" variant="outlined" onClick={onAction} sx={{ mt: 2 }}>
        {actionLabel}
      </Button>
    )}
  </Box>
);
