import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useDeleteTrackerEntryMutation,
  useListTrackerEntriesQuery,
  useUpdateTrackerEntryMutation,
  type Tracker,
  type UpdateEntryRequest,
} from "../../store/apis/trackersApi";
import HistoryEntryRow from "./HistoryEntryRow";
import { hidesKcal } from "./trackerUtils";
import { useTrackerToast } from "./useTrackerToast";

interface TrackerHistoryDialogProps {
  tracker: Tracker | null;
  hideCalories: boolean;
  onClose: () => void;
}

/** The confirmed entries of one tracker, newest first. */
const TrackerHistoryDialog: React.FC<TrackerHistoryDialogProps> = ({
  tracker,
  hideCalories,
  onClose,
}) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const { data: entries = [], isLoading } = useListTrackerEntriesQuery(
    { trackerId: tracker?.id ?? "", status: "CONFIRMED" },
    { skip: !tracker },
  );
  const [updateEntry] = useUpdateTrackerEntryMutation();
  const [deleteEntry] = useDeleteTrackerEntryMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusyId(null);
    }
  };

  const hideNumbers = tracker ? hidesKcal(tracker, hideCalories) : false;

  return (
    <Dialog open={Boolean(tracker)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("trackers.history.title", { name: tracker?.name ?? "" })}</DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("trackers.history.empty")}
          </Typography>
        ) : (
          tracker &&
          entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 && <Divider />}
              <HistoryEntryRow
                entry={entry}
                tracker={tracker}
                hideNumbers={hideNumbers}
                busy={busyId === entry.id}
                onSave={(patch: UpdateEntryRequest) =>
                  void run(entry.id, () => updateEntry({ id: entry.id, patch }).unwrap())
                }
                onDelete={() => void run(entry.id, () => deleteEntry(entry.id).unwrap())}
              />
            </React.Fragment>
          ))
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("trackers.actions.close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TrackerHistoryDialog;
