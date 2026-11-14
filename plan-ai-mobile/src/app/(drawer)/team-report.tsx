import React, { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, IconButton, Surface, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import {
  HttpError,
  type TeamReport,
  type TeamReportMember,
  type TeamReportTask,
} from "../../services/planAiApi";
import { addDaysKey } from "../../utils/trackerFormat";
import { reportUnexpected } from "../../utils/reportError";

const SHOWN = 5;

const hasActivity = (m: TeamReportMember) =>
  m.completedCount > 0 || m.inProgressCount > 0 || m.blocked.length > 0 || m.overdueCount > 0;

/** "3 Nov" from a day key (2026-11-03) or an ISO time. */
function shortDay(value: string | null): string | null {
  if (!value) return null;
  const key = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = key ? new Date(Number(key[1]), Number(key[2]) - 1, Number(key[3]), 12) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Words for a failed call. Never the report itself. */
function errorText(err: unknown, summary: boolean): string {
  if (err instanceof HttpError && err.status === undefined) {
    return "No connection. The team report needs the network. Pull down to try again.";
  }
  if (err instanceof HttpError && err.status === 403) {
    return "Only owners and admins can read the team report.";
  }
  if (summary) {
    if (err instanceof HttpError && err.status !== undefined && err.status < 500 && err.message) {
      return `Could not write the summaries. ${err.message}`;
    }
    return "Could not write the summaries.";
  }
  return "Could not load the team report. Try again.";
}

/**
 * The team's week for owners and admins: per member what was closed, what
 * is stuck and what is past due. It comes from tasks. The text of daily
 * reports stays private.
 */
export default function TeamReportScreen() {
  const { activeWorkspaceId } = useAuth();
  // Another workspace is another team. The key starts again at last week.
  return <TeamReportView key={activeWorkspaceId ?? "none"} />;
}

function TeamReportView() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useAuth();

  // Undefined asks the server for last week.
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<TeamReport | null>(null);
  // Summaries are kept for the week they were written for.
  const [withSummary, setWithSummary] = useState<TeamReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await api.getTeamReport({ week });
      if (request !== requestRef.current) return;
      setReport(next);
      setError(null);
    } catch (err) {
      reportUnexpected(err, "daily_report", { op: "team_report" });
      if (request !== requestRef.current) return;
      // Status only. The report holds task titles and reasons.
      console.warn("[team-report] could not load", err instanceof HttpError ? err.status : "error");
      setError(errorText(err, false));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [api, week]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shown = withSummary && report && withSummary.weekStart === report.weekStart ? withSummary : report;

  const goTo = (weeks: number) => {
    if (!shown) return;
    setSummaryError(null);
    setWeek(addDaysKey(shown.weekStart, weeks * 7));
  };

  const writeSummaries = async () => {
    if (!shown || summarizing) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await api.getTeamReport({ week: shown.weekStart, summary: true, language: "en" });
      setWithSummary(result);
    } catch (err) {
      reportUnexpected(err, "daily_report", { op: "team_report_summary" });
      console.warn("[team-report] could not summarize", err instanceof HttpError ? err.status : "error");
      setSummaryError(errorText(err, true));
    } finally {
      setSummarizing(false);
    }
  };

  const muted = { color: theme.colors.onSurfaceVariant };

  const renderTasks = (
    label: string,
    color: string,
    tasks: TeamReportTask[],
    total: number,
    note: (t: TeamReportTask) => string | null,
  ) => {
    if (tasks.length === 0) return null;
    const list = tasks.slice(0, SHOWN);
    return (
      <View style={{ marginTop: 12 }}>
        <Text variant="labelMedium" style={{ color, fontWeight: "700" }}>
          {label}
        </Text>
        {list.map((t) => {
          const extra = note(t);
          return (
            <Text key={t.id} variant="bodyMedium" style={[styles.task, { color: theme.colors.onSurface }]}>
              {t.title}
              {extra ? <Text style={muted}>{`. ${extra}`}</Text> : null}
            </Text>
          );
        })}
        {total > list.length && (
          <Text variant="bodyMedium" style={[styles.task, muted]}>
            and {total - list.length} more
          </Text>
        )}
      </View>
    );
  };

  const count = (label: string, value: number, color: string) => (
    <View style={[styles.count, { borderColor: theme.colors.outlineVariant }]}>
      <Text variant="titleMedium" style={{ color, fontWeight: "700" }}>
        {value}
      </Text>
      <Text variant="bodySmall" style={muted}>
        {label}
      </Text>
    </View>
  );

  const renderMember = (m: TeamReportMember) => (
    <Surface key={m.userId} style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={0}>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
        {m.name}
      </Text>
      <View style={styles.counts}>
        {count("Closed", m.completedCount, theme.colors.primary)}
        {count("In progress", m.inProgressCount, theme.colors.onSurface)}
        {count("Stuck", m.blocked.length, m.blocked.length > 0 ? theme.colors.tertiary : theme.colors.onSurface)}
        {count("Past due", m.overdueCount, m.overdueCount > 0 ? theme.colors.error : theme.colors.onSurface)}
      </View>
      <Text variant="bodySmall" style={[muted, { marginTop: 8 }]}>
        {m.reportDays === null ? "Does not use the daily report" : `Daily report: ${m.reportDays} of 5 days`}
      </Text>
      {m.summary ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginTop: 12, lineHeight: 21 }}>
          {m.summary}
        </Text>
      ) : null}
      {renderTasks("Closed", theme.colors.primary, m.completed, m.completedCount, (t) => t.projectTitle)}
      {renderTasks("Stuck", theme.colors.tertiary, m.blocked, m.blocked.length, (t) => t.reason)}
      {renderTasks("Past due", theme.colors.error, m.overdue, m.overdueCount, (t) =>
        t.date ? `due ${shortDay(t.date)}` : null,
      )}
    </Surface>
  );

  const renderContent = () => {
    if (!shown) {
      if (error) {
        return (
          <View style={styles.message}>
            <Text variant="bodyLarge" style={[muted, { textAlign: "center" }]}>
              {error}
            </Text>
            <Button mode="outlined" style={{ marginTop: 16 }} onPress={() => void onRefresh()}>
              Try again
            </Button>
          </View>
        );
      }
      return <ActivityIndicator style={{ marginTop: 48 }} color={theme.colors.primary} />;
    }
    const active = shown.members.filter(hasActivity);
    const quiet = shown.members.length - active.length;
    return (
      <>
        <View style={styles.weekRow}>
          <IconButton
            icon="chevron-left"
            accessibilityLabel="Previous week"
            disabled={loading || summarizing}
            onPress={() => goTo(-1)}
          />
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, flex: 1, textAlign: "center" }}>
            {`${shortDay(shown.weekStart)} to ${shortDay(shown.weekEnd)}`}
          </Text>
          <IconButton
            icon="chevron-right"
            accessibilityLabel="Next week"
            disabled={loading || summarizing}
            onPress={() => goTo(1)}
          />
        </View>

        <Button
          mode="outlined"
          icon="text-box-outline"
          onPress={() => void writeSummaries()}
          loading={summarizing}
          disabled={summarizing || loading || active.length === 0}
          style={{ marginBottom: 8 }}
        >
          {summarizing ? "Writing..." : "Write summaries with AI"}
        </Button>
        {summaryError && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {summaryError}
          </Text>
        )}
        {error && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {error}
          </Text>
        )}

        {!shown.dailyReportEnabled && (
          <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              The daily report is off in this workspace. The report still shows tasks.
            </Text>
            <Button
              mode="text"
              compact
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              onPress={() => router.push("/daily-report" as Href)}
            >
              Daily report settings
            </Button>
          </Surface>
        )}

        <View style={{ opacity: loading ? 0.6 : 1 }}>
          {active.length === 0 ? (
            <Text variant="bodyMedium" style={[muted, { marginTop: 8 }]}>
              No member has assigned tasks this week.
            </Text>
          ) : (
            active.map(renderMember)
          )}
        </View>
        {quiet > 0 && active.length > 0 && (
          <Text variant="bodySmall" style={[muted, { marginTop: 4 }]}>
            {quiet === 1
              ? "1 member with no assigned tasks this week"
              : `${quiet} members with no assigned tasks this week`}
          </Text>
        )}
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title="Team report" showProfile={false} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <Text variant="bodyMedium" style={[muted, { marginBottom: 8, lineHeight: 21 }]}>
          What each person closed, what is stuck and what is past due. It comes from tasks. The text of daily reports
          stays private.
        </Text>
        {renderContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  weekRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  counts: { flexDirection: "row", gap: 8, marginTop: 12 },
  count: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  task: { marginTop: 4, lineHeight: 20 },
  message: { alignItems: "center", paddingHorizontal: 24, paddingTop: 48 },
});
