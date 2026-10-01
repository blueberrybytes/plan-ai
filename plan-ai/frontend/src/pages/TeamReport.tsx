import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutoAwesome as SummaryIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
} from "@mui/icons-material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import SidebarLayout from "../components/layout/SidebarLayout";
import TeamMemberCard from "../components/dailyReport/TeamMemberCard";
import { useDailyReportToast } from "../components/dailyReport/useDailyReportToast";
import { localDateKey, parseDateKey } from "../components/notes/noteUtils";
import {
  useGetTeamReportQuery,
  useLazyGetTeamReportQuery,
  type TeamReport as TeamReportData,
} from "../store/apis/dailyReportApi";

const shiftWeek = (key: string, weeks: number): string => {
  const date = parseDateKey(key) ?? new Date();
  date.setDate(date.getDate() + weeks * 7);
  return localDateKey(date);
};

const hasActivity = (m: TeamReportData["members"][number]) =>
  m.completedCount > 0 || m.inProgressCount > 0 || m.blocked.length > 0 || m.overdueCount > 0;

/** The team's week for owners and admins, built from tasks. */
const TeamReport: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useDailyReportToast();
  const [params, setParams] = useSearchParams();
  const week = params.get("week") ?? undefined;
  const { data, isFetching, isError, error } = useGetTeamReportQuery(week ? { week } : {});
  const [summarize, { isFetching: summarizing }] = useLazyGetTeamReportQuery();
  // The summaries are kept for the week they were written for.
  const [withSummary, setWithSummary] = useState<TeamReportData | null>(null);

  const report = withSummary && withSummary.weekStart === data?.weekStart ? withSummary : data;
  const locale = i18n.language.startsWith("es") ? es : enUS;
  const day = (key: string) => {
    const date = parseDateKey(key);
    return date ? format(date, "d MMM", { locale }) : key;
  };

  const goTo = (weeks: number) => {
    if (!report) return;
    setParams({ week: shiftWeek(report.weekStart, weeks) });
  };

  const writeSummaries = async () => {
    if (!report) return;
    try {
      const result = await summarize({
        week: report.weekStart,
        summary: true,
        language: i18n.language,
      }).unwrap();
      setWithSummary(result);
    } catch (cause) {
      toast.error(cause, "teamReport.summaryError", "teamReport.summary");
    }
  };

  const renderContent = () => {
    if (isError) {
      const status = (error as { status?: unknown })?.status;
      return (
        <Alert severity={status === 403 ? "info" : "error"}>
          {t(status === 403 ? "teamReport.forbidden" : "teamReport.loadError")}
        </Alert>
      );
    }
    if (!report) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }
    const active = report.members.filter(hasActivity);
    const quiet = report.members.length - active.length;
    return (
      <Stack spacing={2}>
        {!report.dailyReportEnabled && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" onClick={() => navigate("/daily-report")}>
                {t("teamReport.settings")}
              </Button>
            }
          >
            {t("teamReport.dailyReportOff")}
          </Alert>
        )}
        {active.length === 0 ? (
          <Typography color="text.secondary">{t("teamReport.empty")}</Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              opacity: isFetching ? 0.6 : 1,
            }}
          >
            {active.map((member) => (
              <TeamMemberCard key={member.userId} member={member} />
            ))}
          </Box>
        )}
        {quiet > 0 && active.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {t("teamReport.quiet", { count: quiet })}
          </Typography>
        )}
      </Stack>
    );
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto", width: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 3 }}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {t("teamReport.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("teamReport.subtitle")}
            </Typography>
          </Box>
          {report && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Tooltip title={t("teamReport.previous")}>
                <IconButton onClick={() => goTo(-1)} aria-label={t("teamReport.previous")}>
                  <PrevIcon />
                </IconButton>
              </Tooltip>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, minWidth: 130, textAlign: "center" }}
              >
                {t("teamReport.week", { start: day(report.weekStart), end: day(report.weekEnd) })}
              </Typography>
              <Tooltip title={t("teamReport.next")}>
                <IconButton onClick={() => goTo(1)} aria-label={t("teamReport.next")}>
                  <NextIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={summarizing ? <CircularProgress size={16} /> : <SummaryIcon />}
                onClick={() => void writeSummaries()}
                disabled={summarizing || !report.members.some(hasActivity)}
              >
                {summarizing ? t("teamReport.summarizing") : t("teamReport.summarize")}
              </Button>
            </Stack>
          )}
        </Box>
        {renderContent()}
      </Box>
    </SidebarLayout>
  );
};

export default TeamReport;
