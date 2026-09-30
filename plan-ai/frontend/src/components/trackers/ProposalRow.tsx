import React, { useState } from "react";
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import {
  Check as AcceptIcon,
  Close as RejectIcon,
  EditOutlined as EditIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerEntry } from "../../store/apis/trackersApi";
import FoodBreakdown from "./FoodBreakdown";
import { hidesKcal, kcalEstimate, parseAmount, readFoodDetails } from "./trackerUtils";
import { useTrackerFormat } from "./useTrackerFormat";

export interface ProposalRowProps {
  entry: TrackerEntry;
  tracker: Tracker | undefined;
  hideCalories: boolean;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSaveValue: (value: number) => void;
}

/** One proposed entry: what the AI read, with accept, edit and reject. */
const ProposalRow: React.FC<ProposalRowProps> = ({
  entry,
  tracker,
  hideCalories,
  busy,
  onAccept,
  onReject,
  onSaveValue,
}) => {
  const { t } = useTranslation();
  const { amount, day, number } = useTrackerFormat();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const kind = tracker?.kind ?? "NUMBER";
  const hideKcal = tracker ? hidesKcal(tracker, hideCalories) : false;
  const foods = kind === "CALORIES" ? readFoodDetails(entry.details) : null;
  const canEdit = kind !== "CHECK" && !hideKcal;

  const valueText = () => {
    if (hideKcal) return null;
    if (kind === "CALORIES") {
      const kcal = kcalEstimate(entry);
      return kcal.low !== null && kcal.high !== null
        ? t("trackers.kcal.aboutRange", {
            value: number(kcal.value, 0),
            low: number(kcal.low, 0),
            high: number(kcal.high, 0),
          })
        : t("trackers.kcal.about", { value: number(kcal.value, 0) });
    }
    return amount(entry.value, { kind, unit: tracker?.unit ?? null });
  };

  const startEdit = () => {
    setDraft(String(entry.value));
    setEditing(true);
  };

  const saveEdit = () => {
    const value = parseAmount(draft);
    if (value === null) return;
    setEditing(false);
    if (value !== entry.value) onSaveValue(value);
  };

  const value = valueText();

  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {tracker?.name ?? t("trackers.proposals.unknownTracker")}
          <Typography component="span" variant="body2" color="text.secondary">
            {` · ${day(entry.date)}`}
          </Typography>
        </Typography>
        {editing ? (
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
            <TextField
              size="small"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveEdit();
                if (event.key === "Escape") setEditing(false);
              }}
              error={parseAmount(draft) === null}
              inputProps={{ inputMode: "decimal", "aria-label": t("trackers.proposals.value") }}
              sx={{ width: 140 }}
            />
            <Typography variant="body2" color="text.secondary">
              {tracker?.unit ?? ""}
            </Typography>
            <IconButton size="small" aria-label={t("trackers.actions.save")} onClick={saveEdit}>
              <AcceptIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          value && <Typography variant="body2">{value}</Typography>
        )}
        {entry.label && (
          <Typography variant="body2" color="text.secondary">
            {entry.label}
          </Typography>
        )}
        {foods && <FoodBreakdown items={foods.items} hideKcal={hideKcal} />}
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={t("trackers.proposals.accept")}>
          <span>
            <IconButton
              size="small"
              color="success"
              aria-label={t("trackers.proposals.accept")}
              disabled={busy}
              onClick={onAccept}
            >
              <AcceptIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {canEdit && !editing && (
          <Tooltip title={t("trackers.proposals.edit")}>
            <span>
              <IconButton
                size="small"
                aria-label={t("trackers.proposals.edit")}
                disabled={busy}
                onClick={startEdit}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Tooltip title={t("trackers.proposals.reject")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("trackers.proposals.reject")}
              disabled={busy}
              onClick={onReject}
            >
              <RejectIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default ProposalRow;
