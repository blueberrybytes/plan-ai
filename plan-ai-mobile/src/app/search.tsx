import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Searchbar, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { TrackerApiError, type SearchHit } from "../services/planAiApi";

// Same rules as the web palette. The server refuses a shorter query.
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 30;

type HitType = SearchHit["type"];

// The order of the groups on screen, as on the web.
const GROUPS: { type: HitType; title: string; icon: string }[] = [
  { type: "meeting", title: "Meetings", icon: "waveform" },
  { type: "task", title: "Tasks", icon: "checkbox-marked-circle-outline" },
  { type: "document", title: "Documents", icon: "file-document-outline" },
  { type: "project", title: "Projects", icon: "folder-outline" },
];
const ICONS = Object.fromEntries(GROUPS.map((g) => [g.type, g.icon])) as Record<HitType, string>;

type Failure = { offline: boolean; message: string };

/** 95 becomes "1:35", 3725 becomes "1:02:05". */
const formatHitTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const formatHitDate = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
};

/** Where a hit opens on the phone. */
const hitHref = (hit: SearchHit): Href => {
  switch (hit.type) {
    case "meeting":
      return `/transcript/${hit.id}` as Href;
    case "task":
      // The task screen loads the task through its project. A task without
      // one has no screen, so it opens the projects list.
      return hit.projectId
        ? ({ pathname: `/task/${hit.id}`, params: { projectId: hit.projectId } } as unknown as Href)
        : ("/projects" as Href);
    case "document":
      return `/doc/${hit.id}` as Href;
    case "project":
      return `/project/${hit.id}` as Href;
  }
};

const failureOf = (err: unknown): Failure => {
  if (err instanceof TrackerApiError && err.status === undefined) {
    return { offline: true, message: "You are offline. Search needs a connection." };
  }
  if (err instanceof TrackerApiError && err.status !== undefined && err.status < 500) {
    return { offline: false, message: err.message };
  }
  return { offline: false, message: "The search failed. Try again." };
};

/**
 * Searches meetings, tasks, documents and projects of the active workspace,
 * like the command palette of the web app.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api, activeWorkspaceId } = useAuth();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  // The query the hits on screen answer.
  const [answered, setAnswered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Only the answer to the last request is shown.
  const requestId = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmed]);

  const runSearch = useCallback(
    async (q: string) => {
      const id = ++requestId.current;
      if (q.length < SEARCH_MIN_CHARS) {
        setLoading(false);
        setFailure(null);
        setHits([]);
        setAnswered(null);
        return;
      }
      setLoading(true);
      setFailure(null);
      try {
        const result = await api.globalSearch(q, SEARCH_LIMIT);
        if (id !== requestId.current) return;
        setHits(result.hits);
        setAnswered(q);
      } catch (err) {
        if (id !== requestId.current) return;
        setHits([]);
        setAnswered(null);
        setFailure(failureOf(err));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [api],
  );

  // A new workspace runs the search again.
  useEffect(() => {
    if (activeWorkspaceId === null) return;
    runSearch(debounced);
  }, [debounced, activeWorkspaceId, runSearch]);

  // Old hits stay on screen while the next query runs, not once it is too short.
  const showHits = trimmed.length >= SEARCH_MIN_CHARS;
  const sections = useMemo(
    () =>
      GROUPS.map((g) => ({
        type: g.type,
        title: g.title,
        data: showHits ? hits.filter((h) => h.type === g.type) : [],
      })).filter((s) => s.data.length > 0),
    [hits, showHits],
  );

  const tooShort = trimmed.length > 0 && trimmed.length < SEARCH_MIN_CHARS;
  // The text on screen is ahead of the request while the user types.
  const waiting = trimmed.length >= SEARCH_MIN_CHARS && (loading || debounced !== trimmed);

  let statusText: string | null = null;
  if (trimmed.length === 0) {
    statusText = "Search meetings, tasks, documents and projects.";
  } else if (tooShort) {
    statusText = "Type at least 2 characters.";
  } else if (failure && !waiting) {
    statusText = failure.message;
  } else if (waiting && hits.length === 0) {
    statusText = "Searching...";
  } else if (!waiting && answered === trimmed && hits.length === 0) {
    statusText = `No results for "${trimmed}".`;
  }

  const renderItem = ({ item }: { item: SearchHit }) => {
    const title = item.title || (item.type === "meeting" ? "Untitled meeting" : "Untitled");
    const detail = [
      item.type !== "project" ? item.projectTitle : null,
      formatHitDate(item.date),
      item.atSeconds !== undefined ? `at ${formatHitTime(item.atSeconds)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <Card
        mode="contained"
        style={[styles.row, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push(hitHref(item))}
        accessibilityLabel={title}
      >
        <View style={styles.rowInner}>
          <Avatar.Icon
            size={36}
            icon={ICONS[item.type]}
            style={{ backgroundColor: theme.colors.surfaceVariant }}
            color={theme.colors.onSurfaceVariant}
          />
          <View style={styles.rowText}>
            <Text
              variant="titleSmall"
              numberOfLines={1}
              style={{ color: theme.colors.onSurface, fontWeight: "600" }}
            >
              {title}
            </Text>
            {item.snippet ? (
              <Text
                variant="bodySmall"
                numberOfLines={2}
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
              >
                {item.snippet}
              </Text>
            ) : null}
            {detail ? (
              <Text
                variant="labelSmall"
                numberOfLines={1}
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
              >
                {detail}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + 12 },
      ]}
    >
      <View style={styles.controls}>
        <Searchbar
          autoFocus
          placeholder="Search meetings, tasks, documents..."
          value={query}
          onChangeText={setQuery}
          icon="arrow-left"
          onIconPress={() => (router.canGoBack() ? router.back() : router.replace("/" as Href))}
          loading={waiting}
          maxLength={200}
          returnKeyType="search"
          autoCorrect={false}
          style={{ backgroundColor: theme.colors.surfaceVariant, elevation: 0 }}
          inputStyle={{ color: theme.colors.onSurface }}
          iconColor={theme.colors.primary}
          accessibilityLabel="Search the workspace"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.type}:${item.id}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text
            variant="labelLarge"
            style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}
          >
            {section.title}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: 32 + insets.bottom }]}
        ListHeaderComponent={
          statusText ? (
            <View style={styles.status}>
              <Text
                variant="bodyMedium"
                style={{
                  color: failure && !waiting ? theme.colors.error : theme.colors.onSurfaceVariant,
                  textAlign: "center",
                }}
              >
                {statusText}
              </Text>
              {failure && !waiting ? (
                <Button
                  mode="text"
                  icon="refresh"
                  onPress={() => runSearch(trimmed)}
                  style={{ marginTop: 8 }}
                >
                  Try again
                </Button>
              ) : null}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { paddingHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16 },
  sectionHeader: { marginTop: 16, marginBottom: 8, fontWeight: "700" },
  row: { borderRadius: 12, marginBottom: 8 },
  rowInner: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  status: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 32 },
});
