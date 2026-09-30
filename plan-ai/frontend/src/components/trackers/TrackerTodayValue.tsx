import React from "react";
import { Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerStats } from "../../store/apis/trackersApi";
import { latestDay } from "./trackerUtils";
import { useTrackerFormat } from "./useTrackerFormat";

/** Today's value in big type, or the last one for a tracker that keeps the last value. */
const TrackerTodayValue: React.FC<{
  tracker: Tracker;
  stats: TrackerStats | undefined;
  hideNumbers: boolean;
}> = ({ tracker, stats, hideNumbers }) => {
  const { t } = useTranslation();
  const { amount, day } = useTrackerFormat();

  if (tracker.kind === "CHECK" || hideNumbers) {
    const logged = (stats?.today ?? 0) > 0;
    const key =
      tracker.kind === "CHECK"
        ? logged
          ? "doneToday"
          : "notDoneToday"
        : logged
          ? "loggedToday"
          : "nothingToday";
    return (
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {t(`trackers.card.${key}`)}
      </Typography>
    );
  }

  if (tracker.aggregation === "LAST" && stats?.today === null) {
    const last = latestDay(stats?.days);
    return (
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {last ? amount(last.value, tracker) : t("trackers.card.noValue")}
        {last && (
          <Typography component="span" variant="body2" color="text.secondary">
            {` · ${day(last.date)}`}
          </Typography>
        )}
      </Typography>
    );
  }

  return (
    <Typography variant="h5" sx={{ fontWeight: 700 }}>
      {amount(stats?.today ?? 0, tracker)}
      <Typography component="span" variant="body2" color="text.secondary">
        {` · ${t("trackers.day.today")}`}
      </Typography>
    </Typography>
  );
};

export default TrackerTodayValue;
