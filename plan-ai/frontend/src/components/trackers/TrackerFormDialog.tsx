import React, { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useCreateTrackerMutation,
  useDeleteTrackerMutation,
  useUpdateTrackerMutation,
  type Tracker,
} from "../../store/apis/trackersApi";
import ConfirmDeletionDialog from "../dialogs/ConfirmDeletionDialog";
import TrackerFormFields from "./TrackerFormFields";
import TrackerPresetPicker from "./TrackerPresetPicker";
import {
  formFromPreset,
  formFromTracker,
  formProblem,
  formToInput,
  type TrackerFormState,
} from "./trackerForm";
import { TRACKER_PRESETS, type TrackerPreset, type TrackerPresetId } from "./trackerPresets";
import { useTrackerToast } from "./useTrackerToast";

interface TrackerFormDialogProps {
  open: boolean;
  /** The tracker to edit. Left out to create one. */
  tracker?: Tracker | null;
  /** The preset the create form starts from. */
  initialPreset?: TrackerPresetId;
  onClose: () => void;
}

/** Creates or edits a tracker. Mount it with a key so it starts fresh. */
const TrackerFormDialog: React.FC<TrackerFormDialogProps> = ({
  open,
  tracker,
  initialPreset = "custom",
  onClose,
}) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const creating = !tracker;
  const presetName = (preset: TrackerPreset) => (preset.id === "custom" ? "" : t(preset.labelKey));
  const startPreset = TRACKER_PRESETS.find((p) => p.id === initialPreset) ?? TRACKER_PRESETS[0];

  const [presetId, setPresetId] = useState<TrackerPresetId>(startPreset.id);
  const [form, setForm] = useState<TrackerFormState>(() =>
    tracker ? formFromTracker(tracker) : formFromPreset(startPreset, presetName(startPreset)),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createTracker, { isLoading: creatingNow }] = useCreateTrackerMutation();
  const [updateTracker, { isLoading: updating }] = useUpdateTrackerMutation();
  const [deleteTracker, { isLoading: deleting }] = useDeleteTrackerMutation();
  const busy = creatingNow || updating || deleting;
  const problem = formProblem(form);

  const pickPreset = (preset: TrackerPreset) => {
    setPresetId(preset.id);
    setForm(formFromPreset(preset, presetName(preset)));
  };

  const save = async () => {
    if (problem) return;
    try {
      const input = formToInput(form, creating);
      if (tracker) await updateTracker({ id: tracker.id, patch: input }).unwrap();
      else await createTracker(input).unwrap();
      onClose();
    } catch (error) {
      toast.error(error);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (!tracker) return;
    try {
      await updateTracker({ id: tracker.id, patch: { archived } }).unwrap();
      toast.success(archived ? "trackers.toast.archived" : "trackers.toast.restored");
      onClose();
    } catch (error) {
      toast.error(error);
    }
  };

  const remove = async () => {
    if (!tracker) return;
    try {
      await deleteTracker(tracker.id).unwrap();
      toast.success("trackers.toast.deleted");
      setConfirmDelete(false);
      onClose();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t(creating ? "trackers.form.createTitle" : "trackers.form.editTitle")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {creating && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 1 }}
                >
                  {t("trackers.form.presets")}
                </Typography>
                <TrackerPresetPicker selected={presetId} onPick={pickPreset} />
              </Box>
            )}
            <TrackerFormFields
              form={form}
              creating={creating}
              onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
            />
            {problem && form.name.trim() && (
              <Typography variant="caption" color="error">
                {t(problem)}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {tracker && (
            <>
              <Button color="error" onClick={() => setConfirmDelete(true)} disabled={busy}>
                {t("trackers.actions.delete")}
              </Button>
              <Button onClick={() => void setArchived(!tracker.archived)} disabled={busy}>
                {t(tracker.archived ? "trackers.actions.restore" : "trackers.actions.archive")}
              </Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} disabled={busy}>
            {t("trackers.actions.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={Boolean(problem) || busy}
          >
            {t(creating ? "trackers.actions.create" : "trackers.actions.save")}
          </Button>
        </DialogActions>
      </Dialog>
      {tracker && (
        <ConfirmDeletionDialog
          open={confirmDelete}
          title={t("trackers.form.deleteTitle")}
          entityName={tracker.name}
          description={t("trackers.form.deleteBody")}
          additionalWarning={t("trackers.form.deleteHint")}
          confirmLabel={t("trackers.actions.delete")}
          cancelLabel={t("trackers.actions.cancel")}
          isProcessing={deleting}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
};

export default TrackerFormDialog;
