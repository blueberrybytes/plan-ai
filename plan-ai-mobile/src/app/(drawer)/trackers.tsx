import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Chip,
  Icon,
  IconButton,
  Snackbar,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import {
  HttpError,
  TrackerApiError,
  type PersonalStatus,
  type Tracker,
  type TrackerEntry,
  type TrackerStats,
} from "../../services/planAiApi";
import { localDateKey } from "../../services/notesStore";
import {
  loadPersonalStatus,
  personalReady,
  setPendingProposalCount,
  usePersonalStatus,
} from "../../services/trackersStore";
import {
  addDaysKey,
  caloriesDetailsOf,
  dayLabel,
  formatCalories,
  formatNumber,
  formatValue,
  parseTypedNumber,
  streakLabel,
  unitOf,
  weekdayLetter,
} from "../../utils/trackerFormat";
import { openWebUrl } from "../../utils/openWebUrl";
import { reportUnexpected } from "../../utils/reportError";

const WEB_APP_URL = process.env.EXPO_PUBLIC_PLAN_AI_WEB_URL ?? "https://plan-ai.blueberrybytes.com";
const MAX_TEXT = 2000;
const CHART_DAYS = 7;
const OFFLINE_TEXT = "No connection. Trackers need the network. Pull down to try again.";

interface Data {
  today: string;
  trackers: Tracker[];
  stats: Map<string, TrackerStats>;
  proposals: TrackerEntry[];
  todayEntries: TrackerEntry[];
}

const isOffline = (err: unknown) => err instanceof HttpError && err.status === undefined;

