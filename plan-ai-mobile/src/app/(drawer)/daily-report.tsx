import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  Icon,
  Snackbar,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import { DailyReportProposals } from "../../components/DailyReportProposals";
import { useDictation } from "../../hooks/useDictation";
import {
  TrackerApiError,
  type DailyReportStatus,
  type TaskUpdateProposal,
} from "../../services/planAiApi";
import {
  cacheServerNote,
  getLocalNote,
  localDateKey,
  saveLocalEdit,
  useAccountNotes,
  useLocalNote,
} from "../../services/notesStore";
import { requestNotesSync, syncNotes } from "../../services/notesSync";
import { loadLastLanguage, saveLastLanguage } from "../../utils/recordingPrefs";
import { reportUnexpected } from "../../utils/reportError";

/** Languages offered for dictation. Auto-detect cannot hear Catalan. */
const LANGUAGES = [
  { code: "ca", label: "Català" },
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
];

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const errorText = (err: unknown, fallback: string) =>
  err instanceof TrackerApiError && err.status !== undefined && err.status < 500
    ? err.message
    : fallback;

/**
 * The daily report on the phone: dictate what you did, then let the AI
 * propose changes to your tasks. The text goes into today's day note, so it
 * is saved on the phone first and uploads when there is a connection.
 */
