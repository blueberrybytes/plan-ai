import React from "react";
import { Button, CircularProgress } from "@mui/material";
import { Insights as TrackersIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface LogToTrackersButtonProps {
  loading: boolean;
  onClick: () => void;
}

const LogToTrackersButton: React.FC<LogToTrackersButtonProps> = ({ loading, onClick }) => {
  const { t } = useTranslation();
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={onClick}
      disabled={loading}
      startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <TrackersIcon />}
    >
      {t("trackers.note.log")}
    </Button>
  );
};

export default LogToTrackersButton;
