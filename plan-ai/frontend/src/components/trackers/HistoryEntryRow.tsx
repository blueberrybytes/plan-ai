import React, { useState } from "react";
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import {
  Check as SaveIcon,
  Close as CancelIcon,
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerEntry, UpdateEntryRequest } from "../../store/apis/trackersApi";
import FoodBreakdown from "./FoodBreakdown";
import { localToday, parseAmount, readFoodDetails } from "./trackerUtils";
import { useTrackerFormat } from "./useTrackerFormat";

interface HistoryEntryRowProps {
  entry: TrackerEntry;
  tracker: Tracker;
  hideNumbers: boolean;
  busy: boolean;
  onSave: (patch: UpdateEntryRequest) => void;
  onDelete: () => void;
}

/** One confirmed entry, with edit (value and day) and delete. */
const HistoryEntryRow: React.FC<HistoryEntryRowProps> = ({
  entry,
  tracker,
  hideNumbers,
  busy,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { amount, day } = useTrackerFormat();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(entry.date);
  const editValue = tracker.kind !== "CHECK" && !hideNumbers;
  const parsed = parseAmount(value);
  const foods = tracker.kind === "CALORIES" ? readFoodDetails(entry.details) : null;

  const start = () => {
    setValue(String(entry.value));
    setDate(entry.date);
    setEditing(true);
  };

  const save = () => {
    const patch: UpdateEntryRequest = {};
    if (date && date !== entry.date) patch.date = date;
    if (editValue && parsed !== null && parsed !== entry.value) patch.value = parsed;
    setEditing(false);
    if (Object.keys(patch).length > 0) onSave(patch);
  };

  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <TextField
              type="date"
              size="small"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              inputProps={{ max: localToday(), "aria-label": t("trackers.addEntry.date") }}
            />
            {editValue && (
              <TextField
                size="small"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                error={parsed === null}
                inputProps={{ inputMode: "decimal", "aria-label": t("trackers.addEntry.value") }}
                sx={{ width: 120 }}
              />
            )}
          </Stack>
        ) : (
          <Typography variant="body2">
            <strong>{day(entry.date)}</strong>
            {!hideNumbers && ` · ${amount(entry.value, tracker)}`}
          </Typography>
        )}
        {entry.label && (
          <Typography variant="body2" color="text.secondary">
            {entry.label}
          </Typography>
        )}
        {foods && !editing && <FoodBreakdown items={foods.items} hideKcal={hideNumbers} />}
      </Box>
      {editing ? (
        <Stack direction="row" spacing={0.5}>
          <IconButton
            size="small"
            aria-label={t("trackers.actions.save")}
            onClick={save}
            disabled={editValue && parsed === null}
          >
            <SaveIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={t("trackers.actions.cancel")}
            onClick={() => setEditing(false)}
          >
            <CancelIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={t("trackers.history.edit")}>
            <span>
              <IconButton
                size="small"
                aria-label={t("trackers.history.edit")}
                onClick={start}
                disabled={busy}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("trackers.history.delete")}>
            <span>
              <IconButton
                size="small"
                aria-label={t("trackers.history.delete")}
                onClick={onDelete}
                disabled={busy}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
};

export default HistoryEntryRow;