export default function DailyReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api, user, activeWorkspaceId, workspaces } = useAuth();
  const uid = user?.uid ?? null;
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const [status, setStatus] = useState<DailyReportStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<TaskUpdateProposal[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [language, setLanguage] = useState(() => {
    const saved = loadLastLanguage();
    return LANGUAGES.some((l) => l.code === saved) ? saved : "ca";
  });

  // Read through a ref, so loading does not rerun on every note edit.
  const accountNotes = useAccountNotes(uid);
  const accountNotesRef = useRef(accountNotes);
  accountNotesRef.current = accountNotes;
  const note = useLocalNote(noteId ?? "");
  const today = localDateKey();

  // Each dictated phrase goes straight into the day note, on the phone.
  const startedLine = useRef(false);
  const appendPhrase = useCallback(
    (text: string) => {
      if (!noteId) return;
      const current = getLocalNote(noteId);
      if (!current) return;
      const body = current.body.trimEnd();
      const joiner = !body ? "" : startedLine.current ? " " : "\n\n";
      startedLine.current = true;
      saveLocalEdit(noteId, { body: `${body}${joiner}${text}` });
      requestNotesSync(api);
    },
    [noteId, api],
  );

  const dictation = useDictation({ api, language, onFinal: appendPhrase });

  const findTodayNote = useCallback(async (): Promise<string | null> => {
    const known = accountNotesRef.current.find(
      (n) =>
        n.workspaceId === activeWorkspaceId &&
        n.server?.periodType === "DAY" &&
        n.server.periodStart === today,
    );
    if (known) return known.id;
    if (!uid) return null;
    const server = await api.getPeriodNote("DAY", today, activeWorkspaceId);
    return cacheServerNote(uid, server).id;
  }, [activeWorkspaceId, today, uid, api]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const s = await api.getDailyReportStatus(activeWorkspaceId);
      setStatus(s);
      if (s.enabled && !s.needsConsent) {
        const [id, waiting] = await Promise.all([
          findTodayNote(),
          api.listDailyReportProposals("PROPOSED", activeWorkspaceId),
        ]);
        setNoteId(id);
        setProposals(waiting);
      }
    } catch (err) {
      if (!(err instanceof TrackerApiError))
        reportUnexpected(err, "daily_report", { op: "load" });
      setLoadError(
        errorText(
          err,
          "Could not load the daily report. Check the connection.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, activeWorkspaceId, findTodayNote]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Drawer screens stay mounted, so leaving this one must turn the microphone off.
  const stopDictation = dictation.stop;
  useFocusEffect(
    useCallback(() => {
      return () => stopDictation(true);
    }, [stopDictation]),
  );

  const toggleDictation = () => {
    if (dictation.isDictating) {
      dictation.stop(false);
      return;
    }
    startedLine.current = false;
    void dictation.start();
  };

  const chooseLanguage = (code: string) => {
    if (dictation.isDictating) return;
    setLanguage(code);
    saveLastLanguage(code);
  };

  const accept = async () => {
    setConsentBusy(true);
    try {
      await api.setDailyReportConsent(true, activeWorkspaceId);
      setLoading(true);
      await load();
    } catch (err) {
      Alert.alert(
        "Daily report",
        errorText(err, "Could not save your answer. Try again."),
      );
    } finally {
      setConsentBusy(false);
    }
  };

  const withdraw = () => {
    Alert.alert(
      "Stop using the daily report?",
      "Your waiting proposals are deleted. Tasks you already accepted stay as they are.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            try {
              setStatus(
                await api.setDailyReportConsent(false, activeWorkspaceId),
              );
              setProposals([]);
            } catch (err) {
              Alert.alert(
                "Daily report",
                errorText(err, "Could not save your answer."),
              );
            }
          },
        },
      ],
    );
  };

  const readReport = async () => {
    if (!noteId) return;
    if (dictation.isDictating) dictation.stop(false);
    const local = getLocalNote(noteId);
    if (!local?.body.trim()) {
      setMessage("Say or write something first.");
      return;
    }
    setReading(true);
    try {
      // The server reads the note it has, so the last words must be up first.
      await syncNotes(api, { force: true });
      const after = getLocalNote(noteId);
      if (after && after.status !== "synced") {
        setMessage(
          "Your report is saved on the phone. It is read when it reaches the server.",
        );
        return;
      }
      const result = await api.extractDailyReport(noteId, activeWorkspaceId);
      const waiting = await api.listDailyReportProposals(
        "PROPOSED",
        activeWorkspaceId,
      );
      setProposals(waiting);
      if (result.proposals.length === 0) {
        setMessage(
          result.skipped === "unchanged"
            ? "Nothing new since the last read."
            : "No changes found for your tasks.",
        );
      }
    } catch (err) {
      if (err instanceof TrackerApiError && err.code === "missing_api_key") {
        Alert.alert(
          "AI key missing",
          "An owner or admin has to add an OpenRouter key to this workspace on the web.",
        );
      } else {
        if (!(err instanceof TrackerApiError)) {
          reportUnexpected(err, "daily_report", { op: "extract" });
        }
        Alert.alert(
          "Daily report",
          errorText(err, "Could not read the report. Try again."),
        );
      }
    } finally {
      setReading(false);
    }
  };

  const review = async (
    items: { id: string; status: "ACCEPTED" | "REJECTED" }[],
  ) => {
    const ids = items.map((i) => i.id);
    setBusyIds(ids);
    try {
      const result = await api.reviewDailyReportProposals(
        items,
        activeWorkspaceId,
      );
      setProposals(
        await api.listDailyReportProposals("PROPOSED", activeWorkspaceId),
      );
      if (result.failed.length > 0) {
        setMessage(
          `${result.failed.length} could not be applied: ${result.failed[0].message}`,
        );
      } else if (items.some((i) => i.status === "ACCEPTED")) {
        setMessage("Your tasks are updated.");
      }
    } catch (err) {
      Alert.alert(
        "Daily report",
        errorText(err, "Could not save your answer. Try again."),
      );
    } finally {
      setBusyIds([]);
    }
  };

  const card = [styles.card, { backgroundColor: theme.colors.surface }];
  const muted = { color: theme.colors.onSurfaceVariant };

  const renderGate = () => {
    if (loading) return <ActivityIndicator style={{ marginTop: 48 }} />;
    if (loadError || !status) {
      return (
        <Surface style={card} elevation={0}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
            {loadError ?? "Could not load the daily report."}
          </Text>
          <Button
            mode="text"
            onPress={() => void load()}
            style={{ alignSelf: "flex-start" }}
          >
            Try again
          </Button>
        </Surface>
      );
    }
    if (!status.available || workspace?.kind === "PERSONAL") {
      return (
        <Surface style={card} elevation={0}>
          <Text variant="titleMedium" style={{ fontWeight: "700" }}>
            Not in a team workspace
          </Text>
          <Text variant="bodyMedium" style={muted}>
            The daily report is for team workspaces. Switch to a team workspace
            to use it.
          </Text>
        </Surface>
      );
    }
    if (!status.enabled) {
      return (
        <Surface style={card} elevation={0}>
          <Text variant="titleMedium" style={{ fontWeight: "700" }}>
            The daily report is off
          </Text>
          <Text variant="bodyMedium" style={muted}>
            {status.canManage
              ? "Turn it on in Daily report on the web. Each member accepts the text before using it."
              : "An owner or admin of this workspace can turn it on."}
          </Text>
        </Surface>
      );
    }
    if (status.needsConsent) {
      return (
        <Surface style={card} elevation={0}>
          <Text
            variant="titleMedium"
            style={{ fontWeight: "700", marginBottom: 8 }}
          >
            Before you start
          </Text>
          <Text variant="bodyMedium" style={styles.paragraph}>
            At the end of the day you say or write what you did. The AI reads it
            next to your open tasks and proposes changes: tasks done, moved
            forward or stuck, and new ones. Nothing changes until you accept it.
          </Text>
          <Text variant="bodyMedium" style={styles.paragraph}>
            The owners and admins of this workspace see your tasks and their
            status, as they already can in the projects, and how many days you
            sent a report. They never see the text or the audio of your report.
            It stays private to you.
          </Text>
          <Text variant="bodyMedium" style={styles.paragraph}>
            Nothing else is recorded: no screen, no keyboard, no location and no
            time in front of the computer.
          </Text>
          <Text variant="bodySmall" style={[styles.paragraph, muted]}>
            You can stop at any time from this screen. Your waiting proposals
            are then deleted.
          </Text>
          <Button
            mode="contained"
            loading={consentBusy}
            disabled={consentBusy}
            onPress={accept}
          >
            I understand, start
          </Button>
        </Surface>
      );
    }
    return null;
  };

  const gate = renderGate();
  const body = note?.body.trim() ?? "";

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Daily report" showProfile={false} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {gate ?? (
          <>
            <Surface style={card} elevation={0}>
              <View style={styles.titleRow}>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: "700", flex: 1 }}
                >
                  {todayLabel()}
                </Text>
                {noteId && (
                  <Button
                    compact
                    icon="pencil"
                    onPress={() => router.push(`/note/${noteId}` as Href)}
                  >
                    Edit
                  </Button>
                )}
              </View>
              {body ? (
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.colors.onSurface, lineHeight: 24 }}
                >
                  {body}
                </Text>
              ) : (
                <Text variant="bodyMedium" style={muted}>
                  What did you do today? What is stuck, and why? What is left
                  for tomorrow?
                </Text>
              )}
              {dictation.interim ? (
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.colors.primary, marginTop: 8 }}
                >
                  {dictation.interim}
                </Text>
              ) : null}
            </Surface>

            <View style={styles.micArea}>
              <Pressable
                onPress={toggleDictation}
                disabled={!noteId || reading}
                accessibilityRole="button"
                accessibilityLabel={
                  dictation.isDictating ? "Stop dictation" : "Dictate"
                }
                style={[
                  styles.mic,
                  {
                    backgroundColor: dictation.isDictating
                      ? theme.colors.error
                      : theme.colors.primary,
                    opacity: !noteId || reading ? 0.5 : 1,
                  },
                ]}
              >
                <Icon
                  source={dictation.isDictating ? "stop" : "microphone"}
                  size={40}
                  color={theme.colors.onPrimary}
                />
              </Pressable>
              <Text variant="bodyMedium" style={[muted, { marginTop: 8 }]}>
                {dictation.isDictating
                  ? "Listening. Tap to stop."
                  : "Tap and say what you did"}
              </Text>
              <View style={styles.languages}>
                {LANGUAGES.map((l) => (
                  <Chip
                    key={l.code}
                    compact
                    selected={language === l.code}
                    showSelectedCheck={false}
                    mode={language === l.code ? "flat" : "outlined"}
                    disabled={dictation.isDictating}
                    onPress={() => chooseLanguage(l.code)}
                  >
                    {l.label}
                  </Chip>
                ))}
              </View>
            </View>

            <Button
              mode="contained"
              icon="auto-fix"
              onPress={readReport}
              loading={reading}
              disabled={reading || !noteId || !body}
              contentStyle={{ paddingVertical: 6 }}
            >
              {reading ? "Reading your report…" : "Update my tasks"}
            </Button>

            <DailyReportProposals
              proposals={proposals}
              busyIds={busyIds}
              onReview={review}
            />

            <Button
              mode="text"
              onPress={withdraw}
              style={{ marginTop: 24 }}
              textColor={muted.color}
            >
              Stop using the daily report
            </Button>
          </>
        )}
      </ScrollView>
      <Snackbar
        visible={!!message}
        onDismiss={() => setMessage(null)}
        duration={4000}
        style={{ marginBottom: 16 + insets.bottom }}
      >
        {message ?? ""}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  paragraph: { marginBottom: 12, lineHeight: 21 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  micArea: { alignItems: "center", marginVertical: 16 },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  languages: { flexDirection: "row", gap: 8, marginTop: 12 },
});
