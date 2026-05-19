import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Button,
  Divider,
  Tabs,
  Tab,
  Alert,
  Chip,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Check as CheckIcon,
  AccessTime as TimeIcon,
  Group as GroupIcon,
  Place as LocationIcon,
} from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { useGetTranscriptQuery } from "../store/apis/transcriptApi";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";
import ReactMarkdown from "react-markdown";
import MermaidRenderer from "../components/common/MermaidRenderer";

const ChatMessageItem = ({ msg }: { msg: { role: string; content: string } }) => {
  const [copied, setCopied] = useState(false);
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

const RecordingDetail: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [pollingInterval, setPollingInterval] = useState(0);

  const {
    data: transcript,
    isLoading,
    error,
  } = useGetTranscriptQuery(recordingId || "", {
    skip: !recordingId,
    pollingInterval,
  });

  React.useEffect(() => {
    const isPending =
      transcript?.data?.metadata?.processingStatus === "PENDING";
    setPollingInterval(isPending ? 3000 : 0);
  }, [transcript]);

  interface RawTask {
    id?: string;
    title?: string;
    status?: string;
    dependencies?: string[];
  }

  // Generate dynamic mindmap from tasks
  const generateMermaidFromTasks = () => {
    // For standalone recordings, tasks are not stored in the DB as Task entities,
    // but they are auto-injected into metadata.rawTasks by the backend.
    const metadata = transcript?.data?.metadata;
    const rawMetaTasks = metadata?.rawTasks as RawTask[] | undefined;
    const tasks = transcript?.data?.tasks?.length ? transcript.data.tasks : rawMetaTasks;
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
    tasks.forEach((t: RawTask, index: number) => {
      // In rough metadata tasks, we might need a fallback ID if 'id' is undefined.
      const rawId = t.id || `raw-${index}`;
      const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, "");
      nodes.set(t.title?.toLowerCase() || index.toString(), cleanId);
      const title = (t.title || "Untitled").replace(/"/g, "'").replace(/\n/g, " ");
      code += `  ${cleanId}["[${String(t.status).replace("_", " ")}]<br/>${title}"];\n`;
      if (t.status && statusColors[t.status]) {
        code += `  style ${cleanId} ${statusColors[t.status]},stroke:#fff,stroke-width:2px,color:#fff;\n`;
      }
    });

    tasks.forEach((t: RawTask, index: number) => {
      // Find clean ID for this current task
      const cleanId = nodes.get(t.title?.toLowerCase() || index.toString());
      if (t.dependencies && t.dependencies.length > 0) {
        t.dependencies.forEach((depIdOrTitle: string) => {
          // dependencies from transcript extraction could be titles or IDs
          const depNode = nodes.get(depIdOrTitle?.toLowerCase()) || nodes.get(depIdOrTitle);
          if (depNode && cleanId) {
            code += `  ${depNode} --> ${cleanId};\n`;
          }
        });
      }
    });
    return code;
  };

  const generatedChart = generateMermaidFromTasks();

  const [copying, setCopying] = useState(false);
  const [tabValue, setTabValue] = useState("summary");

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setTabValue(newValue);
  };

  const handleCopy = async () => {
    const text = transcript?.data?.transcript;
    if (!text) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      dispatch(
        setToastMessage({ message: "Transcript copied to clipboard!", severity: "success" }),
      );
    } catch (err) {
      console.error("Failed to copy text", err);
      dispatch(setToastMessage({ message: "Failed to copy transcript", severity: "error" }));
    } finally {
      setTimeout(() => setCopying(false), 2000);
    }
  };

  const handleDownload = () => {
    const text = transcript?.data?.transcript;
    if (!text) return;

    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${transcript.data?.title || "transcript"}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  if (isLoading) {
    return (
      <SidebarLayout>
        <Box sx={{ display: "flex", justifyContent: "center", p: 4, mt: 8 }}>
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  if (error || !transcript) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4, mt: 4 }}>
          <Button startIcon={<BackIcon />} onClick={() => navigate("/recordings")} sx={{ mb: 2 }}>
            Back to Recordings
          </Button>
          <Typography color="error">Failed to load the recording details.</Typography>
        </Box>
      </SidebarLayout>
    );
  }

  const location = transcript.data?.metadata?.location;

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton onClick={() => navigate("/recordings")}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography variant="h4" fontWeight={800} sx={{ wordBreak: "break-word" }}>
                {transcript.data?.title || "Untitled Recording"}
              </Typography>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                useFlexGap
                sx={{ mt: 0.5, flexWrap: "wrap" }}
              >
                <Typography color="text.secondary" variant="body2" sx={{ mr: 1 }}>
                  Recorded on{" "}
                  {transcript.data?.recordedAt
                    ? new Date(transcript.data.recordedAt).toLocaleString()
                    : transcript.data?.createdAt
                      ? new Date(transcript.data.createdAt).toLocaleString()
                      : "Unknown"}
                </Typography>

                {transcript.data?.durationSeconds && (
                  <Chip
                    size="small"
                    icon={<TimeIcon fontSize="small" />}
                    label={`${Math.floor(transcript.data.durationSeconds / 60)}m ${transcript.data.durationSeconds % 60}s`}
                    variant="outlined"
                  />
                )}
                {transcript.data?.speakerCount ? (
                  <Chip
                    size="small"
                    icon={<GroupIcon fontSize="small" />}
                    label={`${transcript.data.speakerCount} Speakers`}
                    variant="outlined"
                  />
                ) : null}
                {location && (
                  <Chip
                    size="small"
                    icon={<LocationIcon fontSize="small" />}
                    label={`${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                    variant="outlined"
                    component="a"
                    href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                    target="_blank"
                    clickable
                  />
                )}
                {transcript.data?.sentiment && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Sentiment:
                    </Typography>
                    <Chip
                      size="small"
                      label={transcript.data.sentiment}
                      color={
                        transcript.data.sentiment === "POSITIVE"
                          ? "success"
                          : transcript.data.sentiment === "NEGATIVE"
                            ? "error"
                            : transcript.data.sentiment === "MIXED"
                              ? "warning"
                              : "default"
                      }
                      variant={transcript.data.sentiment === "NEUTRAL" ? "outlined" : "filled"}
                      sx={{ fontWeight: "bold" }}
                    />
                  </Box>
                )}
              </Stack>

            {transcript.data?.metadata?.sentimentExplanation && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 1,
                    fontStyle: "italic",
                    borderLeft: "2px solid",
                    borderColor: "divider",
                    pl: 2,
                    py: 0.5,
                  }}
                >
                  {transcript.data.metadata.sentimentExplanation}
                </Typography>
              )}
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<CopyIcon />}
              onClick={handleCopy}
              disabled={copying || !transcript.data?.transcript}
            >
              {copying ? "Copied!" : "Copy Text"}
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={!transcript.data?.transcript}
            >
              Download .txt
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 4 }} />

        {/* Content */}
        <Card elevation={0} sx={{ border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: { xs: 2, md: 4 } }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              {transcript.data?.summary ? "AI Summary & Transcript" : "Transcript"}
            </Typography>

            {transcript.data?.metadata?.processingStatus ===
            "PENDING" ? (
              <Box
                sx={{
                  mt: 2,
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
                  This process might take up to 30 seconds for long transcripts. The page will
                  refresh automatically when finished.
                </Typography>
              </Box>
            ) : transcript.data?.metadata?.processingStatus ===
              "FAILED" ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                The background AI worker encountered an error while processing this transcript.
                Tasks and summaries could not be generated.
              </Alert>
            ) : transcript.data?.summary ? (
              <>
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
                >
                  <Tab label="AI Summary" value="summary" sx={{ fontWeight: 600 }} />
                  {(transcript.data?.documents && transcript.data.documents.length > 0) && (
                    <Tab label="Generated Docs" value="documents" sx={{ fontWeight: 600 }} />
                  )}
                  {transcript.data?.metadata?.keyPoints && 
                   transcript.data.metadata.keyPoints.length > 0 && (
                    <Tab label="Key Points" value="keypoints" sx={{ fontWeight: 600 }} />
                  )}
                  <Tab label="Raw Transcript" value="transcript" sx={{ fontWeight: 600 }} />
                  {generatedChart && (
                    <Tab label="Architecture Map" value="architecture" sx={{ fontWeight: 600 }} />
                  )}
                  {transcript.data.chatThread && transcript.data.chatThread.messages.length > 0 && (
                    <Tab label="Live Chat" value="chat" sx={{ fontWeight: 600 }} />
                  )}
                </Tabs>

                {tabValue === "summary" && (
                  <Box sx={{ p: 3, bgcolor: "action.hover", borderRadius: 2 }}>
                    <Typography variant="body1" sx={{ lineHeight: 1.7, fontSize: "1.05rem" }}>
                      {transcript.data.summary}
                    </Typography>
                  </Box>
                )}

                {tabValue === "documents" && (
                  <Box sx={{ p: 3, bgcolor: "background.paper", borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Generated Documents</Typography>
                    <Stack spacing={2}>
                      {(transcript.data?.documents || []).map((doc) => (
                        <Card key={doc.id} variant="outlined" sx={{ '&:hover': { bgcolor: 'action.hover', cursor: 'pointer' } }} onClick={() => navigate(`/docs/view/${doc.id}`)}>
                          <CardContent>
                            <Typography variant="subtitle1" fontWeight={600}>{doc.title}</Typography>
                            <Typography variant="body2" color="text.secondary">Status: {doc.status}</Typography>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </Box>
                )}

                {tabValue === "keypoints" && (
                  <Box sx={{ p: 3, bgcolor: "background.paper", borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Critical Insights & Pain Points</Typography>
                    <Stack spacing={2} component="ul" sx={{ m: 0, pl: 2 }}>
                      {(transcript.data?.metadata?.keyPoints || []).map((point, idx) => (
                        <Typography component="li" key={idx} variant="body1" sx={{ lineHeight: 1.6 }}>
                          {point}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}

                {tabValue === "transcript" && (
                  <Typography
                    variant="body1"
                    sx={{
                      whiteSpace: "pre-wrap",
                      color: "text.primary",
                      lineHeight: 1.8,
                      fontSize: "1.05rem",
                    }}
                  >
                    {transcript.data.transcript || "No transcript content available."}
                  </Typography>
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

                {tabValue === "chat" && transcript.data.chatThread && (
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    {transcript.data.chatThread.messages.map((msg, idx) => (
                      <ChatMessageItem key={idx} msg={msg} />
                    ))}
                  </Box>
                )}
              </>
            ) : (
              <>
                {transcript.data?.transcript ? (
                  <Typography
                    variant="body1"
                    sx={{
                      whiteSpace: "pre-wrap",
                      color: "text.primary",
                      lineHeight: 1.8,
                      fontSize: "1.05rem",
                    }}
                  >
                    {transcript.data.transcript}
                  </Typography>
                ) : (
                  <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                    No transcript text generated yet.
                  </Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </SidebarLayout>
  );
};

export default RecordingDetail;
