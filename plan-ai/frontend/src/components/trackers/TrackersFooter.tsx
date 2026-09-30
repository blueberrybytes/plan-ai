import React from "react";
import { Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface TrackersFooterProps {
  /** False when the last reading had no food database behind it. */
  foodDatabase: boolean | null;
}

/** Calories are estimates, not advice. */
const TrackersFooter: React.FC<TrackersFooterProps> = ({ foodDatabase }) => {
  const { t } = useTranslation();
  return (
    <Typography variant="caption" color="text.secondary" component="p">
      {t("trackers.footer.estimates")}
      {foodDatabase === false && ` ${t("trackers.footer.aiOnly")}`}
    </Typography>
  );
};

export default TrackersFooter;
