import React from "react";
import { Box } from "@mui/material";
import type { Tracker, TrackerEntry, TrackerStats } from "../../store/apis/trackersApi";
import TrackerCard from "./TrackerCard";

interface TrackerGridProps {
  trackers: Tracker[];
  stats: TrackerStats[];
  todayEntries: TrackerEntry[];
  hideCalories: boolean;
  onEdit: (tracker: Tracker) => void;
  onHistory: (tracker: Tracker) => void;
  onRestore: (tracker: Tracker) => void;
}

/** The tracker cards, one to three columns wide. */
const TrackerGrid: React.FC<TrackerGridProps> = ({
  trackers,
  stats,
  todayEntries,
  hideCalories,
  onEdit,
  onHistory,
  onRestore,
}) => {
  const statsById = new Map(stats.map((s) => [s.trackerId, s]));
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
      }}
    >
      {trackers.map((tracker) => (
        <TrackerCard
          key={tracker.id}
          tracker={tracker}
          stats={statsById.get(tracker.id)}
          todayEntries={todayEntries.filter((entry) => entry.trackerId === tracker.id)}
          hideCalories={hideCalories}
          onEdit={() => onEdit(tracker)}
          onHistory={() => onHistory(tracker)}
          onRestore={() => onRestore(tracker)}
        />
      ))}
    </Box>
  );
};

export default TrackerGrid;
