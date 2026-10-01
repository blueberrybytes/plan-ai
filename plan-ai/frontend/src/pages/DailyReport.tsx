import React from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import DailyReportConsentCard from "../components/dailyReport/DailyReportConsentCard";
import DailyReportEditor from "../components/dailyReport/DailyReportEditor";
import DailyReportSettingsCard from "../components/dailyReport/DailyReportSettingsCard";
import TaskProposalList from "../components/dailyReport/TaskProposalList";
import { useDailyReportToast } from "../components/dailyReport/useDailyReportToast";
import {
  useGetDailyReportStatusQuery,
  useListDailyReportProposalsQuery,
  useSetDailyReportConsentMutation,
} from "../store/apis/dailyReportApi";

/** The member's daily report: today's text and the task changes waiting. */
const DailyReport: React.FC = () => {
  const { t } = useTranslation();
  const toast = useDailyReportToast();
  const { data: status, isLoading, isError } = useGetDailyReportStatusQuery();
  const ready = !!status?.enabled && !status.needsConsent;
  const { data: proposals = [] } = useListDailyReportProposalsQuery(
    { status: "PROPOSED" },
    { skip: !ready },
  );
  const [setConsent, { isLoading: consentBusy }] = useSetDailyReportConsentMutation();

  const accept = async () => {
    try {
      await setConsent(true).unwrap();
    } catch (error) {
      toast.error(error, "dailyReport.loadError", "dailyReport.consent");
    }
  };

  const withdraw = async () => {
    if (!window.confirm(t("dailyReport.consent.withdrawConfirm"))) return;
    try {
      await setConsent(false).unwrap();
      toast.show("info", t("dailyReport.consent.withdrawn"));
    } catch (error) {
      toast.error(error, "dailyReport.loadError", "dailyReport.consent");
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }
    if (isError || !status) return <Alert severity="error">{t("dailyReport.loadError")}</Alert>;
    if (!status.available) {
      return (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("dailyReport.personal.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("dailyReport.personal.body")}
          </Typography>
        </Paper>
      );
    }
    if (!status.enabled) {
      return (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("dailyReport.off.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(status.canManage ? "dailyReport.off.bodyManager" : "dailyReport.off.body")}
            </Typography>
          </Paper>
          {status.canManage && <DailyReportSettingsCard status={status} />}
        </Stack>
      );
    }
    if (status.needsConsent) {
      return <DailyReportConsentCard busy={consentBusy} onAccept={() => void accept()} />;
    }
    return (
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" },
          alignItems: "start",
        }}
      >
        <Stack spacing={2}>
          <DailyReportEditor />
          <TaskProposalList proposals={proposals} />
        </Stack>
        <Stack spacing={2}>
          {status.canManage && <DailyReportSettingsCard status={status} />}
          <Box>
            <Button size="small" color="inherit" onClick={() => void withdraw()}>
              {t("dailyReport.consent.withdrawAction")}
            </Button>
          </Box>
        </Stack>
      </Box>
    );
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto", width: "100%" }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {t("dailyReport.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t("dailyReport.subtitle")}
        </Typography>
        {renderContent()}
      </Box>
    </SidebarLayout>
  );
};

export default DailyReport;
