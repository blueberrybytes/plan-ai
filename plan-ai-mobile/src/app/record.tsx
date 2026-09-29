/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  TouchableOpacity,
  Alert,
  FlatList,
  Linking,
  Keyboard,
  Share,
} from "react-native";
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
  Dialog,
  SegmentedButtons,
  ProgressBar,
} from "react-native-paper";
import Markdown from "react-native-markdown-display";
import { onMarkdownLinkPress } from "../utils/openWebUrl";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { TwentyCompanyPicker } from "@/components/TwentyCompanyPicker";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Project, Context, TwentyCompanyItem } from "@/services/planAiApi";
import * as Location from "expo-location";
import * as Sentry from "@sentry/react-native";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import {
  recordedMsOf,
  recordingService,
  useRecordingSession,
  useRecordingVolume,
  type RecordingApi,
} from "@/services/recordingService";
import { saveAndUpload } from "@/services/recordingUploader";
import { readManifest, type MeetingCalendarEvent } from "@/services/recordingSessions";
import { loadLastLanguage, saveLastLanguage } from "@/utils/recordingPrefs";

const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Recorded time, pauses excluded. Ticks on its own so the screen does not. */
const ElapsedTime = ({
  recordedMsBefore,
  segmentStartedAt,
  style,
}: {
  recordedMsBefore: number;
  segmentStartedAt: number | null;
  style?: any;
}) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!segmentStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [segmentStartedAt]);
  const ms =
    recordedMsBefore + (segmentStartedAt ? Math.max(0, now - segmentStartedAt) : 0);
  return <Text style={style}>{formatDuration(ms)}</Text>;
};

// Shared from the consent banner so the room knows it is being recorded.
const CONSENT_MESSAGE =
  "I am recording this meeting with Plan AI to write the notes and the tasks. Tell me if you would prefer I did not.";

// The session whose consent banner was closed. Kept outside the screen so it
// stays closed when the screen remounts mid-meeting, and only for that meeting.
let consentDismissedFor: string | null = null;

/** Optional note for the moment just marked. Skipping keeps the mark. */
const BookmarkNoteDialog = ({
  visible,
  atSeconds,
  onSave,
  onSkip,
}: {
  visible: boolean;
  atSeconds: number;
  onSave: (note: string) => void;
  onSkip: () => void;
}) => {
  const [note, setNote] = useState("");
  // Paper's dialog stays centred on the full screen, so on iOS the keyboard
  // covers its buttons. Android resizes the window on its own.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onSkip} style={{ marginBottom: keyboardHeight }}>
        <Dialog.Title>Marked at {formatDuration(atSeconds * 1000)}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            placeholder="Add a note (optional)"
            value={note}
            onChangeText={setNote}
            maxLength={200}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => onSave(note)}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onSkip}>Skip</Button>
          <Button onPress={() => onSave(note)}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

type Phase =
  | "setup"
  | "recording"
  | "save_options"
  | "saving"
  | "done"
  | "error";

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
}: {
  isRecording: boolean;
  theme: any;
}) => {
  // Read here, not in the screen: the level changes several times a second.
  const audioLevel = useRecordingVolume();
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
  }, [audioLevel, isRecording, anims]);

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

/** One live line: "[Speaker] text" as a bubble, plain text otherwise. */
const TranscriptLine = ({
  block,
  theme,
  interim = false,
}: {
  block: string;
  theme: any;
  interim?: boolean;
}) => {
  const match = block.match(/^\[(.*?)\]\s*(.*)/);
  if (!match) {
    return (
      <Text
        variant="bodyLarge"
        style={
          interim
            ? { opacity: 0.5, marginTop: 8, fontStyle: "italic", lineHeight: 28 }
            : { lineHeight: 28 }
        }
      >
        {block}
      </Text>
    );
  }
  const speaker = match[1];
  const text = match[2];
  const isMe =
    speaker.toLowerCase().includes("user") || speaker === "Me" || speaker === "Mic";
  const speakerLabel =
    isMe && speaker.toLowerCase().includes("user") ? speaker.replace(/User/i, "Me") : speaker;
  return (
    <Surface
      style={[
        styles.chatBubble,
        {
          backgroundColor: isMe ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
          alignSelf: isMe ? "flex-end" : "flex-start",
          borderBottomRightRadius: isMe ? 4 : 16,
          borderBottomLeftRadius: isMe ? 16 : 4,
          ...(interim ? { opacity: 0.6 } : {}),
        },
      ]}
      elevation={0}
    >
      <Text
        variant="labelMedium"
        style={{
          color: isMe ? theme.colors.primary : theme.colors.secondary,
          fontWeight: "bold",
          marginBottom: 4,
        }}
      >
        {speakerLabel}
      </Text>
      <Text style={{ color: theme.colors.onSurface, lineHeight: 22 }}>{text}</Text>
    </Surface>
  );
};

