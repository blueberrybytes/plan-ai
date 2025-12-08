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
import { useGetSessionQuery, useListSessionTranscriptsQuery } from "../store/apis/sessionApi";
import { useTranslation } from "react-i18next";

const SessionInfo: React.FC = () => {
  const params = useParams();
  const sessionId = params.sessionId ?? null;
  const { t } = useTranslation();

  const {
    data: sessionData,
    isLoading: isSessionLoading,
    isFetching: isSessionFetching,
    error: sessionError,
    refetch: refetchSession,
  } = useGetSessionQuery(sessionId ?? "", { skip: !sessionId });

  const {
    data: transcriptsData,
    isLoading: isTranscriptsLoading,
    isFetching: isTranscriptsFetching,
    error: transcriptsError,
    refetch: refetchTranscripts,
  } = useListSessionTranscriptsQuery(
    { sessionId: sessionId ?? "", params: undefined },
    { skip: !sessionId },
  );

  if (!sessionId) {
    return <Navigate to="/sessions" replace />;
  }

  const session = sessionData?.data ?? null;
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
        ? t("sessionInfo.messages.sessionErrorStatus", { status: sessionError.status })
        : t("sessionInfo.messages.sessionErrorFallback");
    }

    return (
      (sessionError as { message?: string }).message ??
      t("sessionInfo.messages.sessionErrorFallback")
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
        ? t("sessionInfo.messages.transcriptsErrorStatus", { status: transcriptsError.status })
        : t("sessionInfo.messages.transcriptsErrorFallback");
    }

    return (
      (transcriptsError as { message?: string }).message ??
      t("sessionInfo.messages.transcriptsErrorFallback")
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
          <Breadcrumbs aria-label={t("sessionInfo.breadcrumbs.aria")} sx={{ flexGrow: 1 }}>
            <Link component={RouterLink} underline="hover" color="inherit" to="/sessions">
              {t("sessionInfo.breadcrumbs.sessions")}
            </Link>
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to={`/sessions/${sessionId}`}
            >
              {t("sessionInfo.breadcrumbs.workspace")}
            </Link>
            <Typography color="text.primary">{t("sessionInfo.breadcrumbs.info")}</Typography>
          </Breadcrumbs>

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to={`/sessions/${sessionId}`}
              variant="outlined"
              startIcon={<ArrowBackIcon />}
            >
              {t("sessionInfo.buttons.backToWorkspace")}
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
              {t("sessionInfo.buttons.refresh")}
            </Button>
          </Stack>
        </Stack>

        {isSessionLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : sessionErrorMessage ? (
          <Alert severity="error">{sessionErrorMessage}</Alert>
        ) : !session ? (
          <Alert severity="warning">{t("sessionInfo.messages.sessionNotFound")}</Alert>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {session.title}
                    </Typography>
                    <Chip label={session.status} color="primary" variant="outlined" />
                  </Stack>

                  {session.description ? (
                    <Typography variant="body1" color="text.primary">
                      {session.description}
                    </Typography>
                  ) : null}

                  <Divider flexItem />

                  <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionInfo.meta.created")}
                      </Typography>
                      <Typography variant="body2">
                        {new Date(session.createdAt).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionInfo.meta.updated")}
                      </Typography>
                      <Typography variant="body2">
                        {new Date(session.updatedAt).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionInfo.meta.started")}
                      </Typography>
                      <Typography variant="body2">
                        {session.startedAt ? new Date(session.startedAt).toLocaleString() : "—"}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="overline" color="text.secondary">
                        {t("sessionInfo.meta.ended")}
                      </Typography>
                      <Typography variant="body2">
                        {session.endedAt ? new Date(session.endedAt).toLocaleString() : "—"}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      {t("sessionInfo.sections.metadataLabel")}
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
                      {session.metadata
                        ? JSON.stringify(session.metadata, null, 2)
                        : t("sessionInfo.messages.noMetadata")}
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
                        {t("sessionInfo.sections.transcriptsTitle")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("sessionInfo.sections.transcriptsDescription")}
                      </Typography>
                    </Stack>
                    <Button
                      variant="contained"
                      startIcon={<LibraryBooksOutlined />}
                      onClick={() => refetchTranscripts()}
                      disabled={isTranscriptsFetching}
                    >
                      {t("sessionInfo.buttons.refreshTranscripts")}
                    </Button>
                  </Stack>

                  {isTranscriptsLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : transcriptsErrorMessage ? (
                    <Alert severity="error">{transcriptsErrorMessage}</Alert>
                  ) : transcripts.length === 0 ? (
                    <Alert severity="info">{t("sessionInfo.messages.noTranscripts")}</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("sessionInfo.table.title")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("sessionInfo.table.source")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("sessionInfo.table.recorded")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("sessionInfo.table.created")}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {t("sessionInfo.table.summary")}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {transcripts.map((transcript) => (
                            <TableRow
                              key={transcript.id}
                              hover
                              component={RouterLink}
                              to={`/sessions/${sessionId}/info/transcripts/${transcript.id}`}
                              sx={{
                                textDecoration: "none",
                                color: "inherit",
                                cursor: "pointer",
                              }}
                            >
                              <TableCell>
                                {transcript.title ?? t("sessionInfo.table.untitled")}
                              </TableCell>
                              <TableCell>
                                {transcript.source ?? t("sessionInfo.table.missing")}
                              </TableCell>
                              <TableCell>
                                {transcript.recordedAt
                                  ? new Date(transcript.recordedAt).toLocaleString()
                                  : t("sessionInfo.table.missing")}
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
                                    {t("sessionInfo.table.noSummary")}
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

export default SessionInfo;
