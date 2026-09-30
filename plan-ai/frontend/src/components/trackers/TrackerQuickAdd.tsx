import React, { useState } from "react";
import { Button } from "@mui/material";
import { Add as AddIcon, Check as CheckIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  useAddTrackerEntryMutation,
  useDeleteTrackerEntryMutation,
  type Tracker,
  type TrackerEntry,
} from "../../store/apis/trackersApi";
import { newNoteId } from "../notes/noteUtils";
import AddEntryDialog from "./AddEntryDialog";
import { localToday } from "./trackerUtils";
import { useTrackerToast } from "./useTrackerToast";

interface TrackerQuickAddProps {
  tracker: Tracker;
  /** Confirmed entries of this tracker for today. */
  todayEntries: TrackerEntry[];
}

/** "Done today" for a CHECK tracker, "Add" with a dialog for the others. */
const TrackerQuickAdd: React.FC<TrackerQuickAddProps> = ({ tracker, todayEntries }) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addEntry, { isLoading: adding }] = useAddTrackerEntryMutation();
  const [deleteEntry, { isLoading: deleting }] = useDeleteTrackerEntryMutation();

  if (tracker.kind !== "CHECK") {
    return (
      <>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          {t("trackers.actions.add")}
        </Button>
        <AddEntryDialog tracker={tracker} open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </>
    );
  }

  const done = todayEntries.length > 0;
  const toggle = async () => {
    try {
      if (done) {
        await Promise.all(todayEntries.map((entry) => deleteEntry(entry.id).unwrap()));
      } else {
        await addEntry({
          trackerId: tracker.id,
          body: { id: newNoteId(), date: localToday(), value: 1 },
        }).unwrap();
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <Button
      size="small"
      variant={done ? "contained" : "outlined"}
      color={done ? "success" : "primary"}
      startIcon={<CheckIcon />}
      aria-pressed={done}
      disabled={adding || deleting}
      onClick={() => void toggle()}
    >
      {t("trackers.actions.doneToday")}
    </Button>
  );
};

export default TrackerQuickAdd;
