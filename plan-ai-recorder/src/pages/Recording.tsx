import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Tab,
  Tabs,
  Checkbox,
  FormControlLabel,
  FormGroup,
} from "@mui/material";
import {
  Stop as StopIcon,
  CheckCircle as DoneIcon,
  ArrowBack as BackIcon,
  Send as SendIcon,
  SmartToy as BotIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import { IconButton, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AudioRecorder } from "../services/audioRecorder";
import { loadConfig, saveConfig } from "../utils/recorderConfig";
import ReactMarkdown from "react-markdown";
import { DEEPGRAM_LANGUAGES } from "../utils/deepgramLanguages";
import type { Context, Project, AiModel, UserIntegrationSummary } from "../services/planAiApi";

type Phase = "recording" | "context_selection" | "saving" | "done" | "error";

export interface TranscriptBlock {
  id: string;
  source: "mic" | "sys";
  text: string;
}

const LANGUAGE_OPTIONS = [
  { code: "", name: "Auto-Detect Lang" },
  ...Object.entries(DEEPGRAM_LANGUAGES)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => ({ code, name })),
];

const ChatMessageItem = ({
  msg,
}: {
  msg: { role: "user" | "assistant"; content: string };
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
        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
        bgcolor:
          msg.role === "user" ? "primary.dark" : "rgba(255,255,255,0.05)",
        p: 1.5,
        pr: 5,
        borderRadius: 2,
        maxWidth: "85%",
        position: "relative",
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
            msg.role === "user" ? "primary.contrastText" : "text.secondary",
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

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = h > 0 ? [h, m, s] : [m, s];
  return parts.map((v) => String(v).padStart(2, "0")).join(":");
};

// Animated waveform bars
const Waveform: React.FC<{ active: boolean }> = ({ active }) => (
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: 40 }}>
    {Array.from({ length: 20 }).map((_, i) => (
      <Box
        key={i}
        sx={{
          width: 3,
          borderRadius: 2,
          bgcolor: "primary.main",
          transition: "height 0.15s ease",
          height: active ? `${8 + Math.random() * 28}px` : "4px",
          animation: active
            ? `wave${i % 4} ${0.8 + (i % 3) * 0.2}s ease-in-out infinite alternate`
            : "none",
          opacity: active ? 0.9 : 0.3,
          "@keyframes wave0": {
            from: { height: "4px" },
            to: { height: "32px" },
          },
          "@keyframes wave1": {
            from: { height: "8px" },
            to: { height: "24px" },
          },
          "@keyframes wave2": {
            from: { height: "12px" },
            to: { height: "36px" },
          },
          "@keyframes wave3": {
            from: { height: "6px" },
            to: { height: "20px" },
          },
          animationDelay: `${i * 0.06}s`,
        }}
      />
    ))}
  </Stack>
);

