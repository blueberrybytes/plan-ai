import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  TouchableOpacity,
  Alert,
  FlatList,
} from "react-native";
import { Buffer } from "buffer";
import {
  Text,
  IconButton,
  useTheme,
  Surface,
  Button,
  TextInput,
  List,
  Switch,
  Chip,
  ActivityIndicator,
  Divider,
  Portal,
  Modal,
  SegmentedButtons,
  ProgressBar,
} from "react-native-paper";
import Markdown from "react-native-markdown-display";
import LiveAudioStream from "react-native-live-audio-stream";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File, Paths, Directory } from "expo-file-system";
import notifee, { AndroidImportance } from "@notifee/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Project, Context } from "@/services/planAiApi";
import * as Location from "expo-location";

// Using global object so it survives React Native Fast Refresh (HMR) without dropping native locks
const g = global as any;

// Register the Notifee daemon globally so Android allows long-form background execution
notifee.registerForegroundService(() => {
  return new Promise((resolve) => {
    g.__resolveForegroundService = resolve;
  });
});

type Phase = "recording" | "context_selection" | "saving" | "done" | "error";

const PulsingRecordButton = ({
  onPress,
  theme,
}: {
  onPress: () => void;
  theme: any;
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [scale]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ marginTop: 40, alignItems: "center" }}
    >
      <Animated.View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: theme.colors.primary,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 10,
          transform: [{ scale }],
        }}
      >
        <IconButton
          icon="microphone"
          size={48}
          iconColor="#ffffff"
          style={{ margin: 0 }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const WaveformBox = ({
  isRecording,
  theme,
  audioLevel = 0,
}: {
  isRecording: boolean;
  theme: any;
  audioLevel?: number;
}) => {
  const anims = useRef(
    Array.from({ length: 15 }).map(() => new Animated.Value(4)),
  ).current;

  useEffect(() => {
    if (!isRecording) {
      anims.forEach((anim) => {
        anim.stopAnimation();
        Animated.timing(anim, {
          toValue: 4,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    const animations = anims.map((anim, i) => {
      // Gaussian/Sine distribution so center is tallest
      const positionWeight = Math.sin((i / (anims.length - 1)) * Math.PI);
      const randomJitter = Math.random() * 0.4 + 0.8; // subtle movement even if sound is constant
      const targetHeight = 4 + audioLevel * 40 * positionWeight * randomJitter;

      return Animated.timing(anim, {
        toValue: Math.max(4, Math.min(targetHeight, 50)), // cap max height
        duration: 120, // fast fluid response
        useNativeDriver: false,
      });
    });

    Animated.parallel(animations).start();
  }, [audioLevel, isRecording]);

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", height: 40, gap: 4 }}
    >
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: anim,
            backgroundColor: isRecording
              ? theme.colors.error
              : theme.colors.primary,
            borderRadius: 2,
            opacity: isRecording ? 0.9 : 0.3,
          }}
        />
      ))}
    </View>
  );
};

