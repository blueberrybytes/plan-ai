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
import { useGetSessionQuery, useGetSessionTranscriptQuery } from "../store/apis/sessionApi";
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

const SessionTranscriptDetail: React.FC = () => {
  const params = useParams();
  const sessionId = params.sessionId ?? null;
  const transcriptId = params.transcriptId ?? null;
  const { t } = useTranslation();

  const {
    isLoading: isSessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useGetSessionQuery(sessionId ?? "", { skip: !sessionId });

  const {
    data: transcriptData,
    isLoading: isTranscriptLoading,
    isFetching: isTranscriptFetching,
    error: transcriptError,
    refetch: refetchTranscript,
  } = useGetSessionTranscriptQuery(
    { sessionId: sessionId ?? "", transcriptId: transcriptId ?? "" },
    { skip: !sessionId || !transcriptId },
  );

  if (!sessionId) {
    return <Navigate to="/sessions" replace />;
  }

  if (!transcriptId) {
    return <Navigate to={`/sessions/${sessionId}/info`} replace />;
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
        ? t("sessionTranscriptDetail.messages.sessionErrorStatus", { status: sessionError.status })
        : t("sessionTranscriptDetail.messages.sessionErrorFallback");
    }

    return (
      (sessionError as { message?: string }).message ??
      t("sessionTranscriptDetail.messages.sessionErrorFallback")
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
        ? t("sessionTranscriptDetail.messages.transcriptErrorStatus", {
            status: transcriptError.status,
          })
        : t("sessionTranscriptDetail.messages.transcriptErrorFallback");
    }

    return (
      (transcriptError as { message?: string }).message ??
      t("sessionTranscriptDetail.messages.transcriptErrorFallback")
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
            aria-label={t("sessionTranscriptDetail.breadcrumbs.aria")}
            sx={{ flexGrow: 1 }}
          >
            <Link component={RouterLink} underline="hover" color="inherit" to="/sessions">
              {t("sessionTranscriptDetail.breadcrumbs.sessions")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/sessions/${sessionId}`}
            >
              {t("sessionTranscriptDetail.breadcrumbs.workspace")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/sessions/${sessionId}/info`}
            >
              {t("sessionTranscriptDetail.breadcrumbs.info")}
            </Link>
            <Typography color="text.primary">
              {t("sessionTranscriptDetail.breadcrumbs.transcript")}
            </Typography>
          </Breadcrumbs>

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to={`/sessions/${sessionId}/info`}
              variant="outlined"
              startIcon={<ArrowBackIcon />}
            >
              {t("sessionTranscriptDetail.buttons.backToInfo")}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isTranscriptFetching || isSessionLoading}
            >
              {t("sessionTranscriptDetail.buttons.refresh")}
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
            {t("sessionTranscriptDetail.messages.transcriptNotFound")}
          </Alert>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {transcript.title ?? t("sessionTranscriptDetail.messages.untitled")}
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
                        {t("sessionTranscriptDetail.meta.recorded")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.recordedAt,
                          t("sessionTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionTranscriptDetail.meta.created")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.createdAt,
                          t("sessionTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionTranscriptDetail.meta.updated")}
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(
                          transcript.updatedAt,
                          t("sessionTranscriptDetail.table.missing"),
                        )}
                      </Typography>
                    </Stack>
                  </Stack>

                  {transcript.summary ? (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionTranscriptDetail.sections.summary")}
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
                    {t("sessionTranscriptDetail.sections.transcript")}
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
                    {transcript.transcript ?? t("sessionTranscriptDetail.messages.noText")}
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("sessionTranscriptDetail.sections.metadata")}
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
                      t("sessionTranscriptDetail.messages.noMetadata"),
                      t("sessionTranscriptDetail.messages.metadataError"),
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

export default SessionTranscriptDetail;
