import React from "react";
import { MenuItem, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TrackerFormState } from "./trackerForm";

interface TrackerFormFieldsProps {
  form: TrackerFormState;
  /** Kind can only be chosen when the tracker is created. */
  creating: boolean;
  onChange: (patch: Partial<TrackerFormState>) => void;
}

const KINDS = ["NUMBER", "CHECK", "CALORIES"] as const;
const AGGREGATIONS = ["SUM", "LAST", "AVERAGE"] as const;
const GOALS = ["NONE", "AT_LEAST", "AT_MOST"] as const;
const PERIODS = ["DAY", "WEEK"] as const;

/** Name, kind, unit, how values add up, goal and notes for the AI. */
const TrackerFormFields: React.FC<TrackerFormFieldsProps> = ({ form, creating, onChange }) => {
  const { t } = useTranslation();

  return (
    <Stack spacing={2}>
      <TextField
        label={t("trackers.form.name")}
        value={form.name}
        onChange={(event) => onChange({ name: event.target.value })}
        inputProps={{ maxLength: 60 }}
        required
      />
      {creating && (
        <TextField
          select
          label={t("trackers.form.kind")}
          value={form.kind}
          onChange={(event) => onChange({ kind: event.target.value as TrackerFormState["kind"] })}
          helperText={t(`trackers.form.kindHelp.${form.kind}`)}
        >
          {KINDS.map((kind) => (
            <MenuItem key={kind} value={kind}>
              {t(`trackers.form.kinds.${kind}`)}
            </MenuItem>
          ))}
        </TextField>
      )}
      {form.kind === "NUMBER" && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={t("trackers.form.unit")}
            value={form.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            placeholder={t("trackers.form.unitPlaceholder")}
            inputProps={{ maxLength: 16 }}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            label={t("trackers.form.aggregation")}
            value={form.aggregation}
            onChange={(event) =>
              onChange({ aggregation: event.target.value as TrackerFormState["aggregation"] })
            }
            sx={{ flex: 2 }}
          >
            {AGGREGATIONS.map((aggregation) => (
              <MenuItem key={aggregation} value={aggregation}>
                {t(`trackers.form.aggregations.${aggregation}`)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          select
          label={t("trackers.form.goal")}
          value={form.goal}
          onChange={(event) => onChange({ goal: event.target.value as TrackerFormState["goal"] })}
          sx={{ flex: 1 }}
        >
          {GOALS.map((goal) => (
            <MenuItem key={goal} value={goal}>
              {t(`trackers.form.goals.${goal}`)}
            </MenuItem>
          ))}
        </TextField>
        {form.goal !== "NONE" && (
          <>
            <TextField
              label={
                form.kind === "CHECK" ? t("trackers.form.goalDays") : t("trackers.form.goalValue")
              }
              value={form.goalValue}
              onChange={(event) => onChange({ goalValue: event.target.value })}
              inputProps={{ inputMode: "decimal" }}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label={t("trackers.form.goalPeriod")}
              value={form.goalPeriod}
              onChange={(event) =>
                onChange({ goalPeriod: event.target.value as TrackerFormState["goalPeriod"] })
              }
              sx={{ flex: 1 }}
            >
              {PERIODS.map((period) => (
                <MenuItem key={period} value={period}>
                  {t(`trackers.form.periods.${period}`)}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </Stack>
      <TextField
        label={t("trackers.form.instructions")}
        value={form.instructions}
        onChange={(event) => onChange({ instructions: event.target.value })}
        helperText={t("trackers.form.instructionsHelp")}
        multiline
        minRows={2}
        inputProps={{ maxLength: 300 }}
      />
    </Stack>
  );
};

export default TrackerFormFields;
