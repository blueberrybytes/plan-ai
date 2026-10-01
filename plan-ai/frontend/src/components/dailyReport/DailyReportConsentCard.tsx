import React from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface DailyReportConsentCardProps {
  busy: boolean;
  onAccept: () => void;
}

/** What the daily report does and who sees what, accepted once per member. */
const DailyReportConsentCard: React.FC<DailyReportConsentCardProps> = ({ busy, onAccept }) => {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, maxWidth: 720 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        {t("dailyReport.consent.title")}
      </Typography>
      <Stack spacing={1.5}>
        <Typography variant="body2">{t("dailyReport.consent.what")}</Typography>
        <Typography variant="body2">{t("dailyReport.consent.who")}</Typography>
        <Typography variant="body2">{t("dailyReport.consent.notRecorded")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("dailyReport.consent.withdraw")}
        </Typography>
      </Stack>
      <Box sx={{ mt: 3 }}>
        <Button variant="contained" onClick={onAccept} disabled={busy}>
          {t("dailyReport.consent.accept")}
        </Button>
      </Box>
    </Paper>
  );
};

export default DailyReportConsentCard;