/** Words for a failed call. Never the raw request. */
function describeError(err: unknown): string {
  if (isOffline(err)) return "No connection. This needs the network. Try again when you are online.";
  if (err instanceof TrackerApiError && err.code === "missing_api_key") {
    return "Add an OpenRouter key to your Personal workspace in the settings of the web app. The AI needs it to read what you write.";
  }
  if (err instanceof TrackerApiError && err.code === "personal_mode_required") {
    return "Turn on personal mode in the web app first.";
  }
  if (err instanceof TrackerApiError && err.code === "consent_outdated") {
    return "The consent text has changed. Read and accept it again in the web app.";
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export default function TrackersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const { status, failed } = usePersonalStatus();

  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // Client id per tracker for a value being added, so a retry is not counted twice.
  const addIds = useRef<Record<string, { value: number; id: string }>>({});
  const requestRef = useRef(0);

  const hideCalories = !!status?.hideCalories;
  const workspaceId = status?.workspaceId ?? null;

  const load = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const request = ++requestRef.current;
      const s = await loadPersonalStatus(api, opts);
      if (!personalReady(s)) return;
      const today = localDateKey();
      try {
        const [trackers, stats, proposals, todayEntries] = await Promise.all([
          api.listTrackers(s.workspaceId),
          api.getTrackerStats(
            { today, from: addDaysKey(today, -(CHART_DAYS - 1)), to: today },
            s.workspaceId,
          ),
          api.listTrackerEntries({ status: "PROPOSED" }, s.workspaceId),
          api.listTrackerEntries({ status: "CONFIRMED", from: today, to: today }, s.workspaceId),
        ]);
        if (request !== requestRef.current) return;
        setData({
          today,
          trackers,
          stats: new Map(stats.map((st) => [st.trackerId, st])),
          proposals,
          todayEntries,
        });
        setPendingProposalCount(proposals.length);
        setLoadError(null);
      } catch (err) {
        // Offline and refusals are expected. A bug or a bad answer is not.
        reportUnexpected(err, "trackers", { op: "load" });
        if (request !== requestRef.current) return;
        console.warn("[trackers] could not load", err instanceof HttpError ? err.status : err);
        setLoadError(isOffline(err) ? OFFLINE_TEXT : describeError(err));
      }
    },
    [api],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  };

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(key));
    try {
      await fn();
    } catch (err) {
      reportUnexpected(err, "trackers", { op: "action", key });
      setNotice(describeError(err));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !workspaceId) return;
    setSending(true);
    try {
      const res = await api.extractTrackerEntries(
        { text: body.slice(0, MAX_TEXT), today: localDateKey() },
        workspaceId,
      );
      if (res.skipped === "no_trackers") {
        setNotice("You have no trackers yet. Create them in the web app.");
      } else if (res.entries.length === 0) {
        setNotice("Nothing to log was found in that text.");
      } else {
        setText("");
      }
      await load();
    } catch (err) {
      reportUnexpected(err, "trackers", { op: "extract_text" });
      setNotice(describeError(err));
    } finally {
      setSending(false);
    }
  };

  const review = (entry: TrackerEntry, accept: boolean) =>
    withBusy(entry.id, async () => {
      await api.updateTrackerEntry(
        entry.id,
        { status: accept ? "CONFIRMED" : "REJECTED" },
        workspaceId,
      );
      await load();
    });

  const acceptAll = () =>
    withBusy("all", async () => {
      const ids = (data?.proposals ?? []).map((p) => p.id);
      if (ids.length === 0) return;
      await api.reviewTrackerEntries({ ids, status: "CONFIRMED" }, workspaceId);
      await load();
    });

  const toggleCheck = (tracker: Tracker, done: boolean) =>
    withBusy(tracker.id, async () => {
      const today = data?.today ?? localDateKey();
      if (done) {
        const mine = (data?.todayEntries ?? []).filter((e) => e.trackerId === tracker.id);
        for (const e of mine) await api.deleteTrackerEntry(e.id, workspaceId);
      } else {
        await api.addTrackerEntry(
          tracker.id,
          { id: Crypto.randomUUID(), date: today },
          workspaceId,
        );
      }
      await load();
    });

  const addValue = (tracker: Tracker) => {
    const value = parseTypedNumber(inputs[tracker.id] ?? "");
    if (value === null) {
      setNotice("Type a number, for example 2 or 1.5.");
      return;
    }
    // The same value sent again after a failure reuses its id.
    const prev = addIds.current[tracker.id];
    const id = prev && prev.value === value ? prev.id : Crypto.randomUUID();
    addIds.current[tracker.id] = { value, id };
    return withBusy(tracker.id, async () => {
      await api.addTrackerEntry(
        tracker.id,
        { id, date: data?.today ?? localDateKey(), value },
        workspaceId,
      );
      delete addIds.current[tracker.id];
      setInputs((i) => ({ ...i, [tracker.id]: "" }));
      await load();
    });
  };

  const removeEntry = (tracker: Tracker, entry: TrackerEntry) => {
    const what =
      tracker.kind === "CALORIES" && hideCalories
        ? entry.label || "this food"
        : formatValue(entry.value, tracker);
    Alert.alert("Remove this value?", `${what} is removed from today.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void withBusy(entry.id, async () => {
            await api.deleteTrackerEntry(entry.id, workspaceId);
            await load();
          }),
      },
    ]);
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  const muted = { color: theme.colors.onSurfaceVariant };

  const renderGate = () => {
    if (!status) {
      return failed ? (
        <Message icon="cloud-off-outline" text={OFFLINE_TEXT} action={{ label: "Try again", onPress: onRefresh }} />
      ) : (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.colors.primary} />
      );
    }
    if (!status.available) {
      return <Message icon="lock-outline" text="Trackers are not available for this account." />;
    }
    if (!personalReady(status)) {
      return (
        <Message
          icon="shield-account-outline"
          text={
            status.consentOutdated
              ? "The personal mode consent text has changed. Read and accept it again in the web app to keep using trackers."
              : "Trackers use personal mode. Turn it on from the web app, then pull down to refresh."
          }
          action={{ label: "Open the web app", onPress: () => void openWebUrl(WEB_APP_URL) }}
        />
      );
    }
    return null;
  };

  const gate = renderGate();

  const renderProposal = (entry: TrackerEntry, trackers: Map<string, Tracker>, today: string) => {
    const tracker = trackers.get(entry.trackerId);
    const kind = tracker?.kind ?? "NUMBER";
    const details = kind === "CALORIES" ? caloriesDetailsOf(entry) : null;
    let value: string;
    if (kind === "CHECK") value = "Done";
    else if (kind === "CALORIES") value = hideCalories ? (entry.label ?? "Food") : formatCalories(entry.value, details);
    else value = tracker ? formatValue(entry.value, tracker) : formatNumber(entry.value);
    const isBusy = busy.has(entry.id) || busy.has("all");
    return (
      <Surface key={entry.id} style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
              {tracker?.name ?? "Tracker"}
            </Text>
            <Text variant="bodySmall" style={muted}>
              {dayLabel(entry.date, today)}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginTop: 4 }}>
              {value}
            </Text>
            {kind !== "CALORIES" && entry.label ? (
              <Text variant="bodySmall" style={muted}>
                {entry.label}
              </Text>
            ) : null}
            {details?.items.map((item, i) => {
              const parts = [item.name];
              if (item.grams !== null) parts.push(`${formatNumber(Math.round(item.grams))} g`);
              if (!hideCalories && item.kcal !== null) parts.push(`${formatNumber(Math.round(item.kcal))} kcal`);
              return (
                <Text key={`${entry.id}-${i}`} variant="bodySmall" style={muted}>
                  {parts.join(", ")}
                </Text>
              );
            })}
          </View>
          <IconButton
            icon="close"
            accessibilityLabel="Reject"
            disabled={isBusy}
            onPress={() => void review(entry, false)}
          />
          <IconButton
            icon="check"
            mode="contained"
            accessibilityLabel="Accept"
            disabled={isBusy}
            onPress={() => void review(entry, true)}
          />
        </View>
      </Surface>
    );
  };

  const renderWeek = (tracker: Tracker, stats: TrackerStats | undefined, hidden: boolean) => {
    const days = (stats?.days ?? []).slice(-CHART_DAYS);
    if (days.length === 0) return null;
    const dotsOnly = tracker.kind === "CHECK" || hidden;
    const max = Math.max(
      1,
      tracker.goalValue ?? 0,
      ...days.map((d) => d.value ?? 0),
    );
    return (
      <View style={styles.week} accessibilityLabel="Last 7 days">
        {days.map((d) => {
          let fill: React.ReactNode;
          if (dotsOnly) {
            const on = tracker.kind === "CHECK" ? (d.value ?? 0) > 0 : d.goalMet === true;
            const off = tracker.kind !== "CHECK" && d.goalMet === false;
            fill = (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: on
                      ? theme.colors.primary
                      : off
                        ? theme.colors.outline
                        : theme.colors.surfaceVariant,
                  },
                ]}
              />
            );
          } else {
            const h = Math.round(((d.value ?? 0) / max) * 32);
            fill = (
              <View style={styles.barTrack}>
                <View
                  style={{
                    height: Math.max(h, d.value ? 2 : 0),
                    backgroundColor: d.goalMet === false && tracker.goalDirection === "AT_MOST"
                      ? theme.colors.error
                      : theme.colors.primary,
                    borderRadius: 2,
                  }}
                />
              </View>
            );
          }
          return (
            <View key={d.date} style={styles.weekDay}>
              {fill}
              <Text variant="labelSmall" style={muted}>
                {weekdayLetter(d.date)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderTracker = (tracker: Tracker, d: Data) => {
    const stats = d.stats.get(tracker.id);
    const hidden = tracker.kind === "CALORIES" && hideCalories;
    const isBusy = busy.has(tracker.id);
    const todayEntries = d.todayEntries.filter((e) => e.trackerId === tracker.id);
    const weekly = tracker.goalPeriod === "WEEK";
    const current = (weekly ? stats?.week : stats?.today) ?? 0;
    const goal = tracker.goalValue;
    const goalMet = weekly ? stats?.goalMetThisWeek : stats?.goalMetToday;
    const done = (stats?.today ?? 0) > 0 || todayEntries.length > 0;

    let summary: string;
    if (tracker.kind === "CHECK") {
      summary = done ? "Done today" : "Not done yet today";
      if (weekly && goal) summary += `. ${formatNumber(stats?.week ?? 0)} of ${formatNumber(goal)} this week`;
    } else if (hidden) {
      summary = todayEntries.length ? `${todayEntries.length} logged today` : "Nothing logged today";
    } else if (goal) {
      summary = `${formatValue(current, tracker)} of ${formatValue(goal, tracker)} ${weekly ? "this week" : "today"}`;
    } else {
      summary = `${formatValue(stats?.today ?? 0, tracker)} today`;
    }

    let goalText: string | null = null;
    if (goal && goalMet === true) goalText = "Goal met";
    else if (goal && goalMet === false) {
      goalText = tracker.goalDirection === "AT_MOST" ? "Over the goal" : "Goal not met yet";
    }

    const showBar = !!goal && !hidden && tracker.kind !== "CHECK";
    const ratio = showBar && goal ? Math.min(1, Math.max(0, current / goal)) : 0;
    const over = tracker.goalDirection === "AT_MOST" && goal !== null && current > goal;

    const card = (
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
              {tracker.name}
            </Text>
            <Text variant="bodyMedium" style={muted}>
              {summary}
            </Text>
          </View>
          {tracker.kind === "CHECK" &&
            (isBusy ? (
              <ActivityIndicator style={{ margin: 12 }} />
            ) : (
              <Icon
                source={done ? "check-circle" : "checkbox-blank-circle-outline"}
                size={32}
                color={done ? theme.colors.primary : theme.colors.outline}
              />
            ))}
        </View>

        {showBar && (
          <View
            style={[styles.barBg, { backgroundColor: theme.colors.surfaceVariant }]}
            accessibilityLabel={`${Math.round(ratio * 100)} percent of the goal`}
          >
            <View
              style={{
                width: `${ratio * 100}%`,
                height: "100%",
                borderRadius: 4,
                backgroundColor: over ? theme.colors.error : theme.colors.primary,
              }}
            />
          </View>
        )}

        {(goalText || (stats && stats.streak > 0)) && (
          <View style={[styles.row, { marginTop: 8, gap: 12 }]}>
            {goalText && (
              <Text
                variant="bodySmall"
                style={{ color: goalMet ? theme.colors.primary : over ? theme.colors.error : theme.colors.onSurfaceVariant }}
              >
                {goalText}
              </Text>
            )}
            {stats && stats.streak > 0 && (
              <Text variant="bodySmall" style={muted}>
                {streakLabel(stats.streak, stats.streakUnit)}
              </Text>
            )}
          </View>
        )}

        {renderWeek(tracker, stats, hidden)}

        {tracker.kind !== "CHECK" && todayEntries.length > 0 && (
          <View style={styles.chips}>
            {todayEntries.map((e) => (
              <Chip
                key={e.id}
                compact
                disabled={busy.has(e.id)}
                onClose={() => removeEntry(tracker, e)}
                closeIcon="close"
              >
                {hidden ? (e.label ?? "Food") : formatValue(e.value, tracker)}
              </Chip>
            ))}
          </View>
        )}

        {tracker.kind !== "CHECK" &&
          (hidden ? (
            <Text variant="bodySmall" style={[muted, { marginTop: 8 }]}>
              Log food with the box at the top.
            </Text>
          ) : (
            <View style={[styles.row, { marginTop: 8, gap: 8 }]}>
              <TextInput
                mode="outlined"
                dense
                style={{ flex: 1 }}
                keyboardType="decimal-pad"
                placeholder={unitOf(tracker) ? `Add ${unitOf(tracker)} for today` : "Add a value for today"}
                value={inputs[tracker.id] ?? ""}
                onChangeText={(v) => setInputs((i) => ({ ...i, [tracker.id]: v }))}
                onSubmitEditing={() => void addValue(tracker)}
                returnKeyType="done"
              />
              <Button
                mode="contained-tonal"
                loading={isBusy}
                disabled={isBusy || !(inputs[tracker.id] ?? "").trim()}
                onPress={() => void addValue(tracker)}
              >
                Add
              </Button>
            </View>
          ))}
      </Surface>
    );

    if (tracker.kind !== "CHECK") return <View key={tracker.id}>{card}</View>;
    return (
      <Pressable
        key={tracker.id}
        disabled={isBusy}
        onPress={() => void toggleCheck(tracker, done)}
        accessibilityRole="button"
        accessibilityLabel={done ? `${tracker.name}, done today. Tap to undo.` : `${tracker.name}. Tap to mark done today.`}
      >
        {card}
      </Pressable>
    );
  };

  const renderContent = (s: PersonalStatus) => {
    if (!data) {
      return loadError ? (
        <Message icon="cloud-off-outline" text={loadError} action={{ label: "Try again", onPress: onRefresh }} />
      ) : (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.colors.primary} />
      );
    }
    const byId = new Map(data.trackers.map((t) => [t.id, t]));
    const hasCalories = data.trackers.some((t) => t.kind === "CALORIES");
    return (
      <>
        {loadError && (
          <Text variant="bodySmall" style={[muted, { marginBottom: 8 }]}>
            {loadError}
          </Text>
        )}

        {data.proposals.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={[styles.row, { marginBottom: 8 }]}>
              <Text variant="titleSmall" style={{ flex: 1, color: theme.colors.onSurface }}>
                To review ({data.proposals.length})
              </Text>
              <Button
                mode="text"
                compact
                loading={busy.has("all")}
                disabled={busy.has("all")}
                onPress={() => void acceptAll()}
              >
                Accept all
              </Button>
            </View>
            {data.proposals.map((p) => renderProposal(p, byId, data.today))}
          </View>
        )}

        {data.trackers.length === 0 ? (
          <Message icon="chart-line" text="No trackers yet. Create them in the web app, then pull down to refresh." />
        ) : (
          data.trackers.map((t) => renderTracker(t, data))
        )}

        {hasCalories && (
          <Text variant="bodySmall" style={[muted, styles.footer]}>
            Calories are AI estimates, not medical advice.
          </Text>
        )}
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior="padding"
    >
      <ScreenHeader title="Trackers" showProfile={false} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {gate ?? (
          <>
            <TextInput
              mode="outlined"
              placeholder="What did you eat or do?"
              value={text}
              onChangeText={setText}
              maxLength={MAX_TEXT}
              multiline
              editable={!sending}
              style={{ marginBottom: 4 }}
              right={
                <TextInput.Icon
                  icon="send"
                  accessibilityLabel="Send"
                  disabled={sending || !text.trim()}
                  onPress={() => void send()}
                />
              }
            />
            <Text variant="bodySmall" style={[muted, { marginBottom: 16 }]}>
              {sending
                ? "Reading..."
                : "For example: two eggs and toast, walked 5 km. You review what the AI finds before it counts."}
            </Text>
            {status && renderContent(status)}
          </>
        )}
      </ScrollView>

      <Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={6000}>
        {notice ?? ""}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

function Message({
  icon,
  text,
  action,
}: {
  icon: string;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View style={styles.message}>
      <Avatar.Icon
        size={72}
        icon={icon}
        style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 16 }}
        color={theme.colors.onSurfaceVariant}
      />
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
        {text}
      </Text>
      {action && (
        <Button mode="outlined" style={{ marginTop: 16 }} onPress={action.onPress}>
          {action.label}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  content: { paddingHorizontal: 16 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  barBg: { height: 8, borderRadius: 4, marginTop: 12, overflow: "hidden" },
  week: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  weekDay: { alignItems: "center", flex: 1, gap: 4 },
  barTrack: { height: 32, width: 12, justifyContent: "flex-end" },
  dot: { width: 12, height: 12, borderRadius: 6, marginVertical: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  message: { alignItems: "center", paddingHorizontal: 24, paddingTop: 48 },
  footer: { textAlign: "center", marginTop: 8 },
});
