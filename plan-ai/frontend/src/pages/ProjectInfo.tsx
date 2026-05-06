import React from "react";
import { Link as RouterLink, Navigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  LibraryBooksOutlined,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetProjectQuery, useListProjectTranscriptsQuery } from "../store/apis/projectApi";
import { useTranslation } from "react-i18next";

const ProjectInfo: React.FC = () => {
  const params = useParams();
  const projectId = params.projectId ?? null;
  const { t } = useTranslation();

  const {
    data: sessionData,
    isLoading: isSessionLoading,
    isFetching: isSessionFetching,
    error: sessionError,
    refetch: refetchSession,
  } = useGetProjectQuery(projectId ?? "", { skip: !projectId });

  const {
    data: transcriptsData,
    isLoading: isTranscriptsLoading,
    isFetching: isTranscriptsFetching,
    error: transcriptsError,
    refetch: refetchTranscripts,
  } = useListProjectTranscriptsQuery(
    { projectId: projectId ?? "", params: undefined },
    { skip: !projectId },
  );

  if (!projectId) {
    return <Navigate to="/projects" replace />;
  }

  const project = sessionData?.data ?? null;
  const transcripts = transcriptsData?.data?.transcripts ?? [];

  const sessionErrorMessage = (() => {
    if (!sessionError) {
      return null;
    }

    if ("status" in sessionError) {
      if (typeof sessionError.data === "string") {
        return sessionError.data;
      }
      if (
        typeof sessionError.data === "object" &&
        sessionError.data !== null &&
        "message" in sessionError.data &&
        typeof (sessionError.data as { message?: string }).message === "string"
      ) {
        return (sessionError.data as { message?: string }).message;
      }
      return typeof sessionError.status === "number"
        ? t("projectInfo.messages.sessionErrorStatus", { status: sessionError.status })
        : t("projectInfo.messages.sessionErrorFallback");
    }

    return (
      (sessionError as { message?: string }).message ??
      t("projectInfo.messages.sessionErrorFallback")
    );
  })();

  const transcriptsErrorMessage = (() => {
    if (!transcriptsError) {
      return null;
    }

    if ("status" in transcriptsError) {
      if (typeof transcriptsError.data === "string") {
        return transcriptsError.data;
      }
      if (
        typeof transcriptsError.data === "object" &&
        transcriptsError.data !== null &&
        "message" in transcriptsError.data &&
        typeof (transcriptsError.data as { message?: string }).message === "string"
      ) {
        return (transcriptsError.data as { message?: string }).message;
      }
      return typeof transcriptsError.status === "number"
        ? t("projectInfo.messages.transcriptsErrorStatus", { status: transcriptsError.status })
        : t("projectInfo.messages.transcriptsErrorFallback");
    }

    return (
      (transcriptsError as { message?: string }).message ??
      t("projectInfo.messages.transcriptsErrorFallback")
    );
  })();

  return (
    <SidebarLayout>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          px: { xs: 2, md: 3 },
          py: 3,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Breadcrumbs aria-label={t("projectInfo.breadcrumbs.aria")} sx={{ flexGrow: 1 }}>
            <Link component={RouterLink} underline="hover" color="inherit" to="/projects">
              {t("projectInfo.breadcrumbs.sessions")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/projects/${projectId}`}
            >
              {t("projectInfo.breadcrumbs.workspace")}
            </Link>
            <Typography color="text.primary">{t("projectInfo.breadcrumbs.info")}</Typography>
          </Breadcrumbs>

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to={`/projects/${projectId}`}
              variant="outlined"
              startIcon={<ArrowBackIcon />}
            >
              {t("projectInfo.buttons.backToWorkspace")}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<RefreshIcon />}
              onClick={() => {
                refetchSession();
                refetchTranscripts();
              }}
              disabled={isSessionFetching || isTranscriptsFetching}
            >
              {t("projectInfo.buttons.refresh")}
            </Button>
          </Stack>
        </Stack>

        {isSessionLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : sessionErrorMessage ? (
          <Alert severity="error">{sessionErrorMessage}</Alert>
        ) : !project ? (
          <Alert severity="warning">{t("projectInfo.messages.sessionNotFound")}</Alert>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {project.title}
                    </Typography>
                    <Chip label={project.status} color="primary" variant="outlined" />
                  </Stack>

                  {project.description ? (
                    <Typography variant="body1" color="text.primary">
                      {project.description}
                    </Typography>
                  ) : null}

                  <Divider flexItem />

                  <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectInfo.meta.created")}
                      </Typography>
                      <Typography variant="body2">
                        {new Date(project.createdAt).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectInfo.meta.updated")}
                      </Typography>
                      <Typography variant="body2">
                        {new Date(project.updatedAt).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectInfo.meta.started")}
                      </Typography>
                      <Typography variant="body2">
                        {project.startedAt ? new Date(project.startedAt).toLocaleString() : "—"}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectInfo.meta.ended")}
                      </Typography>
                      <Typography variant="body2">
                        {project.endedAt ? new Date(project.endedAt).toLocaleString() : "—"}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      {t("projectInfo.sections.metadataLabel")}
                    </Typography>
                    <Typography
                      component="pre"
                      variant="body2"
                      sx={{
                        bgcolor: "background.paper",
                        p: 2,
                        borderRadius: 1,
                        overflowX: "auto",
                        fontFamily: "monospace",
                      }}
                    >
                      {project.metadata
                        ? JSON.stringify(project.metadata, null, 2)
                        : t("projectInfo.messages.noMetadata")}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" id="transcripts">
              <CardContent>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", md: "center" }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {t("projectInfo.sections.transcriptsTitle")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("projectInfo.sections.transcriptsDescription")}
                      </Typography>
                    </Stack>
                    <Button
                      variant="contained"
                      startIcon={<LibraryBooksOutlined />}
                      onClick={() => refetchTranscripts()}
                      disabled={isTranscriptsFetching}
                    >
                      {t("projectInfo.buttons.refreshTranscripts")}
                    </Button>
                  </Stack>

                  {isTranscriptsLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : transcriptsErrorMessage ? (
                    <Alert severity="error">{transcriptsErrorMessage}</Alert>
                  ) : transcripts.length === 0 ? (
                    <Alert severity="info">{t("projectInfo.messages.noTranscripts")}</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("projectInfo.table.title")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("projectInfo.table.source")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("projectInfo.table.recorded")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("projectInfo.table.created")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("projectInfo.table.summary")}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {transcripts.map((transcript) => (
                            <TableRow
                              key={transcript.id}
                              hover
                              component={RouterLink}
                              to={`/projects/${projectId}/info/transcripts/${transcript.id}`}
                              sx={{
                                textDecoration: "none",
                                color: "inherit",
                                cursor: "pointer",
                              }}
                            >
                              <TableCell>
                                {transcript.title ?? t("projectInfo.table.untitled")}
                              </TableCell>
                              <TableCell>
                                {transcript.source ?? t("projectInfo.table.missing")}
                              </TableCell>
                              <TableCell>
                                {transcript.recordedAt
                                  ? new Date(transcript.recordedAt).toLocaleString()
                                  : t("projectInfo.table.missing")}
                              </TableCell>
                              <TableCell>
                                {new Date(transcript.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                {transcript.summary ? (
                                  <Typography variant="body2" color="text.secondary">
                                    {transcript.summary}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    {t("projectInfo.table.noSummary")}
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default ProjectInfo;
