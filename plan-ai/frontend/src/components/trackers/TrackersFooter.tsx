import React from "react";
import { Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Calories are AI estimates, not advice. */
const TrackersFooter: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Typography variant="caption" color="text.secondary" component="p">
      {t("trackers.footer.estimates")}
    </Typography>
  );
};

export default TrackersFooter;
