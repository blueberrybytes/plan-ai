import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  Divider,
  Avatar,
  Tooltip,
} from "@mui/material";
import {
  Assignment,
  Timeline,
  AddCircleOutline,
  Description as DescriptionIcon,
  ListAlt as ListAltIcon,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useListSessionsQuery,
  useListSessionTranscriptsQuery,
  useListSessionTasksQuery,
  type TaskResponse,
} from "../store/apis/sessionApi";
import type { components } from "../types/api";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTranslation } from "react-i18next";

type SessionResponse = components["schemas"]["SessionResponse"];
type TranscriptResponse = components["schemas"]["TranscriptResponse"];

interface StatItem {
  label: string;
  value: number;
  trend?: string;
  cta?: { label: string; to: string };
}

const Home: React.FC = () => {
  const { t } = useTranslation();
  const { data: sessionsData, isLoading: isSessionsLoading } = useListSessionsQuery({
    page: 1,
    pageSize: 5,
  });

  const sessions: SessionResponse[] = sessionsData?.data?.sessions ?? [];

  const firstSessionId = sessions[0]?.id;

  const {
    data: transcriptsData,
    isLoading: isTranscriptsLoading,
    isError: isTranscriptsError,
  } = useListSessionTranscriptsQuery(
    firstSessionId ? { sessionId: firstSessionId, params: { page: 1, pageSize: 5 } } : skipToken,
  );

  const transcripts: TranscriptResponse[] = transcriptsData?.data?.transcripts ?? [];

  const {
    data: tasksData,
    isLoading: isTasksLoading,
    isError: isTasksError,
  } = useListSessionTasksQuery(
    firstSessionId ? { sessionId: firstSessionId, params: { page: 1, pageSize: 5 } } : skipToken,
  );

  const tasks: TaskResponse[] = useMemo(() => tasksData?.data?.tasks ?? [], [tasksData]);

  const isLoadingAny = isSessionsLoading || isTranscriptsLoading || isTasksLoading;
  const hasData = sessions.length > 0 || transcripts.length > 0 || tasks.length > 0;

  const stats: StatItem[] = useMemo(
    () => [
      {
        label: t("home.stats.activeSessions.label"),
        value: sessionsData?.data?.total ?? sessions.length,
        cta: { label: t("home.stats.activeSessions.cta"), to: "/sessions" },
      },
      {
        label: t("home.stats.transcriptsProcessed.label"),
        value: transcriptsData?.data?.total ?? transcripts.length,
        cta: firstSessionId
          ? {
              label: t("home.stats.transcriptsProcessed.cta"),
              to: `/sessions/${firstSessionId}/info#transcripts`,
            }
          : undefined,
      },
      {
        label: t("home.stats.openTasks.label"),
        value: tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "ARCHIVED")
          .length,
        cta: firstSessionId
          ? { label: t("home.stats.openTasks.cta"), to: `/sessions/${firstSessionId}` }
          : undefined,
      },
    ],
    [
      firstSessionId,
      sessions.length,
      sessionsData?.data?.total,
      t,
      tasks,
      transcripts.length,
      transcriptsData?.data?.total,
    ],
  );

  const topTasks = tasks.slice(0, 3);
  const recentTranscripts = transcripts.slice(0, 3);

  return (
    <SidebarLayout>
      <Box
        sx={{
          p: { xs: 3, md: 6 },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>
            {t("home.heading")}
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 640 }}>
            {t("home.subheading")}
          </Typography>
        </Stack>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat) => (
            <Grid item xs={12} sm={6} md={4} key={stat.label}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, my: 1 }}>
                    {isLoadingAny ? "--" : stat.value}
                  </Typography>
                  {stat.cta ? (
                    <Button
                      component={RouterLink}
                      to={stat.cta.to}
                      size="small"
                      endIcon={<Timeline fontSize="small" />}
                    >
                      {stat.cta.label}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {!hasData && !isLoadingAny ? (
          <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
            <CardContent>
              <Stack spacing={2} alignItems="flex-start">
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {t("home.emptyState.title")}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t("home.emptyState.description")}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    component={RouterLink}
                    to="/sessions/new"
                    variant="contained"
                    startIcon={<AddCircleOutline />}
                  >
                    {t("home.emptyState.newSession")}
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/sessions"
                    variant="outlined"
                    startIcon={<DescriptionIcon />}
                  >
                    {t("home.emptyState.browseSessions")}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {t("home.transcripts.title")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("home.transcripts.subtitle", {
                          session: sessions[0]?.title ?? t("home.fallbackSessionTitle"),
                        })}
                      </Typography>
                    </Stack>
                    {firstSessionId ? (
                      <Button
                        component={RouterLink}
                        to={`/sessions/${firstSessionId}/info#transcripts`}
                        size="small"
                        startIcon={<DescriptionIcon fontSize="small" />}
                      >
                        {t("home.transcripts.viewAll")}
                      </Button>
                    ) : null}
                  </Stack>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={2}>
                    {isTranscriptsError ? (
                      <Typography color="error">{t("home.transcripts.error")}</Typography>
                    ) : isTranscriptsLoading ? (
                      <Typography color="text.secondary">
                        {t("home.transcripts.loading")}
                      </Typography>
                    ) : recentTranscripts.length === 0 ? (
                      <Typography color="text.secondary">{t("home.transcripts.empty")}</Typography>
                    ) : (
                      recentTranscripts.map((transcript) => (
                        <Stack key={transcript.id} direction="row" spacing={2} alignItems="center">
                          <Avatar
                            sx={{
                              bgcolor: "primary.light",
                              color: "primary.dark",
                            }}
                          >
                            <Assignment fontSize="small" />
                          </Avatar>
                          <Stack spacing={0.5} flexGrow={1}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {transcript.title ?? t("home.transcripts.recorded")}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {t("home.transcripts.recorded")}{" "}
                              {transcript.recordedAt
                                ? new Date(transcript.recordedAt).toLocaleString()
                                : "—"}
                            </Typography>
                          </Stack>
                          {transcript.summary ? (
                            <Tooltip title={transcript.summary} placement="left">
                              <Chip label={t("home.transcripts.summaryChip")} size="small" />
                            </Tooltip>
                          ) : null}
                        </Stack>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {t("home.tasks.title")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("home.tasks.subtitle", {
                          session: sessions[0]?.title ?? t("home.fallbackSessionTitle"),
                        })}
                      </Typography>
                    </Stack>
                    {firstSessionId ? (
                      <Button
                        component={RouterLink}
                        to={`/sessions/${firstSessionId}`}
                        size="small"
                        startIcon={<ListAltIcon fontSize="small" />}
                      >
                        {t("home.tasks.openBoard")}
                      </Button>
                    ) : null}
                  </Stack>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={2}>
                    {isTasksError ? (
                      <Typography color="error">{t("home.tasks.error")}</Typography>
                    ) : isTasksLoading ? (
                      <Typography color="text.secondary">{t("home.tasks.loading")}</Typography>
                    ) : topTasks.length === 0 ? (
                      <Typography color="text.secondary">{t("home.tasks.empty")}</Typography>
                    ) : (
                      topTasks.map((task) => (
                        <Card key={task.id} variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ p: 2 }}>
                            <Stack spacing={1.5}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip label={task.status} size="small" />
                                <Chip label={task.priority} size="small" color="warning" />
                              </Stack>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {task.title}
                              </Typography>
                              {task.description ? (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ whiteSpace: "pre-wrap" }}
                                >
                                  {task.description}
                                </Typography>
                              ) : null}
                              <Typography variant="caption" color="text.secondary">
                                {t("home.tasks.updated", {
                                  timestamp: new Date(task.updatedAt).toLocaleString(),
                                })}
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Home;
