import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAddTrackerEntryMutation, type Tracker } from "../../store/apis/trackersApi";
import { newNoteId } from "../notes/noteUtils";
import { localToday, parseAmount } from "./trackerUtils";
import { useTrackerToast } from "./useTrackerToast";

interface AddEntryDialogProps {
  tracker: Tracker;
  open: boolean;
  onClose: () => void;
}

/** Adds a value by hand. It counts at once, no review needed. */
const AddEntryDialog: React.FC<AddEntryDialogProps> = ({ tracker, open, onClose }) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const [addEntry, { isLoading }] = useAddTrackerEntryMutation();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(localToday);
  const [label, setLabel] = useState("");
  const amount = parseAmount(value);
  const today = localToday();

  const reset = () => {
    setValue("");
    setDate(localToday());
    setLabel("");
  };

  const close = () => {
    if (isLoading) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (amount === null || !date) return;
    try {
      await addEntry({
        trackerId: tracker.id,
        body: { id: newNoteId(), date, value: amount, label: label.trim() || null },
      }).unwrap();
      reset();
      onClose();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>{t("trackers.addEntry.title", { name: tracker.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("trackers.addEntry.value")}
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            error={value.trim() !== "" && amount === null}
            inputProps={{ inputMode: "decimal" }}
            InputProps={
              tracker.unit
                ? { endAdornment: <InputAdornment position="end">{tracker.unit}</InputAdornment> }
                : undefined
            }
          />
          <TextField
            type="date"
            label={t("trackers.addEntry.date")}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: today }}
          />
          <TextField
            label={t("trackers.addEntry.label")}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            inputProps={{ maxLength: 200 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={isLoading}>
          {t("trackers.actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={amount === null || !date || isLoading}
        >
          {t("trackers.actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddEntryDialog;
