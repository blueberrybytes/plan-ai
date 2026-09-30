import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  FAB,
  Icon,
  List,
  Searchbar,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import { WorkspaceSelector } from "../../components/WorkspaceSelector";
import type { Note, NoteScope } from "../../services/planAiApi";
import {
  byListOrder,
  cacheServerNote,
  cacheServerNotes,
  cancelLocalTrash,
  fromServer,
  isUnsynced,
  localDateKey,
  matchesQuery,
  matchesScope,
  noteDisplayTitle,
  takeLastTrashed,
  useAccountNotes,
  type LocalNote,
} from "../../services/notesStore";
import { syncNotes } from "../../services/notesSync";
import { reportUnexpected } from "../../utils/reportError";

const TABS: { value: NoteScope; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "all", label: "All" },
  { value: "pinned", label: "Pinned" },
  { value: "shared", label: "Shared" },
];
const PAGE = 50;

interface ServerPage {
  key: string;
  notes: Note[];
  nextCursor: string | null;
}

/** Second line of a row: the body after the line used as the title. */
function previewOf(n: LocalNote): string {
  const lines = n.body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rest = n.title.trim() ? lines : lines.slice(1);
  return rest.join(" ").slice(0, 120);
}

export default function NotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api, user, activeWorkspaceId } = useAuth();
  const uid = user?.uid ?? null;
  const accountNotes = useAccountNotes(uid);

  const [scope, setScope] = useState<NoteScope>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<ServerPage | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingToday, setOpeningToday] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const key = `${activeWorkspaceId ?? ""}|${scope}|${query}`;

  const fetchFirstPage = useCallback(async () => {
    if (!uid || !activeWorkspaceId) return;
    const request = ++requestRef.current;
    try {
      const res = await api.listNotes(
        { scope, q: query || undefined, limit: PAGE },
        activeWorkspaceId,
      );
      if (request !== requestRef.current) return;
      cacheServerNotes(uid, res.notes, {
        workspaceId: activeWorkspaceId,
        complete: scope === "all" && !query && !res.nextCursor,
      });
      setPage({ key, notes: res.notes, nextCursor: res.nextCursor });
      setOffline(false);
    } catch (err) {
      // Offline and refusals are expected. A bug or a bad answer is not.
      reportUnexpected(err, "notes", { op: "list", scope });
      if (request !== requestRef.current) return;
      console.warn("[notes] could not load the list", err);
      setOffline(true);
    }
  }, [api, uid, activeWorkspaceId, scope, query, key]);

  useFocusEffect(
    useCallback(() => {
      void fetchFirstPage();
      const trashed = takeLastTrashed();
      if (trashed) setUndoId(trashed);
    }, [fetchFirstPage]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncNotes(api).catch(() => undefined);
    await fetchFirstPage();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!uid || !page || page.key !== key || !page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listNotes(
        { scope, q: query || undefined, limit: PAGE, cursor: page.nextCursor },
        activeWorkspaceId,
      );
      cacheServerNotes(uid, res.notes);
      setPage((p) =>
        p && p.key === key
          ? { key, notes: [...p.notes, ...res.notes], nextCursor: res.nextCursor }
          : p,
      );
    } catch (err) {
      // the next scroll tries again
      reportUnexpected(err, "notes", { op: "list_more", scope });
    } finally {
      setLoadingMore(false);
    }
  };

  // What the phone has for this workspace: notes waiting to upload and the
  // cache of synced ones. Notes with no workspace yet belong to the active one.
  const byId = new Map(accountNotes.map((n) => [n.id, n]));
  const local = accountNotes.filter(
    (n) =>
      !n.pendingTrash &&
      n.status !== "draft" &&
      (n.workspaceId === activeWorkspaceId || n.workspaceId === null),
  );
  const matching = (n: LocalNote) => matchesScope(n, scope) && matchesQuery(n, query);

  let rows: LocalNote[];
  if (page && page.key === key) {
    // The server's answer, with local edits on top and notes not uploaded yet.
    const seen = new Set<string>();
    rows = [];
    for (const note of page.notes) {
      const mine = byId.get(note.id);
      if (mine?.pendingTrash) continue;
      const row = mine ?? fromServer(note, uid ?? "");
      seen.add(row.id);
      rows.push(row);
    }
    for (const n of local) {
      if (!seen.has(n.id) && isUnsynced(n) && matching(n)) rows.push(n);
    }
    rows.sort(byListOrder);
  } else {
    rows = local.filter(matching).sort(byListOrder);
  }

  const openNote = (id: string) => router.push(`/note/${id}` as Href);

  const openToday = async () => {
    if (!uid || openingToday) return;
    const date = localDateKey();
    const known = local.find(
      (n) =>
        n.workspaceId === activeWorkspaceId &&
        n.server?.periodType === "DAY" &&
        n.server.periodStart === date,
    );
    if (known) {
      openNote(known.id);
      return;
    }
    setOpeningToday(true);
    try {
      const note = await api.getPeriodNote("DAY", date, activeWorkspaceId);
      cacheServerNote(uid, note);
      openNote(note.id);
    } catch (err) {
      reportUnexpected(err, "notes", { op: "open_today" });
      Alert.alert(
        "Could not open today's note",
        "Today's note is made on the server the first time. Check the connection and try again.",
      );
    } finally {
      setOpeningToday(false);
    }
  };

  const undoTrash = async () => {
    const id = undoId;
    setUndoId(null);
    if (!id || !uid) return;
    if (cancelLocalTrash(id)) return;
    try {
      const note = await api.restoreNote(id, activeWorkspaceId);
      cacheServerNote(uid, note);
      void fetchFirstPage();
    } catch (err) {
      reportUnexpected(err, "notes", { op: "restore", noteId: id });
      Alert.alert("Could not restore the note", "Check the connection and try again.");
    }
  };

  const renderItem = ({ item }: { item: LocalNote }) => {
    const date = new Date(item.updatedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const preview = previewOf(item);
    const unsynced = isUnsynced(item);
    return (
      <List.Item
        title={noteDisplayTitle(item)}
        titleNumberOfLines={1}
        titleStyle={{ color: theme.colors.onSurface, fontWeight: "600" }}
        description={preview ? `${date}  ${preview}` : date}
        descriptionNumberOfLines={1}
        descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
        onPress={() => openNote(item.id)}
        style={[styles.row, { backgroundColor: theme.colors.surface }]}
        left={(p) => (
          <List.Icon
            {...p}
            icon={item.pinned ? "pin" : item.server?.periodType ? "calendar-today" : "note-text-outline"}
            color={item.pinned ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
        )}
        right={() => (
          <View style={styles.rowIcons}>
            {item.status === "conflict" && (
              <Icon source="alert-circle-outline" size={18} color={theme.colors.error} />
            )}
            {item.permanentError ? (
              <Icon source="cloud-alert" size={18} color={theme.colors.error} />
            ) : unsynced ? (
              <Icon source="cloud-upload-outline" size={18} color={theme.colors.onSurfaceVariant} />
            ) : null}
            <Icon
              source={item.visibility === "WORKSPACE" ? "account-group-outline" : "lock-outline"}
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        )}
      />
    );
  };

  const emptyText = query
    ? "No notes match this search."
    : scope === "inbox"
      ? "Notes you write that are not pinned or linked to a project land here."
      : scope === "pinned"
        ? "Pin a note to keep it at the top."
        : scope === "shared"
          ? "Notes shared with the workspace show here."
          : "Tap New note to write your first one.";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader
        showProfile={false}
        titleComponent={<WorkspaceSelector onWorkspaceChange={() => setPage(null)} />}
        rightComponent={
          <Button
            mode="text"
            icon="calendar-today"
            compact
            loading={openingToday}
            disabled={openingToday}
            onPress={openToday}
          >
            Today
          </Button>
        }
      />

      <View style={styles.controls}>
        <Searchbar
          placeholder="Search notes"
          value={search}
          onChangeText={setSearch}
          style={{ backgroundColor: theme.colors.surfaceVariant, elevation: 0 }}
          inputStyle={{ color: theme.colors.onSurface }}
          iconColor={theme.colors.primary}
        />
        <SegmentedButtons
          value={scope}
          onValueChange={(v) => setScope(v as NoteScope)}
          buttons={TABS}
          density="small"
          style={{ marginTop: 12 }}
        />
        {offline && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            Offline. Showing the notes saved on this phone.
          </Text>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          rows.length === 0
            ? styles.emptyList
            : [styles.list, { paddingBottom: 96 + insets.bottom }]
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Avatar.Icon
              size={96}
              icon="note-text-outline"
              style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 16 }}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodyLarge"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingHorizontal: 32 }}
            >
              {emptyText}
            </Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      />

      <FAB
        icon="note-plus-outline"
        label="New note"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: 20 + insets.bottom }]}
        color={theme.colors.onPrimary}
        onPress={() => router.push("/note/new" as Href)}
      />

      <Snackbar
        visible={!!undoId}
        onDismiss={() => setUndoId(null)}
        duration={6000}
        action={{ label: "Undo", onPress: undoTrash }}
        style={{ marginBottom: 80 + insets.bottom }}
      >
        Note moved to the trash.
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  controls: { paddingHorizontal: 16, marginBottom: 12 },
  list: { paddingHorizontal: 16 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingBottom: 80 },
  row: { borderRadius: 12, marginBottom: 8 },
  rowIcons: { flexDirection: "row", alignItems: "center", gap: 6 },
  fab: { position: "absolute", right: 16, borderRadius: 16 },
});
