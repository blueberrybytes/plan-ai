import React, { useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  EditOutlined as EditIcon,
  History as HistoryIcon,
  MoreVert as MoreIcon,
  Unarchive as RestoreIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerEntry, TrackerStats } from "../../store/apis/trackersApi";
import TrackerChart from "./TrackerChart";
import TrackerGoalProgress from "./TrackerGoalProgress";
import TrackerQuickAdd from "./TrackerQuickAdd";
import TrackerTodayValue from "./TrackerTodayValue";
import { hidesKcal, streakLabel } from "./trackerUtils";

interface TrackerCardProps {
  tracker: Tracker;
  stats: TrackerStats | undefined;
  todayEntries: TrackerEntry[];
  hideCalories: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onRestore: () => void;
}

/** One tracker: today, goal, streak, the last 30 days and a quick add. */
const TrackerCard: React.FC<TrackerCardProps> = ({
  tracker,
  stats,
  todayEntries,
  hideCalories,
  onEdit,
  onHistory,
  onRestore,
}) => {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const hideNumbers = hidesKcal(tracker, hideCalories);
  const streak = stats ? streakLabel(stats.streak, stats.streakUnit) : null;

  const pick = (action: () => void) => () => {
    setMenuAnchor(null);
    action();
  };

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2, height: "100%", opacity: tracker.archived ? 0.7 : 1 }}
    >
      <Stack spacing={1.25} sx={{ height: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
            {tracker.name}
          </Typography>
          {tracker.archived && <Chip size="small" label={t("trackers.card.archived")} />}
          <IconButton
            size="small"
            aria-label={t("trackers.card.menu")}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onClick={pick(onEdit)}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              {t("trackers.card.edit")}
            </MenuItem>
            {!tracker.archived && (
              <MenuItem onClick={pick(onHistory)}>
                <ListItemIcon>
                  <HistoryIcon fontSize="small" />
                </ListItemIcon>
                {t("trackers.card.history")}
              </MenuItem>
            )}
            {tracker.archived && (
              <MenuItem onClick={pick(onRestore)}>
                <ListItemIcon>
                  <RestoreIcon fontSize="small" />
                </ListItemIcon>
                {t("trackers.card.restore")}
              </MenuItem>
            )}
          </Menu>
        </Box>

        {!tracker.archived && (
          <>
            <TrackerTodayValue tracker={tracker} stats={stats} hideNumbers={hideNumbers} />
            <TrackerGoalProgress tracker={tracker} stats={stats} hideNumbers={hideNumbers} />
            {streak && (
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                {t(streak.key, { count: streak.count })}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {stats && (
              <TrackerChart tracker={tracker} days={stats.days} hideNumbers={hideNumbers} />
            )}
            <Box>
              <TrackerQuickAdd tracker={tracker} todayEntries={todayEntries} />
            </Box>
          </>
        )}
      </Stack>
    </Paper>
  );
};

export default TrackerCard;
