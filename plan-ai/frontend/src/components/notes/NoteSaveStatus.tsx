import React from "react";
import { Box, CircularProgress, Tooltip, Typography } from "@mui/material";
import {
  CheckCircleOutline as SavedIcon,
  CloudOff as OfflineIcon,
  ErrorOutline as ErrorIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { SaveStatus } from "./NoteSaver";

/** Small "Saved / Saving / Offline" line next to the editor controls. */
const NoteSaveStatus: React.FC<{ status: SaveStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (status === "idle") return null;

  const view: Record<Exclude<SaveStatus, "idle">, { icon: React.ReactNode; label: string }> = {
    pending: { icon: <CircularProgress size={12} />, label: t("notes.status.saving") },
    saving: { icon: <CircularProgress size={12} />, label: t("notes.status.saving") },
    saved: { icon: <SavedIcon sx={{ fontSize: 16 }} />, label: t("notes.status.saved") },
    offline: { icon: <OfflineIcon sx={{ fontSize: 16 }} />, label: t("notes.status.offline") },
    error: { icon: <ErrorIcon sx={{ fontSize: 16 }} />, label: t("notes.status.error") },
  };
  const { icon, label } = view[status];
  const color =
    status === "offline" ? "warning.main" : status === "error" ? "error.main" : "text.secondary";

  const content = (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color, whiteSpace: "nowrap" }}
    >
      {icon}
      <Typography variant="caption" color="inherit">
        {label}
      </Typography>
    </Box>
  );

  return status === "offline" ? (
    <Tooltip title={t("notes.status.offlineHint")}>{content}</Tooltip>
  ) : (
    content
  );
};

export default NoteSaveStatus;
