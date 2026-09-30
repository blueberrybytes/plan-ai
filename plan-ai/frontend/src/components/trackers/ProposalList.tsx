import React from "react";
import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerEntry } from "../../store/apis/trackersApi";
import ProposalRow from "./ProposalRow";

export interface ProposalListProps {
  entries: TrackerEntry[];
  trackers: Tracker[];
  hideCalories: boolean;
  /** Ids of entries with a request running. */
  busyIds: string[];
  acceptingAll: boolean;
  onAccept: (entry: TrackerEntry) => void;
  onReject: (entry: TrackerEntry) => void;
  onSaveValue: (entry: TrackerEntry, value: number) => void;
  onAcceptAll: () => void;
}

/** Proposed entries waiting for the user. Nothing here counts until accepted. */
const ProposalList: React.FC<ProposalListProps> = ({
  entries,
  trackers,
  hideCalories,
  busyIds,
  acceptingAll,
  onAccept,
  onReject,
  onSaveValue,
  onAcceptAll,
}) => {
  const { t } = useTranslation();
  if (entries.length === 0) return null;
  const trackerById = new Map(trackers.map((tracker) => [tracker.id, tracker]));

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("trackers.proposals.title", { count: entries.length })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("trackers.proposals.hint")}
          </Typography>
        </Box>
        {entries.length > 1 && (
          <Button size="small" variant="contained" onClick={onAcceptAll} disabled={acceptingAll}>
            {t("trackers.proposals.acceptAll")}
          </Button>
        )}
      </Box>
      {entries.map((entry, index) => (
        <React.Fragment key={entry.id}>
          {index > 0 && <Divider />}
          <ProposalRow
            entry={entry}
            tracker={trackerById.get(entry.trackerId)}
            hideCalories={hideCalories}
            busy={acceptingAll || busyIds.includes(entry.id)}
            onAccept={() => onAccept(entry)}
            onReject={() => onReject(entry)}
            onSaveValue={(value) => onSaveValue(entry, value)}
          />
        </React.Fragment>
      ))}
    </Paper>
  );
};

export default ProposalList;