// Finished lines only re-render when a line is added; the interim line
// changes several times a second and is drawn on its own.
const FinalLines = memo(function FinalLines({
  transcript,
  theme,
}: {
  transcript: string;
  theme: any;
}) {
  return (
    <>
      {transcript
        .split("\n")
        .filter(Boolean)
        .map((block, i) => (
          <TranscriptLine key={i} block={block} theme={theme} />
        ))}
    </>
  );
});

const TranscriptLines = ({
  transcript,
  interim,
  theme,
}: {
  transcript: string;
  interim: string;
  theme: any;
}) => (
  <View style={{ gap: 12 }}>
    <FinalLines transcript={transcript} theme={theme} />
    {interim ? <TranscriptLine block={interim} theme={theme} interim /> : null}
  </View>
);

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
  const [phase, setPhase] = useState<Phase>("setup");
  // Live recording state lives in the recordingService singleton (outside the
  // React tree) so it survives navigation/backgrounding. This screen is just a
  // view over it and re-attaches when it remounts.
  const session = useRecordingSession();
  const {
    isRecording,
    isPaused,
    isStarting,
    isSpeaking,
    transcript,
    interim,
    isWsConnected,
    isConnectingWs,
    wsUnrecoverable,
    stoppedSessionId,
    captureProblem,
    lowStorage,
    autoPauseWarning,
    autoPausedBy,
    recordedMsBefore,
    segmentStartedAt,
    bookmarks,
  } = session;

  // Bookmark whose note dialog is open, by index in session.bookmarks.
  const [markIndex, setMarkIndex] = useState<number | null>(null);
  const handleMark = () => {
    try {
      const index = recordingService.addBookmark();
      if (index !== null) setMarkIndex(index);
    } catch (err) {
      console.warn("[record] could not add the bookmark", err);
    }
  };
  const closeMarkDialog = (note?: string) => {
    try {
      if (markIndex !== null && note?.trim()) {
        recordingService.setBookmarkNote(markIndex, note);
      }
    } catch (err) {
      console.warn("[record] could not save the bookmark note", err);
    }
    setMarkIndex(null);
  };

  const [consentClosedFor, setConsentClosedFor] = useState(consentDismissedFor);
  const closeConsent = () => {
    consentDismissedFor = session.sessionId;
    setConsentClosedFor(session.sessionId);
  };
  const shareConsent = async () => {
    try {
      const result = await Share.share({ message: CONSENT_MESSAGE });
      if (result.action === Share.sharedAction) closeConsent();
    } catch (err) {
      Alert.alert("Could not share", err instanceof Error ? err.message : String(err));
    }
  };
  const showConsent =
    isRecording && !!session.sessionId && consentClosedFor !== session.sessionId;
  const [meetingLocation, setMeetingLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);

  // The session's language when one is open, else the last one chosen.
  const [language, setLanguage] = useState(() => {
    const s = recordingService.getSnapshot();
    return s.isRecording || s.stoppedSessionId ? s.language : loadLastLanguage();
  });
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState("");

  const filteredLanguages = LANGUAGE_OPTIONS.filter((lang) =>
    lang.name.toLowerCase().includes(languageSearchQuery.toLowerCase()),
  );

  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { api, activeWorkspaceId, user } = useAuth();
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
  const summaryPollCounterRef = useRef<number>(0);
  const summaryPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Context Selection States
  const [title, setTitle] = useState("");
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  // Restored from the open session when the screen remounts mid-meeting.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => recordingService.getSnapshot().projectId,
  );
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>(
    () => recordingService.getSnapshot().contextIds,
  );
  const [syncToJira, setSyncToJira] = useState(false);
  const [syncToLinear, setSyncToLinear] = useState(false);
  const [syncToTrello, setSyncToTrello] = useState(false);
  const [syncToNotion, setSyncToNotion] = useState(false);
  const [syncToAsana, setSyncToAsana] = useState(false);
  const [syncToTwenty, setSyncToTwenty] = useState(false);
  const [exportToGoogleDrive, setExportToGoogleDrive] = useState(false);
  const [exportToOneDrive, setExportToOneDrive] = useState(false);
  const [createDoc, setCreateDoc] = useState(true);
  const [createSlides, setCreateSlides] = useState(false);
  const [hasJira, setHasJira] = useState(false);
  const [hasLinear, setHasLinear] = useState(false);
  const [hasTrello, setHasTrello] = useState(false);
  const [hasNotion, setHasNotion] = useState(false);
  const [hasAsana, setHasAsana] = useState(false);
  const [hasTwenty, setHasTwenty] = useState(false);
  const [hasGoogleDrive, setHasGoogleDrive] = useState(false);
  const [hasOneDrive, setHasOneDrive] = useState(false);

  const [taskStrategy, setTaskStrategy] = useState<
    "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT"
  >("AUTO");
  const [taskCount, setTaskCount] = useState<number>(5);

  const [projects, setProjects] = useState<Project[]>([]);

  // The Twenty company is chosen PER RECORDING: the same person meets several
  // different clients in a day, and most recordings have no project yet. A
  // project's linked company only pre-fills this.
  const [twentyCompany, setTwentyCompany] = useState<TwentyCompanyItem | null>(null);
  const [twentyPickerOpen, setTwentyPickerOpen] = useState(false);

  // Pre-fill from the project's linked company (convenience for recurring
  // clients) — the user can still change it for this meeting.
  useEffect(() => {
    if (twentyCompany) return;
    const project = projects.find((p) => p.id === selectedProjectId);
    const meta =
      (project?.metadata as { twentyCompanyId?: string; twentyCompanyName?: string } | null) ??
      null;
    if (meta?.twentyCompanyId) {
      setTwentyCompany({
        id: meta.twentyCompanyId,
        name: meta.twentyCompanyName ?? "Linked company",
      });
    }
  }, [projects, selectedProjectId, twentyCompany]);

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

  // Live summary, checked every 15 s (1 s UI ticks). Only the lines said
  // since the last summary are sent, with the summary itself: re-sending the
  // whole meeting every 15 s cost tokens with the square of its length. An
  // update waits for 200 new characters or one minute, and never overlaps.
  const summarizedLengthRef = useRef(0);
  const lastSummaryAtRef = useRef(0);
  const summaryInFlightRef = useRef(false);
  useEffect(() => {
    if (phase !== "recording" || !api) return;

    summaryPollTimerRef.current = setInterval(() => {
      setSummaryProgress((prev) => (prev >= 100 ? 5 : prev + 5));
      summaryPollCounterRef.current += 1;
      if (summaryPollCounterRef.current < 15) return;
      summaryPollCounterRef.current = 0;
      if (summaryInFlightRef.current) return;

      const current = transcriptRef.current;
      // A new session started: its transcript is shorter than what we had.
      if (current.length < summarizedLengthRef.current) {
        summarizedLengthRef.current = 0;
        liveSummaryRef.current = "";
      }
      const done = summarizedLengthRef.current;
      const delta = current.slice(done);
      if (!delta.trim()) return;
      if (delta.length < 200 && Date.now() - lastSummaryAtRef.current < 60_000) return;

      const prevSummary = liveSummaryRef.current;
      const upTo = current.length;
      summaryInFlightRef.current = true;
      setLiveSummaryLoading(true);
      api
        .getLiveSummary({
          ...(prevSummary
            ? {
                liveTranscript: current.slice(Math.max(0, done - 1500), done),
                newTranscript: delta,
                previousSummary: prevSummary,
              }
            : { liveTranscript: current }),
          contextIds:
            selectedContextIdsRef.current?.length > 0 ? selectedContextIdsRef.current : undefined,
          projectIds: selectedProjectId ? [selectedProjectId] : undefined,
        })
        .then((newSummary) => {
          if (!newSummary) return;
          setLiveSummary(newSummary);
          summarizedLengthRef.current = upTo;
          lastSummaryAtRef.current = Date.now();
        })
        .catch((e) => console.warn("Live summary poll failed: ", e))
        .finally(() => {
          summaryInFlightRef.current = false;
          setLiveSummaryLoading(false);
        });
    }, 1000);

    return () => {
      if (summaryPollTimerRef.current)
        clearInterval(summaryPollTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        projectIds: selectedProjectId ? [selectedProjectId] : undefined,
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

  // The meeting happening now in the user's connected calendar (web app,
  // Integrations): it names the recording and its invitees help name the
  // speakers. Restored from the session when the screen remounts mid-meeting.
  const [calendarEvent, setCalendarEvent] = useState<MeetingCalendarEvent | null>(() => {
    const s = recordingService.getSnapshot();
    const id = s.sessionId ?? s.stoppedSessionId;
    return id ? (readManifest(id)?.calendarEvent ?? null) : null;
  });
  useEffect(() => {
    if (phase === "save_options" && transcript && !title && !calendarEvent?.title) {
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
  }, [phase, transcript, api, title, calendarEvent?.title]);

  // Re-attach this screen to an in-progress session when it remounts (the user
  // navigated away while recording and came back). The session keeps running in
  // recordingService regardless — there is intentionally NO unmount cleanup that
  // stops recording, which is what previously killed it on screen close.
  useEffect(() => {
    const s = recordingService.getSnapshot();
    if (s.isRecording) {
      setPhase("recording");
    } else if (s.stoppedSessionId) {
      // Stopped but not saved yet: back to the save screen, not a new setup.
      setPhase("save_options");
    }
  }, []);

  // Refetch contexts when the screen regains focus, so deletions on the web
  // app are reflected without restarting the mobile app.
  useFocusEffect(
    useCallback(() => {
      if (phase === "setup") {
        api.listContexts()
          .then((ctxs) => setContexts(ctxs as Context[]))
          .catch(() => {});
      }
    }, [phase, api]),
  );

  useEffect(() => {
    if (phase !== "setup" || !api) return;
    let cancelled = false;
    void api.getCurrentMeeting().then((event) => {
      if (!cancelled) setCalendarEvent(event);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, api]);
  // The invite title is the default name on the save screen.
  useEffect(() => {
    if (phase === "save_options" && calendarEvent?.title && !title) {
      setTitle(calendarEvent.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, calendarEvent]);

  useEffect(() => {
    if (phase === "setup") {
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
          const asana = (ints as any[]).find(
            (i) => i.provider === "ASANA" && i.status === "CONNECTED",
          );
          const googleDrive = (ints as any[]).find(
            (i) => i.provider === "GOOGLE_DRIVE" && i.status === "CONNECTED",
          );
          const oneDrive = (ints as any[]).find(
            (i) => i.provider === "ONEDRIVE" && i.status === "CONNECTED",
          );
          const twenty = (ints as any[]).find(
            (i) => i.provider === "TWENTY" && i.status === "CONNECTED",
          );
          if (jira) setHasJira(true);
          if (linear) setHasLinear(true);
          if (trello) setHasTrello(true);
          if (notion) setHasNotion(true);
          if (asana) setHasAsana(true);
          if (twenty) {
            setHasTwenty(true);
            setSyncToTwenty(true);
          }
          if (googleDrive) {
            setHasGoogleDrive(true);
            setExportToGoogleDrive(true);
          }
          if (oneDrive) {
            setHasOneDrive(true);
            setExportToOneDrive(true);
          }

          // As per UX requirement, default to OFF on mobile to avoid accidental spam
          setSyncToJira(false);
          setSyncToLinear(false);
          setSyncToTrello(false);
          setSyncToNotion(false);
          setSyncToAsana(false);
          // NOT reset: Twenty is an artifact destination like Drive, not
          // task spam — connected means wanted, and it no-ops without a company.
        })
        .finally(() => {
          setIsLoadingMetadata(false);
        });
    }
  }, [phase, api]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setLanguageMenuVisible(false);
    saveLastLanguage(newLang);
    recordingService.changeLanguage(newLang);
  };

  const startRecording = async () => {
    console.log("🎙️ startRecording pressed");
    // A second tap while the first start is still running used to start two
    // native captures.
    if (recordingService.isMeetingActive()) return;
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

      // Capture location asynchronously without blocking audio start.
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

      setPhase("recording");
      saveLastLanguage(language);

      // The session (microphone, websocket, foreground service and the
      // session folder on disk) is owned by recordingService so it survives
      // navigation, backgrounding, and screen close.
      await recordingService.start({
        language,
        contextIds: selectedContextIds,
        projectId: selectedProjectId,
        workspaceId: activeWorkspaceId || null,
        ownerUid: user?.uid ?? null,
        calendarEvent: calendarEvent ?? undefined,
        api: api as unknown as RecordingApi,
      });
    } catch (err) {
      console.error("Failed to start recording setup", err);
      Sentry.captureException(err, { tags: { source: "recording_start" } });
      setPhase("setup");
      Alert.alert(
        "Could not start recording",
        err instanceof Error ? err.message : "Something went wrong starting the microphone.",
      );
    }
  };

  const handleStopRecordingBtn = async () => {
    const { sessionId } = await recordingService.stop();
    if (sessionId) {
      setPhase("save_options");
    } else {
      Alert.alert(
        "Nothing was recorded",
        "No audio reached the phone during this recording, so there is nothing to save.",
      );
      router.back();
    }
  };

  const saveMeeting = async (skipAi: boolean = false) => {
    const sessionId = recordingService.getSnapshot().stoppedSessionId;
    if (!sessionId) {
      router.replace("/(drawer)");
      return;
    }
    setPhase("saving");
    // The choices go into the session on disk BEFORE the upload starts, so a
    // crash or a dead network mid-upload loses nothing: the dashboard picks
    // it up and retries.
    const upload = saveAndUpload(api, sessionId, {
      title: title || calendarEvent?.title || getDefaultMeetingTitle(),
      calendarEvent: calendarEvent ?? undefined,
      projectId: selectedProjectId || undefined,
      contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
      // ASR language ("" = auto): the batch pass uses it instead of "multi",
      // which returns nothing for Catalan.
      language: language || undefined,
      skipAi,
      syncToJira,
      syncToLinear,
      syncToTrello,
      syncToNotion,
      syncToAsana,
      // Checked-but-no-company must still reach the backend so it records a
      // visible SKIPPED reason rather than the client dropping it silently.
      syncToTwenty,
      twentyCompanyId: twentyCompany?.id,
      exportToGoogleDrive,
      exportToOneDrive,
      createDoc,
      createSlides,
      taskStrategy,
      taskCount,
      location: meetingLocation ?? undefined,
      chatHistory: chatHistory.length > 0 ? chatHistory : undefined,
    }).catch((err) => {
      Sentry.captureException(err, { tags: { source: "recording_save" } });
      return "queued" as const;
    });
    // From here the session belongs to the uploader, not to this screen.
    recordingService.finishSaved();

    // Short meetings finish in seconds. A long one keeps uploading in the
    // background with a progress bar on the home screen, instead of holding
    // the user on this screen for minutes.
    const outcome = await Promise.race([
      upload,
      new Promise<"background">((resolve) => setTimeout(() => resolve("background"), 15_000)),
    ]);

    if (outcome === "uploaded") {
      setPhase("done");
      setTimeout(() => {
        router.replace("/(drawer)");
      }, 1500);
      return;
    }
    if (outcome !== "background") {
      Alert.alert(
        outcome === "queued" ? "Saved on this phone" : "Upload stopped",
        outcome === "queued"
          ? "The upload did not finish. The meeting is safe on this phone and uploads on its own when the connection is back."
          : "The server refused the upload. The meeting is safe on this phone; you can retry or export it from the home screen.",
      );
    }
    router.replace("/(drawer)");
  };

  const toggleContext = (id: string) => {
    setSelectedContextIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // Set right before leaving the save screen on purpose, so the back guard
  // below lets the navigation through instead of asking again.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);

  const confirmDiscard = () =>
    Alert.alert(
      "Delete this meeting?",
      "The audio and the text will be deleted from this phone and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void recordingService.discard();
            setLeaving(true);
          },
        },
      ],
    );

  const handleCloseTap = () => {
    // Leaving while the start is still running would leave a meeting
    // recording with no screen showing it.
    if (recordingService.getSnapshot().isStarting) return;
    if (phase === "save_options") {
      // Stopped but not saved: leaving keeps it on the phone, and the home
      // screen offers to upload it.
      Alert.alert(
        "Leave without saving?",
        "The meeting stays on this phone. You can upload it later from the home screen.",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Keep for later",
            onPress: () => {
              recordingService.finishSaved();
              setLeaving(true);
            },
          },
          { text: "Delete", style: "destructive", onPress: confirmDiscard },
        ],
      );
      return;
    }
    if (isRecording || transcript.length > 0) {
      confirmDiscard();
    } else {
      router.back();
    }
  };

  // Back gesture or Android back button on the save screen: same choice as
  // the close button, instead of leaving the meeting with no way to save it.
  usePreventRemove(phase === "save_options" && !leaving, () => handleCloseTap());

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

  if (phase === "setup") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.primary, fontWeight: "bold" }}
          >
            Setup Meeting
          </Text>
          <IconButton icon="close" size={24} onPress={() => router.back()} />
        </View>

        {isLoadingMetadata ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
            {calendarEvent && (
              <Surface
                elevation={0}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: theme.colors.secondaryContainer,
                }}
              >
                <Text variant="labelMedium" style={{ opacity: 0.8 }}>
                  Happening now in your calendar
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                  {calendarEvent.title}
                </Text>
                {calendarEvent.attendees.length > 0 && (
                  <Text variant="bodySmall" style={{ opacity: 0.8 }}>
                    {calendarEvent.attendees
                      .slice(0, 6)
                      .map((a) => a.name || a.email)
                      .join(", ")}
                    {calendarEvent.attendees.length > 6
                      ? ` and ${calendarEvent.attendees.length - 6} more`
                      : ""}
                  </Text>
                )}
              </Surface>
            )}
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

            {/* Background Contexts section removed — the selected Project's
                files (its internal Context) now provide the AI context. */}
          </ScrollView>
        )}

        <View
          style={{
            padding: 24,
            paddingBottom: Math.max(24, insets.bottom + 16),
            borderTopWidth: 1,
            borderTopColor: "rgba(0,0,0,0.05)",
          }}
        >
          <Button
            mode="contained"
            onPress={() => setPhase("recording")}
            icon="microphone"
          >
            Continue to Recording
          </Button>
        </View>
      </View>
    );
  }

  if (phase === "save_options") {
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
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ opacity: hasGoogleDrive ? 1 : 0.5 }}>
                  Export to Google Drive
                </Text>
                <Switch
                  value={exportToGoogleDrive}
                  onValueChange={setExportToGoogleDrive}
                  disabled={!hasGoogleDrive}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ opacity: hasOneDrive ? 1 : 0.5 }}>
                  Export to OneDrive
                </Text>
                <Switch
                  value={exportToOneDrive}
                  onValueChange={setExportToOneDrive}
                  disabled={!hasOneDrive}
                />
              </View>
            </View>

            <Divider />

            <View>
              <Text
                variant="titleMedium"
                style={{ fontWeight: "bold", marginBottom: 16 }}
              >
                Document Generation
              </Text>

              <View style={styles.optionRow}>
                <Text style={styles.optionText}>Generate a document</Text>
                <Switch
                  value={createDoc}
                  onValueChange={setCreateDoc}
                  trackColor={{ false: "#333", true: "#4ade80" }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.optionRow}>
                <Text style={styles.optionText}>Generate slides</Text>
                <Switch
                  value={createSlides}
                  onValueChange={setCreateSlides}
                  trackColor={{ false: "#333", true: "#4ade80" }}
                  thumbColor="#fff"
                />
              </View>
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
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ opacity: hasAsana ? 1 : 0.5 }}>
                  Sync to Asana
                </Text>
                <Switch
                  value={syncToAsana}
                  onValueChange={setSyncToAsana}
                  disabled={!hasAsana}
                />
              </View>

              {/* Twenty needs a destination company. It's picked per meeting —
                  the same person attends meetings for different clients — and
                  the project's link only pre-fills it. */}
              {hasTwenty && (
                <View style={{ marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text>Send to Twenty CRM</Text>
                    <Switch value={syncToTwenty} onValueChange={setSyncToTwenty} />
                  </View>
                  {syncToTwenty && (
                    <Button
                      mode="outlined"
                      compact
                      icon="office-building"
                      onPress={() => setTwentyPickerOpen(true)}
                      style={{ marginTop: 8 }}
                    >
                      {twentyCompany ? twentyCompany.name : "Choose company…"}
                    </Button>
                  )}
                  {syncToTwenty && !twentyCompany && (
                    <Text style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                      Pick a company or the note will be skipped.
                    </Text>
                  )}

                  {/* Mounted in THIS branch: the button above only exists while
                      saving, and a picker rendered in another phase's tree is
                      never mounted when that button is tapped. */}
                  <TwentyCompanyPicker
                    visible={twentyPickerOpen}
                    onDismiss={() => setTwentyPickerOpen(false)}
                    onSelect={(c) => {
                      setTwentyCompany(c);
                      setTwentyPickerOpen(false);
                    }}
                  />
                </View>
              )}
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
      <SubscriptionBanner />
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

      {showConsent && (
        <View
          style={{
            backgroundColor: theme.colors.primaryContainer,
            paddingLeft: 16,
            paddingRight: 4,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            variant="bodySmall"
            style={{ flex: 1, color: theme.colors.onPrimaryContainer }}
          >
            Let the people in the room know you are recording.
          </Text>
          <Button mode="text" compact onPress={shareConsent}>
            Share message
          </Button>
          <IconButton
            icon="close"
            size={18}
            accessibilityLabel="Close"
            iconColor={theme.colors.onPrimaryContainer}
            style={{ margin: 0 }}
            onPress={closeConsent}
          />
        </View>
      )}

      {isRecording && isPaused && (
        <View
          style={{
            backgroundColor: theme.colors.secondaryContainer,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text
            variant="bodySmall"
            style={{ flex: 1, color: theme.colors.onSecondaryContainer }}
          >
            {autoPausedBy === "silence"
              ? "Paused automatically: nobody spoke for 15 minutes. Nothing is being recorded."
              : autoPausedBy === "long"
                ? "Paused automatically after 3 hours without a check. Nothing is being recorded."
                : autoPausedBy === "storage"
                  ? "Paused: the phone is almost out of space. Free some space, then resume or stop."
                  : "Paused. Nothing is being recorded or transcribed until you resume."}
          </Text>
          <Button mode="contained" compact onPress={() => recordingService.resume()}>
            Resume
          </Button>
        </View>
      )}

      {isRecording && !isPaused && autoPauseWarning && (
        <View
          style={{
            backgroundColor: theme.colors.tertiaryContainer,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text
            variant="bodySmall"
            style={{ flex: 1, color: theme.colors.onTertiaryContainer }}
          >
            {autoPauseWarning.reason === "silence"
              ? "Nobody has spoken for 14 minutes."
              : "This recording has run for 3 hours."}{" "}
            It will pause at{" "}
            {new Date(autoPauseWarning.at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            unless you keep it going.
          </Text>
          <Button
            mode="contained"
            compact
            onPress={() => recordingService.confirmStillRecording()}
          >
            Keep recording
          </Button>
        </View>
      )}

      {isRecording && !isPaused && captureProblem && (
        <View
          style={{
            backgroundColor: theme.colors.errorContainer,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.onErrorContainer, fontWeight: "bold" }}
          >
            {captureProblem.kind === "interrupted"
              ? "Recording interrupted"
              : captureProblem.kind === "stalled"
                ? "No audio from the microphone"
                : "Microphone problem"}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
            {captureProblem.message ??
              "The app is trying to restart the microphone. Everything recorded so far is safe."}
          </Text>
        </View>
      )}

      {isRecording && lowStorage && (
        <View
          style={{
            backgroundColor: theme.colors.tertiaryContainer,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text variant="bodySmall" style={{ color: theme.colors.onTertiaryContainer }}>
            Less than 500 MB free. The recording uses about 115 MB per hour and pauses on its
            own if the phone runs out of space.
          </Text>
        </View>
      )}

      {isRecording && !isPaused && !isWsConnected && (
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
          <Button
            mode="contained"
            compact
            buttonColor={theme.colors.onErrorContainer}
            textColor={theme.colors.errorContainer}
            loading={isConnectingWs}
            disabled={isConnectingWs}
            onPress={() => {
              recordingService.reconnect();
            }}
          >
            {isConnectingWs ? "Connecting..." : "Reconnect"}
          </Button>
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

            <TranscriptLines transcript={transcript} interim={interim} theme={theme} />
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
                onLinkPress={onMarkdownLinkPress}
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
                    onLinkPress={onMarkdownLinkPress}
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

          <WaveformBox isRecording={isRecording && !isPaused} theme={theme} />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 8,
              marginTop: 8,
            }}
          >
            <Text variant="labelLarge" style={{ opacity: 0.6 }}>
              {isRecording
                ? isPaused
                  ? "Paused"
                  : isSpeaking
                    ? "Speaking..."
                    : "Listening..."
                : transcript
                  ? "Recording stopped"
                  : "Idle"}
            </Text>
            {isRecording && (
              <ElapsedTime
                recordedMsBefore={recordedMsBefore}
                segmentStartedAt={segmentStartedAt}
                style={{ opacity: 0.6, fontVariant: ["tabular-nums"] }}
              />
            )}
            {isRecording && bookmarks.length > 0 && (
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                {bookmarks.length} marked
              </Text>
            )}
          </View>
        </View>

        <View style={styles.footerControls}>
          {isRecording && (
            <IconButton
              icon="bookmark-plus-outline"
              mode="contained-tonal"
              size={24}
              style={{ margin: 0 }}
              disabled={isPaused || isStarting}
              accessibilityLabel="Mark this moment"
              onPress={handleMark}
            />
          )}
          {isRecording && (
            <IconButton
              icon={isPaused ? "play" : "pause"}
              mode="contained-tonal"
              size={28}
              accessibilityLabel={isPaused ? "Resume recording" : "Pause recording"}
              onPress={() =>
                isPaused ? recordingService.resume() : recordingService.pause()
              }
            />
          )}
          <IconButton
            icon={isRecording ? "stop" : "record"}
            iconColor={theme.colors.onError}
            containerColor={
              isRecording ? theme.colors.error : theme.colors.primary
            }
            mode="contained"
            size={36}
            disabled={isStarting}
            onPress={isRecording ? handleStopRecordingBtn : startRecording}
          />
        </View>
      </View>

      <BookmarkNoteDialog
        visible={markIndex !== null}
        atSeconds={markIndex !== null ? (bookmarks[markIndex]?.atSeconds ?? 0) : 0}
        onSave={(note) => closeMarkDialog(note)}
        onSkip={() => closeMarkDialog()}
      />
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
    // 20, not 32: three controls (mark, pause, stop) must leave room for the
    // waveform on a 360 pt wide phone.
    paddingHorizontal: 20,
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
    gap: 12,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  optionText: {
    fontSize: 16,
    color: "#e5e7eb",
  },
});
