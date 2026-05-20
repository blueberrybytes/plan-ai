/* eslint-disable @typescript-eslint/no-explicit-any */
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
  IconButton,
  Link,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  DescriptionOutlined,
  Place as LocationIcon,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useGetProjectQuery,
  useGetProjectTranscriptQuery,
  useListProjectTasksQuery,
} from "../store/apis/projectApi";
import { useTranslation } from "react-i18next";
import { ContentCopy as CopyIcon, Check as CheckIcon } from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import MermaidRenderer from "../components/common/MermaidRenderer";
import { AiGraphTrace, ContextGraph } from "../components/project/ContextGraph";
import PostMeetingTasksPanel from "../components/project/PostMeetingTasksPanel";

const ChatMessageItem = ({ msg }: { msg: { role: string; content: string } }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        alignSelf: msg.role === "USER" ? "flex-end" : "flex-start",
        bgcolor: msg.role === "USER" ? "primary.dark" : "rgba(255,255,255,0.05)",
        p: 1.5,
        pr: 5,
        borderRadius: 2,
        maxWidth: "85%",
        position: "relative",
        mb: 2,
        "&:hover .copy-btn": { opacity: 1 },
      }}
    >
      <Box
        sx={{
          typography: "body2",
          "& h3, & h4": { mt: 1, mb: 1, color: "text.primary", fontWeight: 600 },
          "& ul": { my: 0.5, pl: 2 },
          "& li": { mb: 0.5 },
          "& p": { my: 0 },
          color: msg.role === "USER" ? "primary.contrastText" : "text.secondary",
        }}
      >
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </Box>

      <IconButton
        className="copy-btn"
        size="small"
        onClick={handleCopy}
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          opacity: 0,
          transition: "opacity 0.2s",
          bgcolor: "background.paper",
          "&:hover": { bgcolor: "background.default" },
        }}
      >
        {copied ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
      </IconButton>
    </Box>
  );
};

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