const Recording: React.FC = () => {
  const navigate = useNavigate();
  const { token, api } = useAuth();

  const config = loadConfig();

  const [phase, setPhase] = useState<Phase>("recording");
  const [isStopping, setIsStopping] = useState(false);
  const [isMicSpeaking, setIsMicSpeaking] = useState(false);
  const [isSysSpeaking, setIsSysSpeaking] = useState(false);
  const [language, setLanguage] = useState(config?.language || "");
  const [elapsed, setElapsed] = useState(0);
  const [blocks, setBlocks] = useState<TranscriptBlock[]>([]);
  const [micDelta, setMicDelta] = useState("");
  const [sysDelta, setSysDelta] = useState("");
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blobs, setBlobs] = useState<{ micBlob?: Blob; sysBlob?: Blob }>({});

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [contexts, setContexts] = useState<Context[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string>("");

  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [modelKey, setModelKey] = useState<string>("");
  const [complexityLevel, setComplexityLevel] = useState<string>("");

  const [integrations, setIntegrations] = useState<UserIntegrationSummary[]>([]);
  const [syncToJira, setSyncToJira] = useState<boolean>(false);
  const [syncToLinear, setSyncToLinear] = useState<boolean>(false);
  const [syncToTrello, setSyncToTrello] = useState<boolean>(false);
  
  const [taskStrategy, setTaskStrategy] = useState<"AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT">("AUTO");
  const [taskCount, setTaskCount] = useState<number>(5);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"summary" | "chat">("summary");
  const [liveSummary, setLiveSummary] = useState<string>("");
  const [liveSummaryLoading, setLiveSummaryLoading] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const previousTranscriptLength = useRef<number>(0);
  const summaryPollCounterRef = useRef<number>(0);
  const summaryPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typescriptNullBoxRef_ignoreThis = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef<boolean>(false);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const handleTranscriptScroll = () => {
    if (!transcriptBoxRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = transcriptBoxRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    userScrolledUp.current = distanceFromBottom > 50;
  };

  const handleSendChat = async () => {
    const msg = chatMessage.trim();
    if (!msg || !api) return;

    setChatMessage("");
    setChatHistory((p) => [...p, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const fullTranscript = blocks
        .map((b) => `${b.source === "mic" ? "User" : "Others"}: ${b.text}`)
        .join("\n");

      const combinedDelta =
        (micDelta ? `\nUser: ${micDelta}` : "") +
        (sysDelta ? `\nOthers: ${sysDelta}` : "");

      const { response } = await api.sendLiveChatMessage({
        content: msg,
        liveTranscript: fullTranscript + combinedDelta,
        contextIds: selectedContextId ? [selectedContextId] : undefined,
        history: chatHistory,
        modelKey: modelKey || undefined,
        complexityLevel: complexityLevel || undefined,
      });

      setChatHistory((p) => [...p, { role: "assistant", content: response }]);
    } catch (err) {
      setChatHistory((p) => [
        ...p,
        {
          role: "assistant",
          content: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => {
        if (chatBoxRef.current) {
          chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
      }, 50);
    }
  };

  const handleTranscript = useCallback(
    (source: "mic" | "sys", text: string, isFinal: boolean) => {
      const cleanText = text.trim();
      const lowerText = cleanText.toLowerCase();

      // OpenAI Whisper loves to hallucinate these specific phrases when fed background noise
      if (
        !token ||
        !cleanText ||
        lowerText === "thank you." ||
        lowerText === "thank you" ||
        lowerText.includes("[silence]") ||
        lowerText.includes("(silence)") ||
        lowerText.includes("[music]")
      ) {
        return;
      }

      if (isFinal) {
        setBlocks((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].source === source) {
            // Group contiguous speech from the same person into a single graphical paragraph
            const last = prev[prev.length - 1];
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              text: `${last.text} ${cleanText}`,
            };
            return updated;
          }
          // Speaker changed (Or first block), create a new bubble
          return [
            ...prev,
            { id: Math.random().toString(), source, text: cleanText },
          ];
        });
        if (source === "mic") setMicDelta("");
        if (source === "sys") setSysDelta("");
        setChunkCount((n) => n + 1);
      } else {
        if (source === "mic") setMicDelta(cleanText);
        if (source === "sys") setSysDelta(cleanText);
      }

      // Auto-scroll
      setTimeout(() => {
        if (transcriptBoxRef.current && !userScrolledUp.current) {
          transcriptBoxRef.current.scrollTop =
            transcriptBoxRef.current.scrollHeight;
        }
      }, 50);
    },
    [token],
  );

  const handleSave = useCallback(async (skipAiParam?: boolean | React.MouseEvent) => {
    const skipAi = typeof skipAiParam === 'boolean' ? skipAiParam : false;
    if (!token) return;
    setPhase("saving");

    try {
      // Build final block text
      let fullPayload = blocks
        .map((b) => `${b.source === "mic" ? "User" : "Others"}: ${b.text}`)
        .join("\n");

      if (micDelta) fullPayload += `\nUser: ${micDelta}`;
      if (sysDelta) fullPayload += `\nOthers: ${sysDelta}`;

      let targetProjectId = selectedProjectId;

      if (!targetProjectId) {
        const now = new Date();
        const hour = now.getHours();
        let timeLabel = "Meeting";
        if (hour < 12) timeLabel = "Morning Sync";
        else if (hour < 17) timeLabel = "Afternoon Sync";
        else timeLabel = "Evening Sync";

        const formattedDate = new Intl.DateTimeFormat(navigator.language || 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }).format(now);

        let aiTitle: string | null = null;
        try {
          if (!skipAi && fullPayload.length > 50) {
            const res = await api.sendLiveChatMessage({
              content: "Generate a short, concise, 3-5 word title for this meeting based on the transcript. Reply ONLY with the title string, no quotes.",
              liveTranscript: fullPayload,
            });
            if (res.response) {
              aiTitle = res.response.replace(/["']/g, "").trim();
            }
          }
        } catch (e) {
          console.warn("Failed to generate AI project title", e);
        }

        const newProject = await api.createProject({
          title: aiTitle || `${timeLabel} (${formattedDate})`,
          description:
            "Automatically created to hold tasks generated from your recent audio recording.",
        });
        targetProjectId = newProject.id;
      }

      const savedTranscript = await api.saveRecording({
        content: fullPayload,
        recordedAt: new Date().toISOString(),
        projectId: targetProjectId,
        contextIds: selectedContextId ? [selectedContextId] : undefined,
        chatHistory: chatHistory.length > 0 ? chatHistory : undefined,
        modelKey: modelKey || undefined,
        complexityLevel: complexityLevel || undefined,
        syncToJira,
        syncToLinear,
        syncToTrello,
        taskStrategy,
        taskCount,
        skipAi,
        micFile: blobs.micBlob,
        sysFile: blobs.sysBlob,
      });

      // NATIVE AUTO-SYNC: The backend now handles syncing directly during transcript creation and fully respects our checkbox selection config!
      
      // Navigate back to the home/dashboard immediately to allow async processing
      navigate(`/`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save transcript.",
      );
      setPhase("error");
    }
  }, [
    token,
    api,
    selectedProjectId,
    selectedContextId,
    blocks,
    micDelta,
    sysDelta,
    blobs,
    syncToJira,
    syncToLinear,
    syncToTrello,
    taskStrategy,
    taskCount,
  ]);

  const handleStop = useCallback(() => {
    if (!token) return;
    // Show the configuration screen so users can pick Projects
    setPhase("context_selection");
  }, [token]);

  useEffect(() => {
    if (phase === "context_selection") {
      api.listProjects().then(setProjects).catch(console.error);
      if (api.listIntegrations) {
        api.listIntegrations().then((ints) => {
          setIntegrations(ints);
          const jira = ints.find((i) => i.provider === "JIRA" && i.status === "CONNECTED");
          if (jira && (jira.metadata as Record<string, unknown>)?.defaultProjectId) {
            setSyncToJira(true);
          }
          const linear = ints.find((i) => i.provider === "LINEAR" && i.status === "CONNECTED");
          if (linear && (linear.metadata as Record<string, unknown>)?.defaultTeamId) {
            setSyncToLinear(true);
          }
          const trello = ints.find((i) => i.provider === "TRELLO" && i.status === "CONNECTED");
          if (trello && (trello.metadata as Record<string, unknown>)?.defaultBoardId) {
            setSyncToTrello(true);
          }
        }).catch(console.error);
      }
    }
  }, [phase, api]);

  // Load contexts immediately so they can be selected during recording for Live Chat
  useEffect(() => {
    if (api) {
      api.listContexts().then(setContexts).catch(console.error);
      api.listAiModels().then(setAiModels).catch(console.error);
    }
  }, [api]);

  // Live Summary Polling Loop (Every 15 seconds, mapped to 1s UI ticks)
  useEffect(() => {
    if (phase !== "recording" || !api) return;

    summaryPollTimerRef.current = setInterval(() => {
      setSummaryProgress((prev) => (prev >= 100 ? 5 : prev + 5));
      summaryPollCounterRef.current += 1;

      if (summaryPollCounterRef.current >= 15) {
        summaryPollCounterRef.current = 0;

        // Functional state updates to read the latest blocks without triggering stale closures
        setBlocks((currentBlocks) => {
          const fullPayload = currentBlocks
            .map((b) => `${b.source === "mic" ? "User" : "Others"}: ${b.text}`)
            .join("\n");

          if (fullPayload.length === 0) return currentBlocks;

          // Only trigger API if the transcript changed to save cost
          if (fullPayload.length > previousTranscriptLength.current) {
            previousTranscriptLength.current = fullPayload.length;

            setLiveSummaryLoading(true);
            setLiveSummary((prevSummary) => {
              api
                .getLiveSummary({
                  liveTranscript: fullPayload,
                  contextIds: selectedContextId
                    ? [selectedContextId]
                    : undefined,
                  modelKey: modelKey || undefined,
                  previousSummary: prevSummary || undefined,
                })
                .then((newSummary) => {
                  setLiveSummary(newSummary);
                })
                .catch((err) => {
                  console.warn("Live summary poll failed: ", err);
                })
                .finally(() => {
                  setLiveSummaryLoading(false);
                });
              return prevSummary;
            });
          }

          return currentBlocks;
        });
      }
    }, 1000); // 1s UI progress intervals

    return () => {
      if (summaryPollTimerRef.current)
        clearInterval(summaryPollTimerRef.current);
    };
  }, [phase, api, selectedContextId, modelKey]);

  // Start recorder on mount
  useEffect(() => {
    if (!token) return;

    const recorder = new AudioRecorder({
      api,
      onTranscript: handleTranscript,
      onSpeechEvent: (source, eventType) => {
        const isSpeaking = eventType === "speech_started";
        if (source === "mic") setIsMicSpeaking(isSpeaking);
        if (source === "sys") setIsSysSpeaking(isSpeaking);
      },
      onStop: () => void handleStop(),
      onError: (err) => {
        setError(err.message);
        setPhase("error");
      },
    });

    recorderRef.current = recorder;

    // Add a small delay to ensure Home page unmounted and released devices
    const startTimeout = setTimeout(() => {
      recorder.start().catch((err) => {
        console.error("[Recording] Start failed:", err);
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
    }, 1000);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed((t) => t + 1);
    }, 1000);

    return () => {
      clearTimeout(startTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      recorder.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = async () => {
    setIsStopping(true);
    if (timerRef.current) clearInterval(timerRef.current);
    const result = await recorderRef.current?.stop();
    if (result) setBlobs(result);
    setIsStopping(false);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    recorderRef.current?.changeLanguage(newLang);

    // Persist to config so next recording defaults to it
    if (config) {
      saveConfig({ ...config, language: newLang });
    }
  };

  // ── Done / Error states ───────────────────────────────────────────────────
  if (phase === "context_selection") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100%",
          minHeight: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          gap: 3,
          p: 4,
          pb: 12,
        }}
      >
        <Typography variant="h6">Recording stopped</Typography>
        <Typography variant="body2" color="text.secondary">
          Would you like to assign this recording to an existing Project to
          auto-generate tasks there?
        </Typography>

        <FormControl sx={{ minWidth: 240, mb: 2 }}>
          <InputLabel shrink>Project (Optional)</InputLabel>
          <Select
            value={selectedProjectId}
            label="Project (Optional)"
            onChange={(e) => setSelectedProjectId(e.target.value)}
            displayEmpty
          >
            <MenuItem value="">
              <em>Create new project for me</em>
            </MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="body2" color="text.secondary">
          You can also specify an optional Context to inject project knowledge
          when analyzing the recording.
        </Typography>

        <FormControl sx={{ minWidth: 240, mt: 1 }}>
          <InputLabel shrink>Context (Optional)</InputLabel>
          <Select
            value={selectedContextId}
            label="Context (Optional)"
            onChange={(e) => setSelectedContextId(e.target.value)}
            displayEmpty
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {contexts.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 240, mt: 1 }}>
          <InputLabel shrink>AI Model</InputLabel>
          <Select
            value={modelKey}
            label="AI Model"
            onChange={(e) => setModelKey(e.target.value)}
            displayEmpty
          >
            <MenuItem value="">
              <em>Default Platform Model</em>
            </MenuItem>
            {aiModels.map((m) => (
              <MenuItem key={m.key} value={m.key}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 240, mt: 1 }}>
          <InputLabel shrink>Agile Task Generation</InputLabel>
          <Select
            value={taskStrategy}
            label="Agile Task Generation"
            onChange={(e) => setTaskStrategy(e.target.value as any)}
            displayEmpty
          >
            <MenuItem value="AUTO">AI Slice & Dice (1 Epic + Auto Sub-tasks)</MenuItem>
            <MenuItem value="SINGLE_TICKET">Force 1 Mega-Ticket</MenuItem>
            <MenuItem value="SPECIFIC_COUNT">Specific fixed number of tasks</MenuItem>
          </Select>
        </FormControl>
        
        {taskStrategy === "SPECIFIC_COUNT" && (
          <TextField
            sx={{ minWidth: 240, mt: 1 }}
            label="Number of Tasks"
            type="number"
            value={taskCount}
            onChange={(e) => setTaskCount(Math.max(1, parseInt(e.target.value) || 1))}
            inputProps={{ min: 1, max: 20 }}
          />
        )}

        {/* Hid complexity level for now */}
        {false && (
          <FormControl sx={{ minWidth: 240, mt: 1 }}>
            <InputLabel shrink>Complexity Level</InputLabel>
            <Select
              value={complexityLevel}
              label="Complexity Level"
              onChange={(e) => setComplexityLevel(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <em>Default</em>
              </MenuItem>
              <MenuItem value="Beginner">Basic / Simple</MenuItem>
              <MenuItem value="Intermediate">Intermediate</MenuItem>
              <MenuItem value="Advanced">Advanced / Technical</MenuItem>
              <MenuItem value="Native">Expert / Academic</MenuItem>
            </Select>
          </FormControl>
        )}

        <FormGroup sx={{ mt: 1 }}>
          {integrations.some((i) => i.provider === "JIRA" && i.status === "CONNECTED") && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={syncToJira}
                  onChange={(e) => setSyncToJira(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Sync generated tasks to Jira
                </Typography>
              }
            />
          )}
          {integrations.some((i) => i.provider === "LINEAR" && i.status === "CONNECTED") && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={syncToLinear}
                  onChange={(e) => setSyncToLinear(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Sync generated tasks to Linear
                </Typography>
              }
            />
          )}
          {integrations.some((i) => i.provider === "TRELLO" && i.status === "CONNECTED") && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={syncToTrello}
                  onChange={(e) => setSyncToTrello(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Sync generated tasks to Trello
                </Typography>
              }
            />
          )}
        </FormGroup>

        <Stack direction="column" spacing={1.5} sx={{ mt: 2, alignItems: 'center' }}>
          <Button variant="contained" onClick={() => handleSave(false)}>
            Save & Generate Summary and Tasks
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={() => handleSave(true)}
            sx={{ 
              textDecoration: "underline", 
              color: "text.secondary", 
              fontSize: "0.8rem",
              "&:hover": { color: "text.primary" } 
            }}
          >
            Save Recording Only (Discard Tasks)
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={() => navigate("/")}
            sx={{ 
              textDecoration: "underline", 
              color: "error.main", 
              fontSize: "0.8rem",
              "&:hover": { color: "error.dark" } 
            }}
          >
            Ignore all and do not store
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "saving") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <CircularProgress size={48} />
        <Typography variant="h6">Saving recording…</Typography>
        <Typography variant="body2" color="text.secondary">
          Uploading your transcript securely.
        </Typography>
        <LinearProgress sx={{ width: "100%", maxWidth: 320 }} />
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <DoneIcon sx={{ fontSize: 64, color: "success.main" }} />
        <Typography variant="h6">Recording saved!</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Your transcript has been successfully saved.
          <br />
          Open Plan AI down in your browser to view and organize it.
        </Typography>
        <Button
          variant="contained"
          startIcon={<BackIcon />}
          onClick={() => navigate("/")}
        >
          Back to recordings
        </Button>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 3,
          p: 4,
        }}
      >
        <Alert severity="error" sx={{ width: "100%", maxWidth: 400 }}>
          {error ?? "An unexpected error occurred."}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<BackIcon />}
          onClick={() => navigate("/")}
        >
          Back to recordings
        </Button>
      </Box>
    );
  }

  // ── Active recording ──────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Drag region */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
        }}
      />

      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 3,
          py: 1.5,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          {(isMicSpeaking || isSysSpeaking) ? (
            <Waveform active={true} />
          ) : (
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "error.main",
                animation: "pulse 1.2s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.3 },
                },
              }}
            />
          )}
          <Typography variant="subtitle2" fontWeight={700}>
            {(isMicSpeaking || isSysSpeaking) ? "Speaking..." : "Listening..."}
          </Typography>
          <Chip label={formatTime(elapsed)} size="small" variant="outlined" />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Autocomplete
              size="small"
              options={LANGUAGE_OPTIONS}
              getOptionLabel={(option) => option.name}
              value={
                LANGUAGE_OPTIONS.find((o) => o.code === language) || LANGUAGE_OPTIONS[0]
              }
              onChange={(_, newValue) => {
                handleLanguageChange(newValue ? newValue.code : "");
              }}
              isOptionEqualToValue={(option, value) =>
                option.code === value.code
              }
              ListboxProps={{
                sx: { maxHeight: 250 }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    "& .MuiInputBase-root": {
                      height: 32,
                      fontSize: "0.8rem",
                      py: 0,
                    },
                    "& input": {
                      fontSize: "0.8rem",
                    },
                  }}
                />
              )}
            />
          </FormControl>

          <Button
            variant="contained"
            color="error"
            startIcon={isStopping ? <CircularProgress size={16} color="inherit" /> : <StopIcon />}
            onClick={() => void stopRecording()}
            size="small"
            disabled={isStopping}
          >
            {isStopping ? "Finalizing..." : "Stop & Save"}
          </Button>
        </Stack>
      </Stack>

      {/* Waveform */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 3,
          px: 3,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Waveform active />
      </Box>

      {/* Split layout: Transcript (Left), Live Assistant (Right) */}
      <Stack direction="row" sx={{ flex: 1, overflow: "hidden" }}>
        {/* Transcript area */}
        <Box
          sx={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 3, py: 1 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Live Transcript
            </Typography>
            {chunkCount > 0 && (
              <Chip
                label={`${chunkCount} segment${chunkCount !== 1 ? "s" : ""}`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>

          <Divider sx={{ opacity: 0.3 }} />

          <Box
            ref={transcriptBoxRef}
            onScroll={handleTranscriptScroll}
            sx={{
              flex: 1,
              overflowY: "auto",
              px: 3,
              py: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {blocks.length === 0 && !micDelta && !sysDelta && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: "italic" }}
              >
                Start speaking, your transcript will appear here in real-time…
              </Typography>
            )}

            {blocks.map((block) => (
              <Box key={block.id}>
                <Typography
                  variant="caption"
                  color={block.source === "mic" ? "primary.main" : "secondary.main"}
                  sx={{ fontWeight: "bold" }}
                >
                  {block.source === "mic" ? "Me" : "Others"}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    lineHeight: 1.8,
                    color: "text.primary",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {block.text}
                </Typography>
              </Box>
            ))}

            {micDelta && (
              <Box>
                <Typography
                  variant="caption"
                  color="primary.main"
                  sx={{ fontWeight: "bold" }}
                >
                  Me
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    lineHeight: 1.8,
                    color: "text.primary",
                    whiteSpace: "pre-wrap",
                    opacity: 0.6,
                  }}
                >
                  {micDelta}
                </Typography>
              </Box>
            )}

            {sysDelta && (
              <Box>
                <Typography
                  variant="caption"
                  color="secondary.main"
                  sx={{ fontWeight: "bold" }}
                >
                  Others
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    lineHeight: 1.8,
                    color: "text.primary",
                    whiteSpace: "pre-wrap",
                    opacity: 0.6,
                  }}
                >
                  {sysDelta}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Live Meeting Assistant Sidebar */}
        <Box
          sx={{
            width: 380,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            justifyContent="flex-start"
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <BotIcon fontSize="small" color="primary" />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                color: "text.primary",
              }}
            >
              Live Assistant
            </Typography>
          </Stack>

          {/* Context and Logic Selectors */}
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <FormControl fullWidth size="small">
              <Select
                value={selectedContextId}
                onChange={(e) => setSelectedContextId(e.target.value)}
                displayEmpty
                sx={{ fontSize: "0.8rem", height: 32 }}
              >
                <MenuItem value="" sx={{ fontSize: "0.8rem" }}>
                  <em>No Context DB</em>
                </MenuItem>
                {contexts.map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontSize: "0.8rem" }}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
              <Select
                value={modelKey}
                onChange={(e) => setModelKey(e.target.value)}
                displayEmpty
                sx={{ fontSize: "0.8rem", height: 32 }}
              >
                <MenuItem value="" sx={{ fontSize: "0.8rem" }}>
                  <em>Default AI</em>
                </MenuItem>
                {aiModels.map((m) => (
                  <MenuItem
                    key={m.key}
                    value={m.key}
                    sx={{ fontSize: "0.8rem" }}
                  >
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
              <Select
                value={complexityLevel}
                onChange={(e) => setComplexityLevel(e.target.value)}
                displayEmpty
                sx={{ fontSize: "0.8rem", height: 32 }}
              >
                <MenuItem value="" sx={{ fontSize: "0.8rem" }}>
                  <em>Default Complexity</em>
                </MenuItem>
                <MenuItem value="Beginner" sx={{ fontSize: "0.8rem" }}>
                  Basic / Simple
                </MenuItem>
                <MenuItem value="Intermediate" sx={{ fontSize: "0.8rem" }}>
                  Intermediate
                </MenuItem>
                <MenuItem value="Advanced" sx={{ fontSize: "0.8rem" }}>
                  Advanced / Technical
                </MenuItem>
                <MenuItem value="Native" sx={{ fontSize: "0.8rem" }}>
                  Expert / Academic
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              variant="fullWidth"
              sx={{ minHeight: 40 }}
            >
              <Tab
                label="Summary & Tasks"
                value="summary"
                sx={{ fontSize: "0.75rem", minHeight: 40, py: 0 }}
              />
              <Tab
                label="Live Chat"
                value="chat"
                sx={{ fontSize: "0.75rem", minHeight: 40, py: 0 }}
              />
            </Tabs>
          </Box>

          {/* Tab 1: AI Summary & Tasks */}
          {activeTab === "summary" && (
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                position: "relative",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                {liveSummaryLoading && (
                  <Typography
                    variant="caption"
                    sx={{ color: "primary.main", fontStyle: "italic" }}
                  >
                    Updating...
                  </Typography>
                )}
                <CircularProgress
                  variant="determinate"
                  value={summaryProgress}
                  size={16}
                  thickness={5}
                />
              </Box>
              {liveSummary ? (
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
                    color: "text.secondary",
                  }}
                >
                  <ReactMarkdown>{liveSummary}</ReactMarkdown>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: "center", fontStyle: "italic", mt: 4 }}
                >
                  Waiting for initial data... The summary will appear
                  automatically after ~20 seconds of conversation.
                </Typography>
              )}
            </Box>
          )}

          {/* Tab 2: Live Chat */}
          {activeTab === "chat" && (
            <>
              <Box
                ref={chatBoxRef}
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {chatHistory.length === 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: "center", fontStyle: "italic", mt: 4 }}
                  >
                    Ask questions about the meeting in real-time.
                  </Typography>
                )}

                {chatHistory.map((msg, idx) => (
                  <ChatMessageItem key={idx} msg={msg} />
                ))}

                {chatLoading && (
                  <Box sx={{ alignSelf: "flex-start", p: 1.5 }}>
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ fontStyle: "italic" }}
                    >
                      Thinking...
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ p: 2, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask a question..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    multiline
                    maxRows={3}
                    sx={{
                      "& .MuiInputBase-root": { fontSize: "0.875rem", p: 1 },
                    }}
                  />
                  <IconButton
                    color="primary"
                    onClick={() => void handleSendChat()}
                    disabled={chatLoading || !chatMessage.trim()}
                    sx={{ alignSelf: "flex-end", mb: 0.5 }}
                  >
                    <SendIcon />
                  </IconButton>
                </Stack>
              </Box>
            </>
          )}
        </Box>
      </Stack>

      {/* Config chips */}
      {config && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            px: 3,
            py: 1.5,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexWrap: "wrap",
          }}
        >
          {config.systemSourceId && (
            <Chip label="System audio + mic" size="small" variant="outlined" />
          )}
        </Stack>
      )}
    </Box>
  );
};

export default Recording;
