import React, { useEffect, useState } from "react";
import { Box, Button, FormControlLabel, Paper, Switch, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useUpdateDailyReportSettingsMutation,
  type DailyReportStatus,
} from "../../store/apis/dailyReportApi";
import { useDailyReportToast } from "./useDailyReportToast";

interface DailyReportSettingsCardProps {
  status: DailyReportStatus;
}

/** Owners and admins turn the daily report on and set the reminder time. */
const DailyReportSettingsCard: React.FC<DailyReportSettingsCardProps> = ({ status }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useDailyReportToast();
  const [update, { isLoading }] = useUpdateDailyReportSettingsMutation();
  const [reminder, setReminder] = useState(status.reminderTime);

  useEffect(() => setReminder(status.reminderTime), [status.reminderTime]);

  const save = async (patch: { enabled?: boolean; reminderTime?: string }) => {
    try {
      await update(patch).unwrap();
      toast.show("success", t("dailyReport.settings.saved"));
    } catch (error) {
      toast.error(error, "dailyReport.settings.error", "dailyReport.settings");
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        {t("dailyReport.settings.title")}
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={status.enabled}
            disabled={isLoading}
            onChange={(event) => void save({ enabled: event.target.checked })}
          />
        }
        label={t("dailyReport.settings.enabled")}
      />
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 2, flexWrap: "wrap" }}>
        <TextField
          type="time"
          size="small"
          label={t("dailyReport.settings.reminder")}
          value={reminder}
          onChange={(event) => setReminder(event.target.value)}
          onBlur={() => {
            if (/^\d{2}:\d{2}$/.test(reminder) && reminder !== status.reminderTime) {
              void save({ reminderTime: reminder });
            }
          }}
          helperText={t("dailyReport.settings.reminderHelp")}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 260 }}
          disabled={isLoading}
        />
      </Box>
      <Button sx={{ mt: 1 }} onClick={() => navigate("/team-report")}>
        {t("dailyReport.settings.teamReport")}
      </Button>
    </Paper>
  );
};

export default DailyReportSettingsCard;