const formatTimestamp = (seconds?: number | null) => {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}]`;
};

const RenderTranscriptContent = ({ transcript }: { transcript: any }) => {
  const principalSpeaker = (transcript?.metadata as any)?.principalSpeaker;

  if (
    transcript.utterances &&
    Array.isArray(transcript.utterances) &&
    transcript.utterances.length > 0
  ) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {transcript.utterances.map((u: any, i: number) => {
          const speakerStr = u.speaker || "Unknown";
          const isMe = principalSpeaker ? speakerStr === principalSpeaker : false;
          return (
            <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
              <Typography
                variant="subtitle2"
                color={isMe ? "primary.main" : "secondary.main"}
                fontWeight="bold"
              >
                {formatTimestamp(u.start)} {isMe ? "(Me)" : speakerStr}
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.6, color: "text.primary" }}>
                {u.transcript}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  // Fallback for transcripts without DB utterances
  const rawText = transcript.transcript || "No transcript content available.";
  const parts = rawText.split("\n\n");

  if (parts.length > 0) {
    // Check if the parts look like they have speaker prefixes (e.g. "Speaker Name: Text")
    const hasLabels = parts.some((p: string) => /^([\w\s]+):\s*([\s\S]*)/i.test(p));

    if (hasLabels) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {parts.map((block: string, i: number) => {
            const match = block.match(/^([\w\s]+):\s*([\s\S]*)/i);
            if (match) {
              const speaker = match[1].trim();
              const text = match[2];
              const isMe = principalSpeaker ? speaker === principalSpeaker : false;
              return (
                <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography
                    variant="subtitle2"
                    color={isMe ? "primary.main" : "secondary.main"}
                    fontWeight="bold"
                  >
                    {isMe ? "(Me)" : speaker}
                  </Typography>
                  <Typography variant="body1" sx={{ lineHeight: 1.6, color: "text.primary" }}>
                    {text}
                  </Typography>
                </Box>
              );
            }
            return (
              <Typography
                key={i}
                variant="body1"
                sx={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  color: "text.primary",
                }}
              >
                {block}
              </Typography>
            );
          })}
        </Box>
      );
    }
  }

  return (
    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
      {rawText}
    </Typography>
  );
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

  const [pollingInterval, setPollingInterval] = React.useState(0);

  const {
    data: transcriptData,
    isLoading: isTranscriptLoading,
    isFetching: isTranscriptFetching,
    error: transcriptError,
    refetch: refetchTranscript,
  } = useGetProjectTranscriptQuery(
    { projectId: projectId ?? "", transcriptId: transcriptId ?? "" },
    { skip: !projectId || !transcriptId, pollingInterval },
  );

  React.useEffect(() => {
    const meta = transcriptData?.data?.metadata as
      | { processingStatus?: string; postMeetingTasks?: Record<string, { status?: string }> }
      | undefined;
    const status = meta?.processingStatus;
    const isPending = status === "PENDING" || status === "EXTRACTING_TASKS";
    const hasPendingPostMeetingTask =
      meta?.postMeetingTasks &&
      Object.values(meta.postMeetingTasks).some((t) => t?.status === "PENDING");
    setPollingInterval(isPending || hasPendingPostMeetingTask ? 3000 : 0);
  }, [transcriptData]);

  const { data: allTasksData } = useListProjectTasksQuery(
    { projectId: projectId ?? "" },
    { skip: !projectId || !transcriptData?.data },
  );

  const [tabValue, setTabValue] = React.useState("transcript");

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    setTabValue(newValue);
  };

  const transcriptTasks = React.useMemo(() => {
    if (!allTasksData?.data?.tasks || !transcriptId) return [];
    return allTasksData.data.tasks.filter((task) => {
      const metadata = task.metadata as Record<string, unknown> | null;
      return metadata && metadata.generatedFromTranscriptId === transcriptId;
    });
  }, [allTasksData, transcriptId]);

  const generateMermaidFromTasks = () => {
    if (!transcriptTasks || transcriptTasks.length === 0) return null;
    let code = "graph TD;\n";

    const statusColors: Record<string, string> = {
      COMPLETED: "fill:#4caf50",
      IN_PROGRESS: "fill:#2196f3",
      BLOCKED: "fill:#f44336",
      BACKLOG: "fill:#9e9e9e",
      ARCHIVED: "fill:#757575",
    };

    const nodes = new Map<string, string>();
    transcriptTasks.forEach((t) => {
      const cleanId = t.id.replace(/[^a-zA-Z0-9]/g, "");
      nodes.set(t.id, cleanId);
      const title = (t.title || "Untitled").replace(/"/g, "'").replace(/\n/g, " ");
      code += `  ${cleanId}["[${String(t.status).replace("_", " ")}]<br/>${title}"];\n`;
      if (t.status && statusColors[t.status]) {
        code += `  style ${cleanId} ${statusColors[t.status]},stroke:#fff,stroke-width:2px,color:#fff;\n`;
      }
    });

    transcriptTasks.forEach((t) => {
      const cleanId = nodes.get(t.id);
      if (t.dependencies && t.dependencies.length > 0) {
        t.dependencies.forEach((depId) => {
          const depNode = nodes.get(depId);
          if (depNode && cleanId) {
            code += `  ${depNode} --> ${cleanId};\n`;
          }
        });
      }
    });
    return code;
  };

  const generatedChart = generateMermaidFromTasks();

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
                    {(transcript.metadata as any)?.location && (
                      <Chip
                        size="small"
                        icon={<LocationIcon fontSize="small" />}
                        label={`${(transcript.metadata as any).location.latitude.toFixed(4)}, ${(transcript.metadata as any).location.longitude.toFixed(4)}`}
                        variant="outlined"
                        component="a"
                        href={`https://www.google.com/maps/search/?api=1&query=${(transcript.metadata as any).location.latitude},${(transcript.metadata as any).location.longitude}`}
                        target="_blank"
                        clickable
                      />
                    )}
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

            {(transcript.metadata as { processingStatus?: string })?.processingStatus ===
            "PENDING" ? (
              <Card variant="outlined">
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6 }}
                >
                  <CircularProgress size={48} sx={{ mb: 3 }} />
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    AI is analyzing your recording...
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: "center", maxWidth: 400 }}
                  >
                    This process might take up to 30 seconds for long transcripts. The page will
                    refresh automatically when finished.
                  </Typography>
                </CardContent>
              </Card>
            ) : (transcript.metadata as { processingStatus?: string })?.processingStatus ===
              "FAILED" ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                The background AI worker encountered an error while processing this transcript:{" "}
                <strong>{(transcript.metadata as any)?.errorMessage || "Unknown Error"}</strong>
                <br />
                <br />
                Tasks and summaries could not be generated.
              </Alert>
            ) : (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    {(transcript.metadata as any)?.processingStatus === "EXTRACTING_TASKS" && (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        🤖 AI is currently extracting tasks from this transcript in the background. They will appear here shortly!
                      </Alert>
                    )}
                    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                      <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                      >
                        <Tab label="Raw Transcript" value="transcript" sx={{ fontWeight: 600 }} />
                        {Boolean((transcript.metadata as Record<string, unknown>)?.aiGraphTrace) && (
                          <Tab
                            label="✨ AI Context Graph"
                            value="context-graph"
                            sx={{ fontWeight: 600, color: "primary.main" }}
                          />
                        )}
                        {transcriptTasks && transcriptTasks.length > 0 && generatedChart && (
                          <Tab
                            label="Architecture Map"
                            value="architecture"
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </Tabs>
                    </Box>

                    {tabValue === "context-graph" && (() => {
                      const trace = (transcript.metadata as Record<string, unknown>)?.aiGraphTrace as AiGraphTrace | undefined;
                      if (!trace || !Array.isArray(trace.nodes) || trace.nodes.length === 0) return null;
                      return (
                        <Box sx={{ mt: 2 }}>
                          <ContextGraph height={400} nodes={trace.nodes} links={trace.links} />
                        </Box>
                      );
                    })()}

                    {tabValue === "transcript" && (
                      <Box sx={{ mt: 2 }}>
                        <RenderTranscriptContent transcript={transcript} />
                      </Box>
                    )}

                    {tabValue === "architecture" && generatedChart && (
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: "background.paper",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <MermaidRenderer chart={generatedChart} />
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}

            <PostMeetingTasksPanel tasks={(transcript.metadata as any)?.postMeetingTasks} />

            {transcript.chatThread && transcript.chatThread.messages.length > 0 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Live Chat History
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        bgcolor: "background.paper",
                        p: 2,
                        borderRadius: 1,
                      }}
                    >
                      {transcript.chatThread.messages.map((msg, idx) => (
                        <ChatMessageItem key={idx} msg={msg} />
                      ))}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            )}

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
