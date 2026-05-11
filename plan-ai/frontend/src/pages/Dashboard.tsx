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
  Divider,
  CircularProgress,
  alpha,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  Slideshow as SlideshowIcon,
  Chat as ChatIcon,
  Folder as FolderIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  ArrowForward as ArrowForwardIcon,
  ListAlt as ListAltIcon,
  Schema as SchemaIcon,
  Article as ArticleIcon,
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
import { useGetUserDiagramsQuery } from "../store/apis/diagramApi";
import { useGetDocsQuery } from "../store/apis/docApi";
import { useListContextsQuery } from "../store/apis/contextApi";
import type { components } from "../types/api";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTranslation } from "react-i18next";
import { selectUser } from "../store/slices/auth/authSelector";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type TranscriptResponse = components["schemas"]["TranscriptResponse"];

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const user = useSelector(selectUser);

  const { data: sessionsData, isLoading: isProjectsLoading } = useListProjectsQuery(
    { page: 1, pageSize: 5 },
    { refetchOnFocus: true },
  );

  const { data: presentationsData, isLoading: isPresentationsLoading } = useGetPresentationsQuery(
    undefined,
    { refetchOnFocus: true },
  );
  const presentations = useMemo(() => presentationsData ?? [], [presentationsData]);

  const { data: diagramsData, isLoading: isDiagramsLoading } = useGetUserDiagramsQuery(undefined, {
    refetchOnFocus: true,
  });
  const diagrams = useMemo(() => diagramsData?.diagrams ?? [], [diagramsData]);

  const { data: docsData, isLoading: isDocsLoading } = useGetDocsQuery(undefined, {
    refetchOnFocus: true,
  });
  const docs = useMemo(() => docsData ?? [], [docsData]);

  const { data: contextsData, isLoading: isContextsLoading } = useListContextsQuery(undefined, {
    refetchOnFocus: true,
  });
  const contexts = useMemo(() => contextsData?.data?.contexts ?? [], [contextsData]);

  const projects: ProjectResponse[] = sessionsData?.data?.projects ?? [];
  const firstProjectId = projects[0]?.id;

  const { data: transcriptsData, isLoading: isTranscriptsLoading } = useListProjectTranscriptsQuery(
    firstProjectId ? { projectId: firstProjectId, params: { page: 1, pageSize: 5 } } : skipToken,
    { refetchOnFocus: true },
  );
  const transcripts: TranscriptResponse[] = transcriptsData?.data?.transcripts ?? [];

  const { data: tasksData, isLoading: isTasksLoading } = useListProjectTasksQuery(
    firstProjectId ? { projectId: firstProjectId, params: { page: 1, pageSize: 5 } } : skipToken,
    { refetchOnFocus: true },
  );
  const tasks: TaskResponse[] = useMemo(() => tasksData?.data?.tasks ?? [], [tasksData]);

  const openTaskCount = tasks.filter(
    (task) => task.status !== "COMPLETED" && task.status !== "ARCHIVED",
  ).length;

  const isLoadingAny =
    isProjectsLoading ||
    isTranscriptsLoading ||
    isTasksLoading ||
    isPresentationsLoading ||
    isDiagramsLoading ||
    isDocsLoading ||
    isContextsLoading;

  const topTasks = tasks.slice(0, 3);
  const recentTranscripts = transcripts.slice(0, 3);
  const recentPresentations = presentations.slice(0, 3);
  const recentDiagrams = diagrams.slice(0, 3);
  const recentDocs = docs.slice(0, 3);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greeting.morning");
    if (hour < 18) return t("home.greeting.afternoon");
    return t("home.greeting.evening");
  }, [t]);

  const firstName = user?.displayName?.split(" ")[0] ?? "";

  const quickActions = [
    {
      icon: <AddCircleOutlineIcon sx={{ fontSize: 32 }} />,
      title: t("home.quickActions.newSession.title"),
      description: t("home.quickActions.newSession.description"),
      to: "/projects?create=true",
      color: "#4361EE",
    },
    {
      icon: <ArticleIcon sx={{ fontSize: 32 }} />,
      title: "Create Document",
      description: "Generate polished docs from any context.",
      to: "/docs/create",
      color: "#0ea5e9",
    },
    {
      icon: <SlideshowIcon sx={{ fontSize: 32 }} />,
      title: t("home.quickActions.createSlides.title"),
      description: t("home.quickActions.createSlides.description"),
      to: "/slides/create",
      color: "#a78bfa",
    },
    {
      icon: <SchemaIcon sx={{ fontSize: 32 }} />,
      title: t("home.quickActions.createDiagram.title"),
      description: t("home.quickActions.createDiagram.description"),
      to: "/diagrams/create",
      color: "#EC4899",
    },
    {
      icon: <ChatIcon sx={{ fontSize: 32 }} />,
      title: t("home.quickActions.chat.title"),
      description: t("home.quickActions.chat.description"),
      to: "/chat",
      color: "#10B981",
    },
    {
      icon: <FolderIcon sx={{ fontSize: 32 }} />,
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
      color: "#4361EE",
      to: "/projects",
    },
    {
      label: t("home.stats.openTasks.label"),
      value: isTasksLoading ? null : openTaskCount,
      color: "#a78bfa",
      to: firstProjectId ? `/projects/${firstProjectId}` : "/projects",
    },
    {
      label: "Active Contexts", // fallback until translation added later if missing
      value: isContextsLoading ? null : contexts.length,
      color: "#F59E0B",
      to: "/contexts",
    },
    {
      label: t("home.stats.activeDocuments.label"),
      value: isDocsLoading ? null : docs.length,
      color: "#0ea5e9",
      to: "/docs",
    },
    {
      label: t("home.stats.presentations.label"),
      value: isPresentationsLoading ? null : presentations.length,
      color: "#10B981",
      to: "/slides",
    },
    {
      label: t("home.stats.activeDiagrams.label"),
      value: isDiagramsLoading ? null : diagrams.length,
      color: "#EC4899",
      to: "/diagrams",
    },
  ];

  return (
    <SidebarLayout>
      <Box
        sx={{
          p: { xs: 3, md: 6 },
          bgcolor: "background.default",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        {/* Background glow effects for premium feel */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 300,
            background:
              "radial-gradient(ellipse at 50% -50%, rgba(67,97,238,0.1) 0%, rgba(0,0,0,0) 80%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Header */}
        <Box
          sx={{ mb: 6, position: "relative", zIndex: 1, textAlign: { xs: "center", md: "left" } }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: 1,
              letterSpacing: "-0.02em",
              background: "linear-gradient(90deg, #4361EE 0%, #a78bfa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, maxWidth: 600 }}>
            {t("home.subheading")}
          </Typography>
        </Box>

        {/* Quick Actions (Premium Glassmorphism Style) */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, position: "relative", zIndex: 1 }}>
          {t("home.quickActions.heading")}
        </Typography>
        <Grid container spacing={3} sx={{ mb: 6, position: "relative", zIndex: 1 }}>
          {quickActions.map((action) => (
            <Grid item xs={12} sm={6} md={4} key={action.to}>
              <Card
                component={RouterLink}
                to={action.to}
                elevation={0}
                sx={{
                  display: "block",
                  textDecoration: "none",
                  height: "100%",
                  bgcolor: alpha(action.color, 0.05),
                  border: `1px solid ${alpha(action.color, 0.1)}`,
                  borderRadius: 4,
                  backdropFilter: "blur(10px)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    bgcolor: alpha(action.color, 0.1),
                    borderColor: alpha(action.color, 0.3),
                    transform: "translateY(-4px)",
                    boxShadow: `0 12px 30px ${alpha(action.color, 0.15)}, 0 4px 10px ${alpha(action.color, 0.1)}`,
                  },
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: "16px",
                      bgcolor: alpha(action.color, 0.15),
                      mb: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: action.color,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary", mb: 1 }}>
                    {action.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {action.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Global Pipeline Stats */}
        <Grid container spacing={2} sx={{ mb: 6, position: "relative", zIndex: 1 }}>
          {stats.map((stat) => (
            <Grid item xs={6} sm={4} md={2} key={stat.label}>
              <Box
                component={RouterLink}
                to={stat.to}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  p: 2,
                  bgcolor: "background.paper",
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                  "&:hover": { borderColor: alpha(stat.color, 0.5), transform: "scale(1.02)" },
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    mb: 1,
                  }}
                >
                  {stat.label}
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ fontWeight: 800, color: stat.color, display: "flex", alignItems: "center" }}
                >
                  {stat.value === null ? (
                    <CircularProgress size={24} sx={{ color: stat.color }} />
                  ) : (
                    stat.value
                  )}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={4} sx={{ position: "relative", zIndex: 1 }}>
          {/* Left Column: Artifacts */}
          <Grid item xs={12} lg={8}>
            <Stack spacing={4}>
              {/* Documents */}
              {(recentDocs.length > 0 || isDocsLoading) && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {t("home.documents.heading")}
                    </Typography>
                    <Button
                      component={RouterLink}
                      to="/docs"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                    >
                      {t("home.documents.viewAll")}
                    </Button>
                  </Stack>
                  <Grid container spacing={2}>
                    {isDocsLoading && (
                      <Grid item xs={12}>
                        <Typography color="text.secondary">
                          {t("home.documents.loading")}
                        </Typography>
                      </Grid>
                    )}
                    {recentDocs.map((doc) => (
                      <Grid item xs={12} sm={4} key={doc.id}>
                        <Card
                          component={RouterLink}
                          to={`/docs/view/${doc.id}`}
                          variant="outlined"
                          sx={{
                            display: "block",
                            textDecoration: "none",
                            transition: "all 0.2s",
                            borderRadius: 2,
                            "&:hover": {
                              borderColor: alpha("#0ea5e9", 0.4),
                              transform: "translateY(-2px)",
                            },
                          }}
                        >
                          <CardContent sx={{ p: 2, pb: "16px !important" }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  bgcolor: alpha("#0ea5e9", 0.1),
                                  color: "#0ea5e9",
                                }}
                              >
                                <ArticleIcon fontSize="small" />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                                  {doc.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {new Date(doc.createdAt).toLocaleDateString()}
                                </Typography>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

              {/* Diagrams */}
              {(recentDiagrams.length > 0 || isDiagramsLoading) && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {t("home.diagrams.heading")}
                    </Typography>
                    <Button
                      component={RouterLink}
                      to="/diagrams"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                    >
                      {t("home.diagrams.viewAll")}
                    </Button>
                  </Stack>
                  <Grid container spacing={2}>
                    {isDiagramsLoading && (
                      <Grid item xs={12}>
                        <Typography color="text.secondary">{t("home.diagrams.loading")}</Typography>
                      </Grid>
                    )}
                    {recentDiagrams.map((diag) => (
                      <Grid item xs={12} sm={4} key={diag.id}>
                        <Card
                          component={RouterLink}
                          to={`/diagrams/view/${diag.id}`}
                          variant="outlined"
                          sx={{
                            display: "block",
                            textDecoration: "none",
                            transition: "all 0.2s",
                            borderRadius: 2,
                            "&:hover": {
                              borderColor: alpha("#EC4899", 0.4),
                              transform: "translateY(-2px)",
                            },
                          }}
                        >
                          <CardContent sx={{ p: 2, pb: "16px !important" }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  bgcolor: alpha("#EC4899", 0.1),
                                  color: "#EC4899",
                                }}
                              >
                                <SchemaIcon fontSize="small" />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                                  {diag.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {new Date(diag.createdAt).toLocaleDateString()}
                                </Typography>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

              {/* Presentations */}
              {(recentPresentations.length > 0 || isPresentationsLoading) && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {t("home.presentations.heading")}
                    </Typography>
                    <Button
                      component={RouterLink}
                      to="/slides"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                    >
                      {t("home.presentations.viewAll")}
                    </Button>
                  </Stack>
                  <Grid container spacing={2}>
                    {isPresentationsLoading && (
                      <Grid item xs={12}>
                        <Typography color="text.secondary">
                          {t("home.presentations.loading")}
                        </Typography>
                      </Grid>
                    )}
                    {recentPresentations.map((pres) => (
                      <Grid item xs={12} sm={4} key={pres.id}>
                        <Card
                          component={RouterLink}
                          to={`/slides/view/${pres.id}`}
                          variant="outlined"
                          sx={{
                            display: "block",
                            textDecoration: "none",
                            transition: "all 0.2s",
                            borderRadius: 2,
                            "&:hover": {
                              borderColor: alpha("#a78bfa", 0.4),
                              transform: "translateY(-2px)",
                            },
                          }}
                        >
                          <CardContent sx={{ p: 2, pb: "16px !important" }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  bgcolor: alpha("#a78bfa", 0.1),
                                  color: "#a78bfa",
                                }}
                              >
                                <SlideshowIcon fontSize="small" />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                                  {pres.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {new Date(pres.createdAt).toLocaleDateString()}
                                </Typography>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </Stack>
          </Grid>

          {/* Right Column: Project Work Tracker */}
          <Grid item xs={12} lg={4}>
            {projects.length > 0 || isProjectsLoading ? (
              <Card variant="outlined" sx={{ height: "100%", borderRadius: 4 }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                    <Avatar sx={{ bgcolor: alpha("#4361EE", 0.1), color: "#4361EE", mr: 2 }}>
                      <ListAltIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Latest Project Work
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Tasks & Transcripts
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      mb: 2,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "text.secondary",
                    }}
                  >
                    {t("home.tasks.title")}
                  </Typography>
                  <Stack spacing={1.5} mb={4}>
                    {isTasksLoading ? (
                      <Typography color="text.secondary">{t("home.tasks.loading")}</Typography>
                    ) : topTasks.length === 0 ? (
                      <Typography color="text.secondary">{t("home.tasks.empty")}</Typography>
                    ) : (
                      topTasks.map((task) => (
                        <Box
                          key={task.id}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            bgcolor: "background.default",
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" mb={1}>
                            <Chip
                              label={task.status}
                              size="small"
                              sx={{ fontSize: "0.7rem", height: 20 }}
                            />
                            <Chip
                              label={task.priority}
                              size="small"
                              color={
                                task.priority === "HIGH" || task.priority === "URGENT"
                                  ? "error"
                                  : "warning"
                              }
                              sx={{ fontSize: "0.7rem", height: 20 }}
                            />
                          </Stack>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {task.title}
                          </Typography>
                        </Box>
                      ))
                    )}
                  </Stack>

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      mb: 2,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "text.secondary",
                    }}
                  >
                    {t("home.transcripts.title")}
                  </Typography>
                  <Stack spacing={2}>
                    {isTranscriptsLoading ? (
                      <Typography color="text.secondary">
                        {t("home.transcripts.loading")}
                      </Typography>
                    ) : recentTranscripts.length === 0 ? (
                      <Typography color="text.secondary">{t("home.transcripts.empty")}</Typography>
                    ) : (
                      recentTranscripts.map((transcript) => (
                        <Stack key={transcript.id} direction="row" spacing={2} alignItems="center">
                          <Box
                            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#4361EE" }}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {transcript.title ?? t("home.transcripts.recorded")}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {transcript.recordedAt
                                ? new Date(transcript.recordedAt).toLocaleString()
                                : "—"}
                            </Typography>
                          </Box>
                        </Stack>
                      ))
                    )}
                  </Stack>
                  {firstProjectId && (
                    <Button
                      component={RouterLink}
                      to={`/projects/${firstProjectId}`}
                      fullWidth
                      variant="outlined"
                      sx={{ mt: 4 }}
                    >
                      {t("home.tasks.openBoard")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </Grid>
        </Grid>

        {/* Empty state */}
        {!isLoadingAny &&
          projects.length === 0 &&
          presentations.length === 0 &&
          diagrams.length === 0 &&
          docs.length === 0 && (
            <Card
              variant="outlined"
              sx={{
                borderStyle: "dashed",
                borderColor: alpha("#4361EE", 0.3),
                bgcolor: alpha("#4361EE", 0.02),
                borderRadius: 4,
                mt: 4,
              }}
            >
              <CardContent sx={{ p: 6, textAlign: "center" }}>
                <AutoAwesomeIcon sx={{ fontSize: 48, color: "#4361EE", mb: 2 }} />
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                  {t("home.emptyState.title")}
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mb: 4, maxWidth: 600, mx: "auto" }}
                >
                  {t("home.emptyState.description")}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
                  <Button
                    component={RouterLink}
                    to="/projects?create=true"
                    variant="contained"
                    size="large"
                    startIcon={<AddCircleOutlineIcon />}
                  >
                    {t("home.emptyState.newSession")}
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/docs/create"
                    variant="outlined"
                    size="large"
                    color="info"
                    startIcon={<ArticleIcon />}
                  >
                    Create Document
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/slides/create"
                    variant="outlined"
                    size="large"
                    color="secondary"
                    startIcon={<SlideshowIcon />}
                  >
                    {t("home.emptyState.createSlides")}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}
      </Box>
    </SidebarLayout>
  );
};

export default Dashboard;
