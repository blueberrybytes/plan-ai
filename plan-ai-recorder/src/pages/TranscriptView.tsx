import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Stack,
  Button,
  Alert,
  Tooltip,
  Tabs,
  Tab,
  Chip,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Check as CheckIcon,
  AccessTime as TimeIcon,
  Group as GroupIcon,
} from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Transcript, Task } from "../services/planAiApi";
import ReactMarkdown from "react-markdown";

const MermaidImgRenderer = ({ tasks }: { tasks: Task[] }) => {
  if (!tasks || tasks.length === 0) return null;
  let code = "graph TD;\n";
  const statusColors: Record<string, string> = {
    COMPLETED: "fill:#4caf50",
    IN_PROGRESS: "fill:#2196f3",
    BLOCKED: "fill:#f44336",
    BACKLOG: "fill:#9e9e9e",
    ARCHIVED: "fill:#757575",
  };

  const nodes = new Map<string, string>();
  tasks.forEach((t) => {
    const cleanId = t.id.replace(/[^a-zA-Z0-9]/g, "");
    nodes.set(t.id, cleanId);
    let title = (t.title || "Untitled").replace(/"/g, "'").replace(/\n/g, " ");
    code += `  ${cleanId}["[${String(t.status).replace("_", " ")}]<br/>${title}"];\n`;
    if (t.status && statusColors[t.status]) {
      code += `  style ${cleanId} ${statusColors[t.status]},stroke:#fff,stroke-width:2px,color:#fff;\n`;
    }
  });

  tasks.forEach((t) => {
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

  try {
    // Standard UTF-8 safe Base64 encoding. mermaid.ink handles standard Base64.
    const encoded = btoa(unescape(encodeURIComponent(code)));

    return (
      <Box
        sx={{
          width: "100%",
          overflow: "auto",
          p: 4,
          bgcolor: "#ffffff",
          borderRadius: 2,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <img
          src={`https://mermaid.ink/svg/${encoded}`}
          alt="Architecture Map"
          style={{ maxWidth: "100%" }}
        />
      </Box>
    );
  } catch (e) {
    return <Alert severity="error">Failed to encode diagram.</Alert>;
  }
};

const ChatMessageItem = ({
  msg,
}: {
  msg: { role: string; content: string };
}) => {
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
        bgcolor:
          msg.role === "USER" ? "primary.dark" : "rgba(255,255,255,0.05)",
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
          "& h3, & h4": {
            mt: 1,
            mb: 1,
            color: "text.primary",
            fontWeight: 600,
          },
          "& ul": { my: 0.5, pl: 2 },
          "& li": { mb: 0.5 },
          "& p": { my: 0 },
          color:
            msg.role === "USER" ? "primary.contrastText" : "text.secondary",
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
        {copied ? (
          <CheckIcon fontSize="small" color="success" />
        ) : (
          <CopyIcon fontSize="small" />
        )}
      </IconButton>
    </Box>
  );
};

const formatTimestamp = (seconds?: number | null) => {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}]`;
};

const RenderTranscriptContent = ({
  transcript,
}: {
  transcript: Transcript;
}) => {
  type Utterance = { speaker: string; transcript: string; start: number; end: number };
  const utterances = transcript.utterances as Utterance[] | null | undefined;
  const principalSpeaker = transcript?.metadata?.principalSpeaker as string | undefined;

  if (utterances && utterances.length > 0) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {utterances.map((u, i) => {
          const speakerStr = u.speaker || "Unknown";
          const isMe = principalSpeaker
            ? speakerStr === principalSpeaker
            : false;
          return (
            <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
              <Typography
                variant="subtitle2"
                color={isMe ? "primary.main" : "secondary.main"}
                fontWeight="bold"
              >
                {formatTimestamp(u.start)} {isMe ? "(Me)" : speakerStr}
              </Typography>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.6, color: "text.primary" }}
              >
                {u.transcript}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  // Fallback for transcripts without DB utterances (like Discard AI or old recordings)
  const rawText = transcript.transcript || "No transcript content available.";
  const parts = rawText.split("\n\n");

  if (parts.length > 0) {
    const hasLabels = parts.some((p) => /^([\w\s]+):\s*([\s\S]*)/i.test(p));

    if (hasLabels) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {parts.map((block, i) => {
            const match = block.match(/^([\w\s]+):\s*([\s\S]*)/i);
            if (match) {
              const speaker = match[1].trim();
              const text = match[2];
              const isMe = principalSpeaker
                ? speaker === principalSpeaker
                : false;
              return (
                <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography
                    variant="subtitle2"
                    color={isMe ? "primary.main" : "secondary.main"}
                    fontWeight="bold"
                  >
                    {isMe ? "(Me)" : speaker}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ lineHeight: 1.6, color: "text.primary" }}
                  >
                    {text}
                  </Typography>
                </Box>
              );
            }
            // Generic paragraph if no speaker match
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
    <Typography
      variant="body1"
      sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
    >
      {rawText}
    </Typography>
  );
};

const TranscriptView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { api } = useAuth();

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState("summary");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setTabValue(newValue);
    setSelectedTask(null); // Reset task detail view when changing tabs
  };

  const fetchTranscript = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const data = await api.getTranscript(id);
        setTranscript(data);
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to load recording.",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, api],
  );

  useEffect(() => {
    void fetchTranscript(false);
  }, [fetchTranscript]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const isProcessing =
      transcript?.metadata?.processingStatus === "PENDING" ||
      transcript?.metadata?.processingStatus === "PROCESSING" ||
      transcript?.metadata?.processingStatus === "EXTRACTING_TASKS";

    if (isProcessing) {
      timeoutId = setTimeout(() => {
        void fetchTranscript(true);
      }, 3000);
    }
    return () => clearTimeout(timeoutId);
  }, [transcript, fetchTranscript]);

  const handleCopy = () => {
    if (transcript?.transcript) {
      navigator.clipboard
        .writeText(transcript.transcript)
        .catch(() => undefined);
    }
  };

  const handleDownload = async () => {
    if (!transcript) return;

    let contentToDownload = "";
    let filenameSuffix = "recording";

    if (tabValue === "summary" && transcript.summary) {
      contentToDownload = transcript.summary;
      filenameSuffix = "summary";
    } else if (tabValue === "transcript" && transcript.transcript) {
      contentToDownload = transcript.transcript;
      filenameSuffix = "transcript";
    } else if (tabValue === "tasks" && transcript.tasks) {
      contentToDownload = transcript.tasks
        .map(
          (t) =>
            `[${t.status}] ${t.priority} - ${t.title}\n\n${t.description || "No description"}\n\nAcceptance Criteria:\n${t.acceptanceCriteria || "None"}\n`,
        )
        .join("\n---\n\n");
      filenameSuffix = "tasks";
    } else if (tabValue === "chat" && transcript.chatThread) {
      contentToDownload = transcript.chatThread.messages
        .map((m) => `${m.role === "USER" ? "User" : "AI"}: ${m.content}`)
        .join("\n\n");
      filenameSuffix = "chat";
    } else if (transcript.transcript) {
      contentToDownload = transcript.transcript;
    }

    if (!contentToDownload) return;

    const defaultPath = `${transcript.title || "recording"}_${filenameSuffix}.txt`;

    if (window.electron && window.electron.saveFile) {
      try {
        await window.electron.saveFile(contentToDownload, defaultPath);
      } catch (err) {
        console.error("Failed to save via electron API:", err);
      }
    } else {
      const blob = new Blob([contentToDownload], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Title bar (draggable) */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
          flexShrink: 0,
        }}
      />

      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          pb: 2,
          pt: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={() => navigate("/")}>
            <BackIcon />
          </IconButton>
          <Typography
            variant="h6"
            fontWeight={600}
            noWrap
            sx={{ maxWidth: 200 }}
          >
            {transcript?.title || "Recording"}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Copy text">
            <IconButton
              size="small"
              onClick={handleCopy}
              disabled={!transcript?.transcript}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download .txt">
            <IconButton
              size="small"
              onClick={handleDownload}
              disabled={!transcript?.transcript}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Content */}
      <Box
        sx={{ flex: 1, overflowY: "auto", p: 3, bgcolor: "background.paper" }}
      >
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && transcript && (
          <Box>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              useFlexGap
              sx={{ mb: 2, flexWrap: "wrap" }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                {transcript.recordedAt
                  ? new Date(transcript.recordedAt).toLocaleString()
                  : new Date(transcript.createdAt).toLocaleString()}
              </Typography>

              {transcript.durationSeconds && (
                <Chip
                  size="small"
                  icon={<TimeIcon fontSize="small" />}
                  label={`${Math.floor(transcript.durationSeconds / 60)}m ${transcript.durationSeconds % 60}s`}
                  variant="outlined"
                  sx={{ height: 24, fontSize: "0.7rem" }}
                />
              )}
              {transcript.speakerCount ? (
                <Chip
                  size="small"
                  icon={<GroupIcon fontSize="small" />}
                  label={`${transcript.speakerCount} Speakers`}
                  variant="outlined"
                  sx={{ height: 24, fontSize: "0.7rem" }}
                />
              ) : null}
              {transcript.sentiment && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Sentiment:
                  </Typography>
                  <Chip
                    size="small"
                    label={transcript.sentiment}
                    color={
                      transcript.sentiment === "POSITIVE"
                        ? "success"
                        : transcript.sentiment === "NEGATIVE"
                          ? "error"
                          : transcript.sentiment === "MIXED"
                            ? "warning"
                            : "default"
                    }
                    variant={
                      transcript.sentiment === "NEUTRAL" ? "outlined" : "filled"
                    }
                    sx={{ fontWeight: "bold", height: 24, fontSize: "0.7rem" }}
                  />
                </Box>
              )}
            </Stack>

            {transcript.metadata?.sentimentExplanation && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 1,
                  mb: 2,
                  fontStyle: "italic",
                  borderLeft: "2px solid rgba(255,255,255,0.1)",
                  pl: 2,
                  py: 0.5,
                }}
              >
                {transcript.metadata.sentimentExplanation}
              </Typography>
            )}

            {transcript.metadata?.processingStatus === "PENDING" ? (
              <Box
                sx={{
                  mt: 6,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  p: 4,
                  bgcolor: "background.default",
                  borderRadius: 2,
                }}
              >
                <CircularProgress size={48} sx={{ mb: 2 }} />
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  AI is analyzing your recording...
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: "center", maxWidth: 400 }}
                >
                  This process might take up to 30 seconds for long transcripts.
                  The page will refresh automatically when finished.
                </Typography>
              </Box>
            ) : transcript.metadata?.processingStatus === "FAILED" ? (
              <Alert 
                severity="error" 
                sx={{ mt: 6 }}
                action={
                  <Button 
                    color="inherit" 
                    size="small" 
                    onClick={async () => {
                      if (!id) return;
                      try {
                        setLoading(true);
                        await api.reprocessTranscript(id);
                        await fetchTranscript(false);
                      } catch (e: any) {
                        setError(e.message || "Failed to restart processing");
                        setLoading(false);
                      }
                    }}
                  >
                    Retry
                  </Button>
                }
              >
                We have encountered an error while processing this transcript:{" "}
                <strong>
                  {transcript.metadata?.errorMessage ||
                    "Could not complete the process"}
                </strong>
                <br />
                <br />
                Tasks and summaries could not be generated.
              </Alert>
            ) : transcript.summary ? (
              <>
                {transcript.metadata?.processingStatus === "EXTRACTING_TASKS" && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    🤖 AI is currently extracting tasks from this transcript in the background. They will appear here shortly!
                  </Alert>
                )}
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  sx={{
                    borderBottom: 1,
                    borderColor: "divider",
                    mb: 3,
                    flexWrap: "wrap",
                  }}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  <Tab
                    label="AI Summary"
                    value="summary"
                    sx={{ fontWeight: 600 }}
                  />
                  {(transcript.documents && transcript.documents.length > 0) && (
                    <Tab label="Generated Docs" value="documents" sx={{ fontWeight: 600 }} />
                  )}
                  {transcript.metadata?.keyPoints && 
                   transcript.metadata.keyPoints.length > 0 && (
                    <Tab label="Key Points & Pain Points" value="keypoints" sx={{ fontWeight: 600 }} />
                  )}
                  <Tab
                    label="Raw Transcript"
                    value="transcript"
                    sx={{ fontWeight: 600 }}
                  />
                  {transcript.tasks && transcript.tasks.length > 0 && (
                    <Tab
                      label={`AI Tasks (${transcript.tasks.length})`}
                      value="tasks"
                      sx={{ fontWeight: 600 }}
                    />
                  )}
                  {transcript.tasks && transcript.tasks.length > 0 && (
                    <Tab
                      label="Architecture Map"
                      value="diagram"
                      sx={{ fontWeight: 600 }}
                    />
                  )}
                  {transcript.chatThread &&
                    transcript.chatThread.messages.length > 0 && (
                      <Tab
                        label="Live Chat"
                        value="chat"
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                </Tabs>

                {tabValue === "summary" && (
                  <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                    <Typography
                      variant="body1"
                      sx={{ lineHeight: 1.6, fontWeight: 500 }}
                    >
                      {transcript.summary}
                    </Typography>
                  </Box>
                )}

                {tabValue === "documents" && (
                  <Box sx={{ p: 2, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: "uppercase" }}>Generated Documents</Typography>
                    <Stack spacing={1}>
                      {(transcript.documents || []).map((doc) => (
                        <Box 
                          key={doc.id} 
                          sx={{ 
                            p: 2, 
                            border: "1px solid", 
                            borderColor: "divider", 
                            borderRadius: 1, 
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' } 
                          }}
                          onClick={() => window.open(`${import.meta.env.VITE_PLAN_AI_WEB_URL}/docs/view/${doc.id}`, '_blank')}
                        >
                          <Typography variant="subtitle2" fontWeight={600}>{doc.title}</Typography>
                          <Typography variant="caption" color="text.secondary">Status: {doc.status}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {tabValue === "keypoints" && (
                  <Box sx={{ p: 2, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: "uppercase" }}>Critical Insights & Pain Points</Typography>
                    <Stack spacing={2} component="ul" sx={{ m: 0, pl: 2 }}>
                      {(transcript.metadata?.keyPoints || []).map((point, idx) => (
                        <Typography component="li" key={idx} variant="body2" sx={{ lineHeight: 1.5 }}>
                          {point}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}

                {tabValue === "transcript" && (
                  <Box sx={{ mt: 2 }}>
                    <RenderTranscriptContent transcript={transcript} />
                  </Box>
                )}

                {tabValue === "chat" && transcript.chatThread && (
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    {transcript.chatThread.messages.map((msg, idx) => (
                      <ChatMessageItem key={idx} msg={msg} />
                    ))}
                  </Box>
                )}

                {tabValue === "tasks" &&
                  transcript.tasks &&
                  transcript.tasks.length > 0 && (
                    <>
                      {selectedTask ? (
                        <Box sx={{ animation: "fadeIn 0.2s ease-in-out" }}>
                          <Button
                            startIcon={<BackIcon />}
                            onClick={() => setSelectedTask(null)}
                            sx={{ mb: 2 }}
                            color="inherit"
                          >
                            Back to Tasks
                          </Button>
                          <Typography
                            variant="h6"
                            fontWeight={700}
                            gutterBottom
                          >
                            {selectedTask.title}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                            <Chip
                              label={String(selectedTask.status).replace(
                                "_",
                                " ",
                              )}
                              size="small"
                              color="primary"
                            />
                            <Chip
                              label={selectedTask.priority}
                              size="small"
                              color="secondary"
                            />
                          </Stack>

                          {selectedTask.description && (
                            <Box sx={{ mb: 3 }}>
                              <Typography
                                variant="subtitle2"
                                color="text.secondary"
                                gutterBottom
                                sx={{
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                Description
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{ whiteSpace: "pre-wrap" }}
                              >
                                {selectedTask.description}
                              </Typography>
                            </Box>
                          )}

                          {selectedTask.acceptanceCriteria && (
                            <Box sx={{ mb: 3 }}>
                              <Typography
                                variant="subtitle2"
                                color="text.secondary"
                                gutterBottom
                                sx={{
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                Acceptance Criteria
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{ whiteSpace: "pre-wrap" }}
                              >
                                {selectedTask.acceptanceCriteria}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {transcript.tasks.map((task) => (
                            <Box
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              sx={{
                                p: 2,
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 1,
                                bgcolor: "background.paper",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                "&:hover": {
                                  bgcolor: "action.hover",
                                  transform: "translateY(-2px)",
                                  boxShadow: 1,
                                },
                              }}
                            >
                              <Typography variant="subtitle2" fontWeight={700}>
                                {task.title}
                              </Typography>
                              {task.description && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 0.5 }}
                                  noWrap // Truncate so it looks like a list card
                                >
                                  {task.description}
                                </Typography>
                              )}
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ mt: 1.5 }}
                              >
                                <Chip
                                  label={String(task.status).replace("_", " ")}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                                <Chip
                                  label={task.priority}
                                  size="small"
                                  color="secondary"
                                  variant="outlined"
                                />
                              </Stack>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </>
                  )}

                {tabValue === "diagram" && transcript.tasks && (
                  <MermaidImgRenderer tasks={transcript.tasks} />
                )}
              </>
            ) : (
              <>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                  sx={{
                    textTransform: "uppercase",
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  Raw Transcript
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <RenderTranscriptContent transcript={transcript} />
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default TranscriptView;