const LANGUAGE_OPTIONS = [
  { code: "", name: "Auto-Detect Lang" },
  { code: "ar", name: "Arabic" },
  { code: "be", name: "Belarusian" },
  { code: "bn", name: "Bengali" },
  { code: "bs", name: "Bosnian" },
  { code: "bg", name: "Bulgarian" },
  { code: "ca", name: "Catalan" },
  { code: "zh-HK", name: "Chinese (Cantonese, Traditional)" },
  { code: "zh", name: "Chinese (Mandarin, Simplified)" },
  { code: "zh-TW", name: "Chinese (Mandarin, Traditional)" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "nl-BE", name: "Flemish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "de-CH", name: "German (Switzerland)" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "kn", name: "Kannada" },
  { code: "ko", name: "Korean" },
  { code: "lv", name: "Latvian" },
  { code: "lt", name: "Lithuanian" },
  { code: "mk", name: "Macedonian" },
  { code: "ms", name: "Malay" },
  { code: "mr", name: "Marathi" },
  { code: "no", name: "Norwegian" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sr", name: "Serbian" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "es", name: "Spanish" },
  { code: "sv", name: "Swedish" },
  { code: "tl", name: "Tagalog" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
];

export default function RecordScreen() {
  const [phase, setPhase] = useState<Phase>("recording");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [audioBackupPath, setAudioBackupPath] = useState<string | null>(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isWsConnected, setIsWsConnected] = useState(true);
  const [meetingLocation, setMeetingLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);

  const [language, setLanguage] = useState("");
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState("");

  const filteredLanguages = LANGUAGE_OPTIONS.filter((lang) =>
    lang.name.toLowerCase().includes(languageSearchQuery.toLowerCase()),
  );

  const wsRef = useRef<WebSocket | null>(null);
  const theme = useTheme();
  const router = useRouter();
  const { api } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<"transcript" | "summary" | "chat">(
    "transcript",
  );

  // Chat state
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollViewRef = useRef<ScrollView>(null);

  // Summary state
  const [liveSummary, setLiveSummary] = useState<string>("");
  const [liveSummaryLoading, setLiveSummaryLoading] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const previousTranscriptLength = useRef<number>(0);
  const summaryPollCounterRef = useRef<number>(0);
  const summaryPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Context Selection States
  const [title, setTitle] = useState("");
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [syncToJira, setSyncToJira] = useState(false);
  const [syncToLinear, setSyncToLinear] = useState(false);
  const [syncToTrello, setSyncToTrello] = useState(false);
  const [syncToNotion, setSyncToNotion] = useState(false);
  const [hasJira, setHasJira] = useState(false);
  const [hasLinear, setHasLinear] = useState(false);
  const [hasTrello, setHasTrello] = useState(false);
  const [hasNotion, setHasNotion] = useState(false);

  const [taskStrategy, setTaskStrategy] = useState<
    "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT"
  >("AUTO");
  const [taskCount, setTaskCount] = useState<number>(5);

  const [projects, setProjects] = useState<Project[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Refs for polling access without stale closures
  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const selectedContextIdsRef = useRef(selectedContextIds);
  useEffect(() => {
    selectedContextIdsRef.current = selectedContextIds;
  }, [selectedContextIds]);

  const liveSummaryRef = useRef(liveSummary);
  useEffect(() => {
    liveSummaryRef.current = liveSummary;
  }, [liveSummary]);

  // Live Summary Polling Loop (Every 15 seconds, mapped to 1s UI ticks)
  useEffect(() => {
    if (phase !== "recording" || !api) return;

    summaryPollTimerRef.current = setInterval(() => {
      setSummaryProgress((prev) => (prev >= 100 ? 5 : prev + 5));
      summaryPollCounterRef.current += 1;

      if (summaryPollCounterRef.current >= 15) {
        summaryPollCounterRef.current = 0;

        const currentTranscript = transcriptRef.current;
        if (currentTranscript.length === 0) return;

        if (currentTranscript.length > previousTranscriptLength.current) {
          previousTranscriptLength.current = currentTranscript.length;

          setLiveSummaryLoading(true);
          const prevSummary = liveSummaryRef.current;

          api
            .getLiveSummary({
              liveTranscript: currentTranscript,
              contextIds:
                selectedContextIdsRef.current?.length > 0
                  ? selectedContextIdsRef.current
                  : undefined,
              previousSummary: prevSummary || undefined,
            })
            .then((newSummary) => {
              if (newSummary) setLiveSummary(newSummary);
            })
            .catch((e) => console.warn("Live summary poll failed: ", e))
            .finally(() => setLiveSummaryLoading(false));
        }
      }
    }, 1000);

    return () => {
      if (summaryPollTimerRef.current)
        clearInterval(summaryPollTimerRef.current);
    };
  }, [phase, api]);

  const getDefaultMeetingTitle = () => {
    const now = new Date();
    const hour = now.getHours();
    let timeLabel = "Meeting";
    if (hour < 12) timeLabel = "Morning Sync";
    else if (hour < 17) timeLabel = "Afternoon Sync";
    else timeLabel = "Evening Sync";
    const formattedDate = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
    return `${timeLabel} (${formattedDate})`;
  };

  const handleSendChat = async () => {
    const msg = chatMessage.trim();
    if (!msg || !api) return;

    setChatMessage("");
    setChatHistory((p) => [...p, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const fullTranscript = transcriptRef.current;

      const { response } = await api.sendLiveChatMessage({
        content: msg,
        liveTranscript: fullTranscript,
        contextIds:
          selectedContextIdsRef.current?.length > 0
            ? selectedContextIdsRef.current
            : undefined,
        history: chatHistory,
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
        chatScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  useEffect(() => {
    if (phase === "context_selection" && transcript && !title) {
      setIsGeneratingTitle(true);
      api
        .sendLiveChatMessage({
          content:
            "Generate a short, concise, 3-5 word title for this meeting based on the transcript. Reply ONLY with the title string, no quotes.",
          liveTranscript: transcript,
        })
        .then((res) => {
          if (res.response) {
            setTitle(res.response.replace(/["']/g, "").trim());
          }
        })
        .catch(() => {
          // Ignore error
        })
        .finally(() => {
          setIsGeneratingTitle(false);
        });
    }
  }, [phase, transcript]);

  useEffect(() => {
    let chunkCount = 0;

    // Strict linear promise chain to prevent disk race conditions
    let writeQueue = Promise.resolve();

    LiveAudioStream.on("data", (data: string) => {
      chunkCount++;
      if (chunkCount % 20 === 0) {
        console.log(
          `🎤 Captured ${chunkCount} chunks. Last chunk length:`,
          data.length,
        );
      }

      // Manually append PCM payload natively to disk over JS bridge
      writeQueue = writeQueue
        .then(() => {
          const backupFile = new File(Paths.document, "emergency_backup.wav");
          return backupFile.write(data, { encoding: "base64", append: true });
        })
        .catch((e) => console.warn("WAV append failed", e));

      // Compute audio volume natively from Base64 PCM Buffer (16-bit)
      if (chunkCount % 2 === 0) {
        try {
          const pcm = Buffer.from(data, "base64");
          let sum = 0;
          let maxAmp = 0;
          for (let i = 0; i < pcm.length; i += 2) {
            const amp = Math.abs(pcm.readInt16LE(i));
            sum += amp;
            if (amp > maxAmp) maxAmp = amp;
          }
          const avg = sum / (pcm.length / 2);
          const level = Math.min(1, avg / 6000); // Normalize 0 to 1
          setCurrentVolume(level);

          if (chunkCount % 20 === 0) {
            console.log(
              `[AUDIO DEBUG] Chunk ${chunkCount} | MaxAmp: ${maxAmp} | Avg: ${Math.round(avg)} | Vol: ${level.toFixed(2)}`,
            );
          }
        } catch (e) {
          console.error("[AUDIO DEBUG] Error parsing chunk:", e);
        }
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "input_audio",
            audio: data,
            source: "mic",
          }),
        );
      }
    });

    return () => {
      if (isRecording) {
        stopAudioStream();
      }
    };
  }, []);

  useEffect(() => {
    if (phase === "context_selection") {
      setIsLoadingMetadata(true);
      Promise.all([
        api.listProjects().catch(() => []),
        api.listContexts().catch(() => []),
        api.listIntegrations().catch(() => []),
      ])
        .then(([projs, ctxs, ints]) => {
          setProjects(projs as Project[]);
          setContexts(ctxs as Context[]);

          const jira = (ints as any[]).find(
            (i) => i.provider === "JIRA" && i.status === "CONNECTED",
          );
          const linear = (ints as any[]).find(
            (i) => i.provider === "LINEAR" && i.status === "CONNECTED",
          );
          const trello = (ints as any[]).find(
            (i) => i.provider === "TRELLO" && i.status === "CONNECTED",
          );
          const notion = (ints as any[]).find(
            (i) => i.provider === "NOTION" && i.status === "CONNECTED",
          );
          if (jira) setHasJira(true);
          if (linear) setHasLinear(true);
          if (trello) setHasTrello(true);
          if (notion) setHasNotion(true);

          // As per UX requirement, default to OFF on mobile to avoid accidental spam
          setSyncToJira(false);
          setSyncToLinear(false);
          setSyncToTrello(false);
          setSyncToNotion(false);
        })
        .finally(() => {
          setIsLoadingMetadata(false);
        });
    }
  }, [phase, api]);

  const connectWebSocket = async () => {
    try {
      const ws = await api.startAudioStream(language);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket Connected!");
        setIsWsConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          console.log("⬅️ WS MSG RCVD:", event.data);
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript") {
            const speakerStr = msg.isFinal
              ? `[${msg.speaker || "Speaker"}]`
              : "";
            if (msg.isFinal) {
              setTranscript(
                (prev) => prev + `${prev ? "\n" : ""}${speakerStr} ${msg.text}`,
              );
              setInterim("");
            } else {
              setInterim(`${speakerStr} ${msg.text}`);
            }
          } else if (msg.type === "speech_started") {
            setIsSpeaking(true);
          } else if (msg.type === "utterance_end") {
            setIsSpeaking(false);
          }
        } catch (e) {
          console.error("[WS Data Handling Error]", e);
        }
      };

      ws.onclose = () => {
        console.log(
          "WS Stream Closed (Network disconnected). Local WAV continues recording.",
        );
        setIsWsConnected(false);
        wsRef.current = null;
      };
    } catch (e) {
      console.warn("Failed to initialize WS (offline):", e);
      // ws.onclose already sets isWsConnected=false — no alert needed here
      setIsWsConnected(false);
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setLanguageMenuVisible(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(
        `[AudioRecorder] Requesting dynamic language change to: ${newLang}`,
      );
      wsRef.current.send(
        JSON.stringify({ type: "change_language", language: newLang }),
      );
    }
  };

  const startRecording = async () => {
    console.log("🎙️ startRecording pressed");
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        alert("Microphone permission is required to record the meeting.");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: true,
      });

      // Capture location asynchronously in background without blocking audio start
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            setMeetingLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
            });
            console.log("📍 Location captured:", loc.coords);
          }
        } catch (e) {
          console.warn("Failed to capture location:", e);
        }
      })();

      setTranscript("");
      setInterim("");
      setPhase("recording");

      if (Platform.OS === "android") {
        try {
          const channelId = await notifee.createChannel({
            id: "recording",
            name: "Active Recording",
            importance: AndroidImportance.HIGH,
          });

          await notifee.displayNotification({
            title: "Plan AI",
            body: "Meeting is actively recording in the background",
            android: {
              channelId,
              asForegroundService: true,
              color: "#0284c7",
              ongoing: true,
            },
          });
        } catch (err) {
          console.warn("Failed to start Android Foreground Daemon:", err);
        }
      }

      try {
        const backupFile = new File(Paths.document, "emergency_backup.wav");
        // Rebuild perfectly clean 24000Hz WAV Header to overwrite previous audio trace
        backupFile.write(
          "UklGRv////9XQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0Yf////8=",
          { encoding: "base64" },
        );
        console.log(
          "🛑 Initialized WAV header for emergency_backup.wav (24000Hz)",
        );
      } catch (err) {
        console.warn("Failed to write WAV header", err);
      }

      await connectWebSocket();

      if (!g.__isAudioInitialized) {
        LiveAudioStream.init({
          sampleRate: 24000,
          channels: 1,
          bitsPerSample: 16,
          audioSource: 1, // 1 = MIC (Captures ambient room audio instead of aggressively isolating the user's voice like VOICE_RECOGNITION does)
          bufferSize: 4096,
          wavFile: "emergency_backup.wav",
        });
        g.__isAudioInitialized = true;
        console.log("🛑 Global Java AudioRecord Singleton Initialized.");
      }

      LiveAudioStream.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording setup", err);
    }
  };

  const stopAudioStream = async (): Promise<boolean> => {
    let hasData = transcript.length > 0;
    try {
      console.log("🛑 Attempting to stop stream. isRecording:", isRecording);
      if (isRecording) {
        LiveAudioStream.stop(); // CRITICAL: Do NOT await this! The Android native module has a bug where it NEVER resolves the promise.
        setIsRecording(false);
        console.log("🛑 LiveAudioStream stopped successfully.");

        if (Platform.OS === "android") {
          try {
            if (g.__resolveForegroundService) {
              g.__resolveForegroundService();
              g.__resolveForegroundService = null;
            }
            await notifee.stopForegroundService();
          } catch (err) {
            console.warn("Failed to stop Android Foreground Daemon", err);
          }
        }

        const backupFile = new File(Paths.document, "emergency_backup.wav");
        console.log(
          "🛑 Explicit FileSystem check resolving info...",
          backupFile.uri,
        );
        const exists = backupFile.exists;
        const size = backupFile.size;
        console.log("🛑 File Info:", { exists, size });

        if (exists && size > 0) {
          setAudioBackupPath(backupFile.uri);
          hasData = true;
        }
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return hasData;
    } catch (e) {
      console.error("🛑 FATAL ERROR IN STOP:", e);
      return hasData;
    }
  };

  const handleStopRecordingBtn = async () => {
    const hasData = await stopAudioStream();
    if (hasData) {
      setPhase("context_selection");
    } else {
      router.back();
    }
  };

  const saveMeeting = async (skipAi: boolean = false) => {
    setPhase("saving");
    try {
      console.log("📤 Preparing upload. audioBackupPath is:", audioBackupPath);
      const micFileObj = audioBackupPath
        ? {
            uri: audioBackupPath.startsWith("file://")
              ? audioBackupPath
              : `file://${audioBackupPath}`,
            name: "emergency_backup.wav",
            type: "audio/wav",
          }
        : undefined;
      console.log(
        "📦 File Object being sent to FormData:",
        JSON.stringify(micFileObj),
      );

      await api.saveRecording({
        content: transcript,
        title: title || getDefaultMeetingTitle(),
        recordedAt: new Date().toISOString(),
        projectId: selectedProjectId || undefined,
        contextIds:
          selectedContextIds.length > 0 ? selectedContextIds : undefined,
        syncToJira,
        syncToLinear,
        syncToTrello,
        syncToNotion,
        taskStrategy,
        taskCount,
        skipAi,
        micFile: micFileObj as unknown as File,
        location: meetingLocation ?? undefined,
      });
      setPhase("done");
      setTimeout(() => {
        router.replace("/(drawer)");
      }, 1500);
    } catch (e: unknown) {
      console.error("Network save failed, falling back to local storage...", e);

      try {
        const syncDir = new Directory(Paths.document, "pending_sync");
        if (!syncDir.exists) {
          syncDir.create();
        }

        const uuid = `sync_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const jsonFile = new File(syncDir, `${uuid}.json`);

        let newAudioPath = null;
        if (audioBackupPath) {
          const backupFile = new File(audioBackupPath);
          const syncAudioFile = new File(syncDir, `${uuid}.wav`);
          backupFile.copy(syncAudioFile);
          newAudioPath = syncAudioFile.uri;
        }

        const payload = {
          id: uuid,
          title: title || getDefaultMeetingTitle(),
          transcript,
          projectId: selectedProjectId || undefined,
          contextIds: selectedContextIds,
          syncToJira,
          syncToLinear,
          syncToTrello,
          syncToNotion,
          taskStrategy,
          taskCount,
          skipAi,
          audioUri: newAudioPath,
          timestamp: Date.now(),
          location: meetingLocation ?? undefined,
        };

        jsonFile.write(JSON.stringify(payload));

        Alert.alert(
          "Saved Offline",
          "The network connection dropped. Your meeting has been securely saved to the device and will automatically sync when internet is restored.",
        );
        router.replace("/(drawer)");
      } catch (offlineErr) {
        console.error("Fatal offline storage failure", offlineErr);
        alert("Failed to save meeting both online and offline.");
        setPhase("context_selection");
      }
    }
  };

  const toggleContext = (id: string) => {
    setSelectedContextIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleCloseTap = () => {
    if (isRecording || transcript.length > 0 || audioBackupPath) {
      Alert.alert(
        "Discard Recording?",
        "Are you sure you want to leave? All your recorded audio and generated text will be permanently lost.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              if (isRecording) {
                try {
                  LiveAudioStream.stop();
                } catch (e) {}
                if (wsRef.current) {
                  wsRef.current.close();
                  wsRef.current = null;
                }
              }
              router.back();
            },
          },
        ],
      );
    } else {
      router.back();
    }
  };

  if (phase === "saving" || phase === "done") {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        {phase === "saving" ? (
          <>
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={{ marginBottom: 24 }}
            />
            <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
              Saving & Analyzing...
            </Text>
            <Text variant="bodyMedium" style={{ marginTop: 8, opacity: 0.7 }}>
              Hang tight, AI is reviewing your transcript.
            </Text>
          </>
        ) : (
          <>
            <IconButton icon="check-circle" size={64} iconColor="#10B981" />
            <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
              Saved Successfully!
            </Text>
          </>
        )}
      </View>
    );
  }

  if (phase === "context_selection") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.primary, fontWeight: "bold" }}
          >
            Processing Options
          </Text>
          <IconButton icon="close" size={24} onPress={handleCloseTap} />
        </View>

        {isLoadingMetadata ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text variant="labelLarge" style={{ opacity: 0.7 }}>
                  Meeting Title
                </Text>
                {isGeneratingTitle && (
                  <ActivityIndicator
                    size={12}
                    style={{ marginLeft: 8 }}
                    color={theme.colors.primary}
                  />
                )}
              </View>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={getDefaultMeetingTitle()}
                mode="outlined"
              />
            </View>

            <View>
              <Text
                variant="labelLarge"
                style={{ marginBottom: 8, opacity: 0.7 }}
              >
                Target Project (Optional)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Chip
                  selected={selectedProjectId === null}
                  onPress={() => setSelectedProjectId(null)}
                  mode={selectedProjectId === null ? "flat" : "outlined"}
                >
                  Create New Project
                </Chip>
                {projects.map((p) => (
                  <Chip
                    key={p.id}
                    selected={selectedProjectId === p.id}
                    onPress={() => setSelectedProjectId(p.id)}
                    mode={selectedProjectId === p.id ? "flat" : "outlined"}
                  >
                    {p.title}
                  </Chip>
                ))}
              </ScrollView>
            </View>

            <View>
              <Text
                variant="labelLarge"
                style={{ marginBottom: 8, opacity: 0.7 }}
              >
                Background Contexts
              </Text>
              {contexts.length === 0 ? (
                <Text style={{ opacity: 0.5 }}>No contexts available.</Text>
              ) : (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {contexts.map((c) => (
                    <Chip
                      key={c.id}
                      selected={selectedContextIds.includes(c.id)}
                      onPress={() => toggleContext(c.id)}
                      mode={
                        selectedContextIds.includes(c.id) ? "flat" : "outlined"
                      }
                    >
                      {c.name}
                    </Chip>
                  ))}
                </View>
              )}
            </View>

            <Divider />

            <View>
              <Text
                variant="titleMedium"
                style={{ fontWeight: "bold", marginBottom: 16 }}
              >
                Task Automation
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ opacity: hasJira ? 1 : 0.5 }}>Sync to Jira</Text>
                <Switch
                  value={syncToJira}
                  onValueChange={setSyncToJira}
                  disabled={!hasJira}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ opacity: hasLinear ? 1 : 0.5 }}>
                  Sync to Linear
                </Text>
                <Switch
                  value={syncToLinear}
                  onValueChange={setSyncToLinear}
                  disabled={!hasLinear}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ opacity: hasTrello ? 1 : 0.5 }}>
                  Sync to Trello
                </Text>
                <Switch
                  value={syncToTrello}
                  onValueChange={setSyncToTrello}
                  disabled={!hasTrello}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ opacity: hasNotion ? 1 : 0.5 }}>
                  Sync to Notion
                </Text>
                <Switch
                  value={syncToNotion}
                  onValueChange={setSyncToNotion}
                  disabled={!hasNotion}
                />
              </View>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: "rgba(0,0,0,0.05)",
                paddingTop: 24,
              }}
            >
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                Agile Task Generation Strategy
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <Button
                  mode={taskStrategy === "AUTO" ? "contained" : "outlined"}
                  onPress={() => setTaskStrategy("AUTO")}
                  style={{ flex: 1 }}
                  compact
                >
                  AI Auto
                </Button>
                <Button
                  mode={
                    taskStrategy === "SINGLE_TICKET" ? "contained" : "outlined"
                  }
                  onPress={() => setTaskStrategy("SINGLE_TICKET")}
                  style={{ flex: 1 }}
                  compact
                >
                  Mega Ticket
                </Button>
                <Button
                  mode={
                    taskStrategy === "SPECIFIC_COUNT" ? "contained" : "outlined"
                  }
                  onPress={() => setTaskStrategy("SPECIFIC_COUNT")}
                  style={{ flex: 1 }}
                  compact
                >
                  Exact
                </Button>
              </View>

              {taskStrategy === "SPECIFIC_COUNT" && (
                <TextInput
                  label="Number of Tasks"
                  value={taskCount.toString()}
                  keyboardType="numeric"
                  onChangeText={(t) => {
                    const val = parseInt(t, 10);
                    if (!isNaN(val))
                      setTaskCount(Math.max(1, Math.min(20, val)));
                  }}
                  style={{ marginBottom: 16 }}
                />
              )}
            </View>
          </ScrollView>
        )}

        <View
          style={{
            padding: 24,
            paddingBottom: Math.max(24, insets.bottom + 16),
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(0,0,0,0.05)",
          }}
        >
          <Button
            mode="contained"
            onPress={() => saveMeeting(false)}
            icon="auto-fix"
          >
            Save & Generate Tasks
          </Button>
          <Button
            mode="outlined"
            onPress={() => saveMeeting(true)}
            icon="text-box-outline"
          >
            Save Transcript Only
          </Button>
        </View>
      </View>
    );
  }

  // DEFAULT PHASE = RECORDING
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: theme.colors.primary, fontWeight: "bold", flex: 1 }}
        >
          Meeting
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Button
            mode="outlined"
            compact
            onPress={() => setLanguageMenuVisible(true)}
            style={{ marginRight: 8, borderColor: theme.colors.surfaceVariant }}
            textColor={theme.colors.onSurfaceVariant}
          >
            {LANGUAGE_OPTIONS.find((l) => l.code === language)?.name ||
              "Language"}
          </Button>

          <Portal>
            <Modal
              visible={languageMenuVisible}
              onDismiss={() => {
                setLanguageMenuVisible(false);
                setLanguageSearchQuery("");
              }}
              contentContainerStyle={{
                backgroundColor: theme.colors.background,
                padding: 20,
                margin: 20,
                borderRadius: 12,
                maxHeight: "80%",
              }}
            >
              <Text
                variant="titleMedium"
                style={{ marginBottom: 12, fontWeight: "bold" }}
              >
                Select Language
              </Text>
              <TextInput
                mode="outlined"
                placeholder="Search language..."
                value={languageSearchQuery}
                onChangeText={setLanguageSearchQuery}
                style={{ marginBottom: 12 }}
                left={<TextInput.Icon icon="magnify" />}
              />
              <FlatList
                data={filteredLanguages}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <List.Item
                    title={item.name}
                    onPress={() => {
                      handleLanguageChange(item.code);
                      setLanguageSearchQuery("");
                    }}
                    right={(props) =>
                      item.code === language ? (
                        <List.Icon
                          {...props}
                          icon="check"
                          color={theme.colors.primary}
                        />
                      ) : null
                    }
                  />
                )}
                showsVerticalScrollIndicator={false}
              />
            </Modal>
          </Portal>

          <IconButton
            icon="close"
            size={24}
            mode="contained-tonal"
            iconColor={theme.colors.onSurfaceVariant}
            containerColor={theme.colors.surfaceVariant}
            onPress={handleCloseTap}
          />
        </View>
      </View>

      {isRecording && !isWsConnected && (
        <View
          style={{
            backgroundColor: theme.colors.errorContainer,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <IconButton
            icon="wifi-strength-off-outline"
            iconColor={theme.colors.onErrorContainer}
            size={20}
            style={{ margin: 0, marginRight: 8 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              variant="labelMedium"
              style={{
                color: theme.colors.onErrorContainer,
                fontWeight: "bold",
              }}
            >
              Poor Connection Detected
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onErrorContainer }}
            >
              Live transcription paused. Audio is still recording securely to
              your device.
            </Text>
          </View>
        </View>
      )}

      {phase === "recording" &&
        (transcript !== "" || interim !== "" || isRecording) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <SegmentedButtons
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as any)}
              buttons={[
                { value: "transcript", label: "Transcript" },
                { value: "summary", label: "Summary" },
                { value: "chat", label: "Live Chat" },
              ]}
              theme={{
                colors: { secondaryContainer: theme.colors.primaryContainer },
              }}
            />
          </View>
        )}

      <Surface style={styles.transcriptContainer} elevation={0}>
        <View
          style={{
            display: activeTab === "transcript" ? "flex" : "none",
            flex: 1,
          }}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({ animated: true })
            }
          >
            {transcript === "" && interim === "" && !isRecording && (
              <View style={{ alignItems: "center", marginTop: 40 }}>
                <IconButton
                  icon="account-group"
                  size={48}
                  iconColor={theme.colors.primary}
                  style={{ opacity: 0.5, marginBottom: 16 }}
                />
                <Text
                  variant="titleMedium"
                  style={{
                    fontWeight: "bold",
                    textAlign: "center",
                    color: theme.colors.primary,
                  }}
                >
                  Ready to Record
                </Text>
                <Text
                  style={{ opacity: 0.6, textAlign: "center", marginTop: 8 }}
                >
                  Tap the record button to start transcribing your meeting.
                </Text>

                <PulsingRecordButton onPress={startRecording} theme={theme} />

                <View
                  style={{
                    marginTop: 40,
                    backgroundColor: theme.colors.surfaceVariant,
                    padding: 16,
                    borderRadius: 12,
                    width: "100%",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <IconButton
                      icon="robot-outline"
                      size={20}
                      iconColor={theme.colors.primary}
                      style={{ margin: 0, marginRight: 8 }}
                    />
                    <Text
                      variant="labelLarge"
                      style={{
                        fontWeight: "bold",
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      AI & Background Mode
                    </Text>
                  </View>
                  <Text
                    variant="bodySmall"
                    style={{
                      opacity: 0.8,
                      lineHeight: 20,
                      color: theme.colors.onSurfaceVariant,
                    }}
                  >
                    Recordings securely process via AI to generate highly
                    accurate transcripts. The app continues to actively record
                    natively in the background even if you lock your screen or
                    switch apps.
                  </Text>
                </View>
              </View>
            )}

            <View style={{ gap: 12 }}>
              {transcript
                .split("\n")
                .filter(Boolean)
                .map((block, i) => {
                  const match = block.match(/^\[(.*?)\]\s*(.*)/);
                  if (match) {
                    const speaker = match[1];
                    const text = match[2];
                    const isMe =
                      speaker.toLowerCase().includes("user") ||
                      speaker === "Me" ||
                      speaker === "Mic";
                    const speakerLabel =
                      isMe && speaker.toLowerCase().includes("user")
                        ? speaker.replace(/User/i, "Me")
                        : speaker;
                    return (
                      <Surface
                        key={i}
                        style={[
                          styles.chatBubble,
                          {
                            backgroundColor: isMe
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                            alignSelf: isMe ? "flex-end" : "flex-start",
                            borderBottomRightRadius: isMe ? 4 : 16,
                            borderBottomLeftRadius: isMe ? 16 : 4,
                          },
                        ]}
                        elevation={0}
                      >
                        <Text
                          variant="labelMedium"
                          style={{
                            color: isMe
                              ? theme.colors.primary
                              : theme.colors.secondary,
                            fontWeight: "bold",
                            marginBottom: 4,
                          }}
                        >
                          {speakerLabel}
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.onSurface,
                            lineHeight: 22,
                          }}
                        >
                          {text}
                        </Text>
                      </Surface>
                    );
                  }
                  return (
                    <Text
                      key={i}
                      variant="bodyLarge"
                      style={{ lineHeight: 28 }}
                    >
                      {block}
                    </Text>
                  );
                })}

              {interim
                ? (() => {
                    const match = interim.match(/^\[(.*?)\]\s*(.*)/);
                    if (match) {
                      const speaker = match[1];
                      const text = match[2];
                      const isMe =
                        speaker.toLowerCase().includes("user") ||
                        speaker === "Me" ||
                        speaker === "Mic";
                      const speakerLabel =
                        isMe && speaker.toLowerCase().includes("user")
                          ? speaker.replace(/User/i, "Me")
                          : speaker;
                      return (
                        <Surface
                          style={[
                            styles.chatBubble,
                            {
                              backgroundColor: isMe
                                ? theme.colors.primaryContainer
                                : theme.colors.surfaceVariant,
                              alignSelf: isMe ? "flex-end" : "flex-start",
                              borderBottomRightRadius: isMe ? 4 : 16,
                              borderBottomLeftRadius: isMe ? 16 : 4,
                              opacity: 0.6,
                            },
                          ]}
                          elevation={0}
                        >
                          <Text
                            variant="labelMedium"
                            style={{
                              color: isMe
                                ? theme.colors.primary
                                : theme.colors.secondary,
                              fontWeight: "bold",
                              marginBottom: 4,
                            }}
                          >
                            {speakerLabel}
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.onSurface,
                              lineHeight: 22,
                            }}
                          >
                            {text}
                          </Text>
                        </Surface>
                      );
                    }
                    return (
                      <Text
                        variant="bodyLarge"
                        style={{
                          opacity: 0.5,
                          marginTop: 8,
                          fontStyle: "italic",
                          lineHeight: 28,
                        }}
                      >
                        {interim}
                      </Text>
                    );
                  })()
                : null}
            </View>
          </ScrollView>
        </View>

        {activeTab === "summary" && (
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                marginBottom: 8,
                gap: 8,
              }}
            >
              {liveSummaryLoading && (
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.primary, fontStyle: "italic" }}
                >
                  Updating...
                </Text>
              )}
              {summaryProgress > 0 && summaryProgress < 100 && (
                <ProgressBar
                  progress={summaryProgress / 100}
                  color={theme.colors.primary}
                  style={{ width: 60, height: 4, borderRadius: 2 }}
                />
              )}
            </View>
            {liveSummary ? (
              <Markdown
                style={{
                  body: {
                    color: theme.colors.onSurface,
                    fontSize: 16,
                    lineHeight: 24,
                  },
                  heading1: {
                    color: theme.colors.onSurface,
                    marginTop: 16,
                    marginBottom: 8,
                  },
                  heading2: {
                    color: theme.colors.onSurface,
                    marginTop: 16,
                    marginBottom: 8,
                  },
                  heading3: {
                    color: theme.colors.onSurface,
                    marginTop: 16,
                    marginBottom: 8,
                  },
                }}
              >
                {liveSummary}
              </Markdown>
            ) : (
              <Text
                style={{
                  textAlign: "center",
                  fontStyle: "italic",
                  marginTop: 40,
                  opacity: 0.6,
                }}
              >
                Waiting for initial data... The summary will appear
                automatically after ~20 seconds of conversation.
              </Text>
            )}
          </ScrollView>
        )}

        {activeTab === "chat" && (
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={chatScrollViewRef}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {chatHistory.length === 0 && (
                <Text
                  style={{
                    textAlign: "center",
                    fontStyle: "italic",
                    marginTop: 40,
                    opacity: 0.6,
                  }}
                >
                  Ask questions about the meeting in real-time.
                </Text>
              )}
              {chatHistory.map((msg, idx) => (
                <Surface
                  key={idx}
                  elevation={0}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    marginBottom: 12,
                    maxWidth: "85%",
                    backgroundColor:
                      msg.role === "user"
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceVariant,
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                    borderBottomLeftRadius: msg.role === "user" ? 16 : 4,
                  }}
                >
                  <Markdown
                    style={{
                      body: {
                        color: theme.colors.onSurface,
                        fontSize: 15,
                        lineHeight: 22,
                      },
                      paragraph: { marginTop: 0, marginBottom: 0 },
                    }}
                  >
                    {msg.content}
                  </Markdown>
                </Surface>
              ))}
              {chatLoading && (
                <Text
                  style={{
                    fontStyle: "italic",
                    color: theme.colors.primary,
                    marginVertical: 8,
                    alignSelf: "flex-start",
                    paddingLeft: 8,
                  }}
                >
                  Thinking...
                </Text>
              )}
            </ScrollView>
            <View
              style={{
                padding: 12,
                borderTopWidth: 1,
                borderTopColor: theme.colors.outlineVariant,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <TextInput
                mode="outlined"
                value={chatMessage}
                onChangeText={setChatMessage}
                placeholder="Ask the AI..."
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
                onSubmitEditing={handleSendChat}
                dense
              />
              <IconButton
                icon="send"
                iconColor={theme.colors.primary}
                onPress={handleSendChat}
                disabled={!chatMessage.trim() || chatLoading}
                style={{ margin: 0, marginLeft: 8 }}
              />
            </View>
          </View>
        )}
      </Surface>

      <View
        style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}
      >
        <View style={styles.waveformContainer}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
              alignSelf: "flex-start",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: "#10B981",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              SECURE CLOUD AI
            </Text>
          </View>

          <WaveformBox
            isRecording={isRecording}
            theme={theme}
            audioLevel={currentVolume}
          />

          <Text variant="labelLarge" style={{ opacity: 0.6, marginTop: 8 }}>
            {isRecording
              ? isSpeaking
                ? "Speaking..."
                : "Listening..."
              : transcript
                ? "Recording stopped"
                : "Idle"}
          </Text>
        </View>

        <View style={styles.footerControls}>
          <IconButton
            icon={isRecording ? "stop" : "record"}
            iconColor={theme.colors.onError}
            containerColor={
              isRecording ? theme.colors.error : theme.colors.primary
            }
            mode="contained"
            size={36}
            onPress={isRecording ? handleStopRecordingBtn : startRecording}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transcriptContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  chatBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "85%",
  },
  footer: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  waveformContainer: {
    flex: 1,
    alignItems: "flex-start",
  },
  footerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
});
