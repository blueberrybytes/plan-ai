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
  Link,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  DescriptionOutlined,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetProjectQuery, useGetProjectTranscriptQuery } from "../store/apis/projectApi";
import { useTranslation } from "react-i18next";

const formatDateTime = (value: string | null | undefined, fallback: string) => {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
};

const prettyJson = (value: unknown, emptyFallback: string, errorFallback: string) => {
  if (!value) {
    return emptyFallback;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error("Failed to stringify metadata", error);
    return errorFallback;
  }
};

const ProjectTranscriptDetail: React.FC = () => {
  const params = useParams();
  const projectId = params.projectId ?? null;
  const transcriptId = params.transcriptId ?? null;
  const { t } = useTranslation();

  const {
    isLoading: isSessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useGetProjectQuery(projectId ?? "", { skip: !projectId });

  const {
    data: transcriptData,
    isLoading: isTranscriptLoading,
    isFetching: isTranscriptFetching,
    error: transcriptError,
    refetch: refetchTranscript,
  } = useGetProjectTranscriptQuery(
    { projectId: projectId ?? "", transcriptId: transcriptId ?? "" },
    { skip: !projectId || !transcriptId },
  );

  if (!projectId) {
    return <Navigate to="/projects" replace />;
  }

  if (!transcriptId) {
    return <Navigate to={`/projects/${projectId}/info`} replace />;
  }

  const transcript = transcriptData?.data ?? null;

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
        ? t("projectTranscriptDetail.messages.sessionErrorStatus", { status: sessionError.status })
        : t("projectTranscriptDetail.messages.sessionErrorFallback");
    }

    return (
      (sessionError as { message?: string }).message ??
      t("projectTranscriptDetail.messages.sessionErrorFallback")
    );
  })();

  const transcriptErrorMessage = (() => {
    if (!transcriptError) {
      return null;
    }

    if ("status" in transcriptError) {
      if (typeof transcriptError.data === "string") {
        return transcriptError.data;
      }
      if (
        typeof transcriptError.data === "object" &&
        transcriptError.data !== null &&
        "message" in transcriptError.data &&
        typeof (transcriptError.data as { message?: string }).message === "string"
      ) {
        return (transcriptError.data as { message?: string }).message;
      }
      return typeof transcriptError.status === "number"
        ? t("projectTranscriptDetail.messages.transcriptErrorStatus", {
            status: transcriptError.status,
          })
        : t("projectTranscriptDetail.messages.transcriptErrorFallback");
    }

    return (
      (transcriptError as { message?: string }).message ??
      t("projectTranscriptDetail.messages.transcriptErrorFallback")
    );
  })();

  const handleRefresh = () => {
    refetchTranscript();
    refetchSession();
  };

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
          <Breadcrumbs
            aria-label={t("projectTranscriptDetail.breadcrumbs.aria")}
            sx={{ flexGrow: 1 }}
          >
            <Link component={RouterLink} underline="hover" color="inherit" to="/projects">
              {t("projectTranscriptDetail.breadcrumbs.sessions")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/projects/${projectId}`}
            >
              {t("projectTranscriptDetail.breadcrumbs.workspace")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/projects/${projectId}/info`}
            >
              {t("projectTranscriptDetail.breadcrumbs.info")}
            </Link>
            <Typography color="text.primary">
              {t("projectTranscriptDetail.breadcrumbs.transcript")}
            </Typography>
          </Breadcrumbs>

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to={`/projects/${projectId}/info`}
              variant="outlined"
              startIcon={<ArrowBackIcon />}
            >
              {t("projectTranscriptDetail.buttons.backToInfo")}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isTranscriptFetching || isSessionLoading}
            >
              {t("projectTranscriptDetail.buttons.refresh")}
            </Button>
          </Stack>
        </Stack>

        {isTranscriptLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : transcriptErrorMessage ? (
          <Alert severity="error">{transcriptErrorMessage}</Alert>
        ) : !transcript ? (
          <Alert severity="warning">
            {t("projectTranscriptDetail.messages.transcriptNotFound")}
          </Alert>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {transcript.title ?? t("projectTranscriptDetail.messages.untitled")}
                    </Typography>
                    {transcript.source ? (
                      <Chip
                        label={transcript.source}
                        icon={<DescriptionOutlined />}
                        color="primary"
                        variant="outlined"
                      />
                    ) : null}
                    {transcript.language ? (
                      <Chip label={transcript.language} variant="outlined" />
                    ) : null}
                  </Stack>

                  <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectTranscriptDetail.meta.recorded")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.recordedAt,
                          t("projectTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectTranscriptDetail.meta.created")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.createdAt,
                          t("projectTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectTranscriptDetail.meta.updated")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.updatedAt,
                          t("projectTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                  </Stack>

                  {transcript.summary ? (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        {t("projectTranscriptDetail.sections.summary")}
                      </Typography>
                      <Typography variant="body1" color="text.primary">
                        {transcript.summary}
                      </Typography>
                    </Box>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("projectTranscriptDetail.sections.transcript")}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      bgcolor: "background.paper",
                      p: 2,
                      borderRadius: 1,
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      fontFamily: "monospace",
                    }}
                  >
                    {transcript.transcript ?? t("projectTranscriptDetail.messages.noText")}
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("projectTranscriptDetail.sections.metadata")}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      bgcolor: "background.paper",
                      p: 2,
                      borderRadius: 1,
                      overflowX: "auto",
                      fontFamily: "monospace",
                    }}
                  >
                    {prettyJson(
                      transcript.metadata,
                      t("projectTranscriptDetail.messages.noMetadata"),
                      t("projectTranscriptDetail.messages.metadataError"),
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {sessionErrorMessage ? <Alert severity="warning">{sessionErrorMessage}</Alert> : null}
      </Box>
    </SidebarLayout>
  );
};

export default ProjectTranscriptDetail;
