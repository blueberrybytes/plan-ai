import React from "react";
import { Box, Chip, LinearProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerStats } from "../../store/apis/trackersApi";
import { goalProgress } from "./trackerUtils";
import { useTrackerFormat } from "./useTrackerFormat";

interface TrackerGoalProgressProps {
  tracker: Tracker;
  stats: TrackerStats | undefined;
  /** Show only met or not met, without numbers. */
  hideNumbers: boolean;
}

/** The goal and how far today (or this week) is from it. */
const TrackerGoalProgress: React.FC<TrackerGoalProgressProps> = ({
  tracker,
  stats,
  hideNumbers,
}) => {
  const { t } = useTranslation();
  const { amount, number } = useTrackerFormat();
  const progress = goalProgress(tracker, stats);
  if (!progress) return null;

  const periodKey = progress.period === "WEEK" ? "week" : "day";

  if (hideNumbers) {
    if (progress.met === null) return null;
    return (
      <Chip
        size="small"
        color={progress.met ? "success" : "default"}
        variant={progress.met ? "filled" : "outlined"}
        label={t(`trackers.goal.${progress.met ? "met" : "notMet"}.${periodKey}`)}
      />
    );
  }

  const goalText =
    tracker.kind === "CHECK"
      ? t("trackers.value.days", { count: progress.goal })
      : amount(progress.goal, tracker);
  const overLimit = progress.direction === "AT_MOST" && progress.ratio > 1;
  const color = overLimit ? "error" : progress.met ? "success" : "primary";

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {t(
          `trackers.goal.${progress.direction === "AT_MOST" ? "atMost" : "atLeast"}.${periodKey}`,
          {
            goal: goalText,
          },
        )}
        {" · "}
        {t(`trackers.goal.progress.${periodKey}`, {
          current: number(progress.current),
          goal: goalText,
        })}
      </Typography>
      <LinearProgress
        variant="determinate"
        color={color}
        value={Math.min(100, progress.ratio * 100)}
        sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
      />
    </Box>
  );
};

export default TrackerGoalProgress;
