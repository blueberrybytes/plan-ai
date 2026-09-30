import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Insights as TrackersIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import TrackerPresetPicker from "./TrackerPresetPicker";
import type { TrackerPreset } from "./trackerPresets";

interface TrackersEmptyStateProps {
  onPick: (preset: TrackerPreset) => void;
}

/** No trackers yet: a short text and the presets to start from. */
const TrackersEmptyState: React.FC<TrackersEmptyStateProps> = ({ onPick }) => {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 2, textAlign: "center" }}>
      <TrackersIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {t("trackers.empty.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
        {t("trackers.empty.body")}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <TrackerPresetPicker onPick={onPick} />
      </Box>
    </Paper>
  );
};

export default TrackersEmptyState;
