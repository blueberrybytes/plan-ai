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
  Avatar,
  Tooltip,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  Slideshow as SlideshowIcon,
  Chat as ChatIcon,
  Folder as FolderIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  ArrowForward as ArrowForwardIcon,
  Assignment as AssignmentIcon,
  ListAlt as ListAltIcon,
  Description as DescriptionIcon,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";
import { useSelector } from "react-redux";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useListProjectsQuery,
  useListProjectTranscriptsQuery,
  useListProjectTasksQuery,
  type TaskResponse,
} from "../store/apis/projectApi";
import { useGetPresentationsQuery } from "../store/apis/slideApi";
import type { components } from "../types/api";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTranslation } from "react-i18next";
import { selectUser } from "../store/slices/auth/authSelector";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type TranscriptResponse = components["schemas"]["TranscriptResponse"];

const Home: React.FC = () => {
  const { t } = useTranslation();
  const user = useSelector(selectUser);

  const { data: sessionsData, isLoading: isProjectsLoading } = useListProjectsQuery({
    page: 1,
    pageSize: 5,
  });

  const { data: presentationsData, isLoading: isPresentationsLoading } = useGetPresentationsQuery();

  const projects: ProjectResponse[] = sessionsData?.data?.projects ?? [];
  const presentations = useMemo(() => presentationsData ?? [], [presentationsData]);

  const firstProjectId = projects[0]?.id;

  const { data: transcriptsData, isLoading: isTranscriptsLoading } = useListProjectTranscriptsQuery(
    firstProjectId ? { projectId: firstProjectId, params: { page: 1, pageSize: 5 } } : skipToken,
  );

  const transcripts: TranscriptResponse[] = transcriptsData?.data?.transcripts ?? [];

  const { data: tasksData, isLoading: isTasksLoading } = useListProjectTasksQuery(
    firstProjectId ? { projectId: firstProjectId, params: { page: 1, pageSize: 5 } } : skipToken,
  );

  const tasks: TaskResponse[] = useMemo(() => tasksData?.data?.tasks ?? [], [tasksData]);

  const openTaskCount = tasks.filter(
    (task) => task.status !== "COMPLETED" && task.status !== "ARCHIVED",
  ).length;

  const isLoadingAny =
    isProjectsLoading || isTranscriptsLoading || isTasksLoading || isPresentationsLoading;

  const topTasks = tasks.slice(0, 3);
  const recentTranscripts = transcripts.slice(0, 3);
  const recentPresentations = presentations.slice(0, 3);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greeting.morning");
    if (hour < 18) return t("home.greeting.afternoon");
    return t("home.greeting.evening");
  }, [t]);

  const firstName = user?.displayName?.split(" ")[0] ?? "";

  const quickActions = [
    {
      icon: <AddCircleOutlineIcon sx={{ fontSize: 28 }} />,
      title: t("home.quickActions.newSession.title"),
      description: t("home.quickActions.newSession.description"),
      to: "/projects?create=true",
      color: "#4361EE",
    },
    {
      icon: <SlideshowIcon sx={{ fontSize: 28 }} />,
      title: t("home.quickActions.createSlides.title"),
      description: t("home.quickActions.createSlides.description"),
      to: "/slides/create",
      color: "#a78bfa",
    },
    {
      icon: <ChatIcon sx={{ fontSize: 28 }} />,
      title: t("home.quickActions.chat.title"),
      description: t("home.quickActions.chat.description"),
      to: "/chat",
      color: "#10B981",
    },
    {
      icon: <FolderIcon sx={{ fontSize: 28 }} />,
      title: t("home.quickActions.contexts.title"),
      description: t("home.quickActions.contexts.description"),
      to: "/contexts",
      color: "#F59E0B",
    },
  ];

  const stats = [
    {
      label: t("home.stats.activeProjects.label"),
      value: isProjectsLoading ? null : (sessionsData?.data?.total ?? projects.length),
      cta: { label: t("home.stats.activeProjects.cta"), to: "/projects" },
      color: "#4361EE",
    },
    {
      label: t("home.stats.openTasks.label"),
      value: isTasksLoading ? null : openTaskCount,
      cta: firstProjectId
        ? { label: t("home.stats.openTasks.cta"), to: `/projects/${firstProjectId}` }
        : undefined,
      color: "#a78bfa",
    },
    {
      label: t("home.stats.presentations.label"),
      value: isPresentationsLoading ? null : presentations.length,
      cta: { label: t("home.stats.presentations.cta"), to: "/slides" },
      color: "#10B981",
    },
  ];

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 3, md: 5 }, bgcolor: "background.default", minHeight: "100vh" }}>
        {/* Header */}
        <Box sx={{ mb: 5 }}>
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("home.subheading")}
          </Typography>
        </Box>

        {/* Stats */}
        <Grid container spacing={3} sx={{ mb: 5 }}>
          {stats.map((stat) => (
            <Grid item xs={12} sm={4} key={stat.label}>
              <Card
                variant="outlined"
                sx={{
                  height: "100%",
                  borderColor: `${stat.color}25`,
                  bgcolor: `${stat.color}08`,
                  position: "relative",
                  overflow: "hidden",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "4px",
                    height: "100%",
                    background: stat.color,
                    borderRadius: "4px 0 0 4px",
                  },
                }}
              >
                <CardContent sx={{ pl: 3 }}>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ fontWeight: 600, fontSize: "0.7rem" }}
                  >
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h3"
                    sx={{ fontWeight: 800, my: 0.5, color: stat.color, lineHeight: 1 }}
                  >
                    {stat.value === null ? (
                      <CircularProgress size={24} sx={{ color: stat.color, mt: 0.5 }} />
                    ) : (
                      stat.value
                    )}
                  </Typography>
                  {stat.cta ? (
                    <Button
                      component={RouterLink}
                      to={stat.cta.to}
                      size="small"
                      endIcon={<ArrowForwardIcon fontSize="small" />}
                      sx={{ color: stat.color, mt: 0.5, p: 0, minWidth: 0 }}
                    >
                      {stat.cta.label}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Quick Actions */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          {t("home.quickActions.heading")}
        </Typography>
        <Grid container spacing={2} sx={{ mb: 5 }}>
          {quickActions.map((action) => (
            <Grid item xs={12} sm={6} md={3} key={action.to}>
              <Card
                component={RouterLink}
                to={action.to}
                variant="outlined"
                sx={{
                  display: "block",
                  textDecoration: "none",
                  height: "100%",
                  transition: "all 0.2s ease",
                  borderColor: "rgba(255,255,255,0.07)",
                  "&:hover": {
                    borderColor: `${action.color}50`,
                    transform: "translateY(-3px)",
                    boxShadow: `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${action.color}30`,
                  },
                }}
              >
                <CardContent>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "12px",
                      bgcolor: `${action.color}18`,
                      border: `1px solid ${action.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: action.color,
                      mb: 2,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, color: "#f1f5f9", mb: 0.5 }}
                  >
                    {action.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                    {action.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Activity: Transcripts + Tasks */}
        {(projects.length > 0 || isProjectsLoading) && (
          <>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
              {t("home.activity.heading")}
            </Typography>
            <Grid container spacing={3} sx={{ mb: 5 }}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {t("home.transcripts.title")}
                      </Typography>
                      {firstProjectId && (
                        <Button
                          component={RouterLink}
                          to={`/projects/${firstProjectId}/info#transcripts`}
                          size="small"
                          startIcon={<DescriptionIcon fontSize="small" />}
                        >
                          {t("home.transcripts.viewAll")}
                        </Button>
                      )}
                    </Stack>
                    <Divider sx={{ mb: 2 }} />
                    <Stack spacing={2}>
                      {isTranscriptsLoading ? (
                        <Typography color="text.secondary">
                          {t("home.transcripts.loading")}
                        </Typography>
                      ) : recentTranscripts.length === 0 ? (
                        <Typography color="text.secondary">
                          {t("home.transcripts.empty")}
                        </Typography>
                      ) : (
                        recentTranscripts.map((transcript) => (
                          <Stack
                            key={transcript.id}
                            direction="row"
                            spacing={2}
                            alignItems="center"
                          >
                            <Avatar
                              sx={{
                                bgcolor: "rgba(67,97,238,0.15)",
                                color: "#4361EE",
                                width: 36,
                                height: 36,
                              }}
                            >
                              <AssignmentIcon fontSize="small" />
                            </Avatar>
                            <Stack spacing={0.25} flexGrow={1}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                {transcript.title ?? t("home.transcripts.recorded")}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {transcript.recordedAt
                                  ? new Date(transcript.recordedAt).toLocaleString()
                                  : "—"}
                              </Typography>
                            </Stack>
                            {transcript.summary && (
                              <Tooltip title={transcript.summary} placement="left">
                                <Chip label={t("home.transcripts.summaryChip")} size="small" />
                              </Tooltip>
                            )}
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
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {t("home.tasks.title")}
                      </Typography>
                      {firstProjectId && (
                        <Button
                          component={RouterLink}
                          to={`/projects/${firstProjectId}`}
                          size="small"
                          startIcon={<ListAltIcon fontSize="small" />}
                        >
                          {t("home.tasks.openBoard")}
                        </Button>
                      )}
                    </Stack>
                    <Divider sx={{ mb: 2 }} />
                    <Stack spacing={1.5}>
                      {isTasksLoading ? (
                        <Typography color="text.secondary">{t("home.tasks.loading")}</Typography>
                      ) : topTasks.length === 0 ? (
                        <Typography color="text.secondary">{t("home.tasks.empty")}</Typography>
                      ) : (
                        topTasks.map((task) => (
                          <Box
                            key={task.id}
                            sx={{
                              p: 1.5,
                              borderRadius: "10px",
                              bgcolor: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.07)",
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ mb: 0.75 }}
                            >
                              <Chip label={task.status} size="small" sx={{ fontSize: "0.7rem" }} />
                              <Chip
                                label={task.priority}
                                size="small"
                                color="warning"
                                sx={{ fontSize: "0.7rem" }}
                              />
                            </Stack>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {task.title}
                            </Typography>
                          </Box>
                        ))
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}

        {/* Recent Presentations */}
        {(recentPresentations.length > 0 || isPresentationsLoading) && (
          <>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
              {t("home.presentations.heading")}
            </Typography>
            <Grid container spacing={2} sx={{ mb: 5 }}>
              {isPresentationsLoading ? (
                <Grid item xs={12}>
                  <Typography color="text.secondary">{t("home.presentations.loading")}</Typography>
                </Grid>
              ) : (
                recentPresentations.map((pres) => (
                  <Grid item xs={12} sm={6} md={4} key={pres.id}>
                    <Card
                      component={RouterLink}
                      to={`/slides/view/${pres.id}`}
                      variant="outlined"
                      sx={{
                        display: "block",
                        textDecoration: "none",
                        transition: "all 0.2s ease",
                        "&:hover": {
                          borderColor: "rgba(167,139,250,0.4)",
                          transform: "translateY(-2px)",
                        },
                      }}
                    >
                      <CardContent>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: "10px",
                              bgcolor: "rgba(167,139,250,0.15)",
                              border: "1px solid rgba(167,139,250,0.25)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#a78bfa",
                              flexShrink: 0,
                            }}
                          >
                            <SlideshowIcon fontSize="small" />
                          </Box>
                          <Stack spacing={0.25} flexGrow={1} minWidth={0}>
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 700, color: "#f1f5f9" }}
                              noWrap
                            >
                              {pres.title}
                            </Typography>
                            <Chip
                              label={pres.status}
                              size="small"
                              sx={{
                                fontSize: "0.65rem",
                                width: "fit-content",
                                bgcolor:
                                  pres.status === "COMPLETE"
                                    ? "rgba(16,185,129,0.15)"
                                    : "rgba(255,255,255,0.06)",
                                color: pres.status === "COMPLETE" ? "#10B981" : "text.secondary",
                                border: "none",
                              }}
                            />
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))
              )}
              {recentPresentations.length > 0 && (
                <Grid item xs={12}>
                  <Button
                    component={RouterLink}
                    to="/slides"
                    variant="outlined"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                  >
                    {t("home.presentations.viewAll")}
                  </Button>
                </Grid>
              )}
            </Grid>
          </>
        )}

        {/* Empty state */}
        {!isLoadingAny && projects.length === 0 && presentations.length === 0 && (
          <Card
            variant="outlined"
            sx={{
              borderStyle: "dashed",
              borderColor: "rgba(67,97,238,0.3)",
              bgcolor: "rgba(67,97,238,0.04)",
            }}
          >
            <CardContent>
              <Stack spacing={2} alignItems="flex-start">
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: "12px",
                    bgcolor: "rgba(67,97,238,0.12)",
                    color: "#4361EE",
                  }}
                >
                  <AutoAwesomeIcon sx={{ fontSize: 28 }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {t("home.emptyState.title")}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t("home.emptyState.description")}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    component={RouterLink}
                    to="/projects?create=true"
                    variant="contained"
                    startIcon={<AddCircleOutlineIcon />}
                  >
                    {t("home.emptyState.newSession")}
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/slides/create"
                    variant="outlined"
                    startIcon={<SlideshowIcon />}
                  >
                    {t("home.emptyState.createSlides")}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Home;
