import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Banner,
  Button,
  Chip,
  Dialog,
  IconButton,
  List,
  Menu,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuth } from "../context/AuthContext";
import type { Project, Workspace } from "../services/planAiApi";
import {
  cacheServerNote,
  createDraftNote,
  discardIfEmptyDraft,
  getLocalNote,
  hasRecentCopyOf,
  isMineNote,
  noteDisplayTitle,
  replacementOf,
  resetNoteError,
  saveConflictedCopy,
  saveLocalEdit,
  trashLocalNote,
  useLocalNote,
  useNoteSaveFailed,
  type NoteEdit,
} from "../services/notesStore";
import { requestNotesSync, syncNotes } from "../services/notesSync";
import { queueNoteExtraction } from "../services/trackersStore";
import { onMarkdownLinkPress } from "../utils/openWebUrl";
import { reportMessage, reportUnexpected } from "../utils/reportError";

// The note is written to the phone at most this long after a key press.
const SAVE_DELAY_MS = 500;

interface NoteEditorProps {
  id: string;
  /** A new note: made on the phone at once and opened with the keyboard up. */
  isNew?: boolean;
}

export function NoteEditor({ id, isNew = false }: NoteEditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api, user, workspaces, activeWorkspaceId } = useAuth();
  const uid = user?.uid ?? null;

  // A new note exists on the phone before the first frame, so the editor
  // never waits for the network. createDraftNote returns the same note if
  // it already exists.
  const [initial] = useState(() =>
    isNew && uid
      ? createDraftNote({ id, accountUid: uid, workspaceId: activeWorkspaceId || null })
      : getLocalNote(id),
  );
  const stored = useLocalNote(id);
  // Another account's copy on this phone is never shown here.
  const note = stored && stored.accountUid === uid ? stored : null;
  const saveFailed = useNoteSaveFailed(id);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [loading, setLoading] = useState(!initial);
  const [notFound, setNotFound] = useState(false);
  const [preview, setPreview] = useState(initial ? !isMineNote(initial) : false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRemoteRev = useRef(initial?.remoteRev ?? 0);
  // The user typed during this visit. On leaving, a note in the personal
  // workspace is read by the AI for trackers (after its upload).
  const changedRef = useRef(false);
  const workspaceKind = (workspaces as Workspace[]).find(
    (w) => w.id === (note?.workspaceId ?? activeWorkspaceId),
  )?.kind;

  const mine = note ? isMineNote(note) : true;

  /** Writes what is on screen to the phone and queues the upload. */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const saved = saveLocalEdit(id, { title: titleRef.current, body: bodyRef.current });
    // The note left the phone while it was open (e.g. it became a copy).
    // The last few keystrokes had nowhere to go. Ids only.
    if (!saved) reportMessage("Note edit had no local note", "notes", { noteId: id });
    requestNotesSync(api);
  }, [id, api]);

  const scheduleSave = () => {
    dirtyRef.current = true;
    // Not reset on every key: a long burst of typing is still saved every
    // half second, so a kill loses at most that.
    if (!timerRef.current) timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const onTitle = (t: string) => {
    changedRef.current = true;
    titleRef.current = t;
    setTitle(t);
    scheduleSave();
  };
  const onBody = (t: string) => {
    changedRef.current = true;
    bodyRef.current = t;
    setBody(t);
    scheduleSave();
  };

  // Load a note this phone does not have yet, or refresh a synced one.
  useEffect(() => {
    if (!uid) return;
    const local = getLocalNote(id);
    if (local && (local.status !== "synced" || local.pendingTrash)) return;
    if (local?.baseVersion === null) return;
    let cancelled = false;
    api
      .getNote(id, local?.workspaceId ?? activeWorkspaceId)
      .then((server) => {
        if (cancelled) return;
        const saved = cacheServerNote(uid, server);
        if (!local) {
          seenRemoteRev.current = saved.remoteRev;
          titleRef.current = saved.title;
          bodyRef.current = saved.body;
          setTitle(saved.title);
          setBody(saved.body);
          setPreview(!isMineNote(saved));
        }
      })
      .catch((err) => {
        // Offline and 4xx are expected. A bug or a bad answer is not.
        reportUnexpected(err, "notes", { op: "open", noteId: id });
        if (cancelled || local) return;
        setNotFound(true);
        console.warn("[notes] could not load the note", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only when the note opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, uid]);

  // The sync replaced the text (another device saved first), or the note
  // became a copy. Follow it without losing what was typed here.
  useEffect(() => {
    const current = note;
    if (!current) {
      const replacement = replacementOf(id);
      if (replacement) router.replace(`/note/${replacement}` as Href);
      return;
    }
    if (current.remoteRev === seenRemoteRev.current) return;
    seenRemoteRev.current = current.remoteRev;
    let copied = hasRecentCopyOf(id);
    if (dirtyRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      dirtyRef.current = false;
      saveConflictedCopy(current, { title: titleRef.current, body: bodyRef.current });
      copied = true;
    }
    titleRef.current = current.title;
    bodyRef.current = current.body;
    setTitle(current.title);
    setBody(current.body);
    setNotice(
      copied
        ? "This note changed on another device. Your version is kept as a conflicted copy in the list."
        : "This note was updated on another device.",
    );
  }, [note, id, router]);

  // Save when the app goes to the background, and when the screen closes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") flush();
    });
    return () => {
      sub.remove();
      flush();
      discardIfEmptyDraft(id);
    };
  }, [flush, id]);

  useFocusEffect(
    useCallback(() => {
      return () => flush();
    }, [flush]),
  );

  // Leaving a changed note: queue it for the trackers AI. It is sent once
  // the notes sync has uploaded this version, never per keystroke.
  const leaveRef = useRef({ flush, workspaceKind });
  useEffect(() => {
    leaveRef.current = { flush, workspaceKind };
  });
  useEffect(() => {
    return () => {
      if (!changedRef.current) return;
      leaveRef.current.flush();
      queueNoteExtraction(api, id, leaveRef.current.workspaceKind);
    };
  }, [api, id]);

  // Project names, for the chip and the picker.
  const loadProjects = useCallback(() => {
    setProjectsError(false);
    api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjectsError(true));
  }, [api]);

  useEffect(() => {
    if (note?.projectId && projects === null) loadProjects();
  }, [note?.projectId, projects, loadProjects]);

  const close = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace("/(drawer)/notes" as Href);
  };

  /** Pin, share or project: saved at once and sent now. */
  const applyEdit = (edit: NoteEdit) => {
    flush();
    saveLocalEdit(id, edit);
    requestNotesSync(api, 0);
  };

  const workspaceName =
    workspaces.find((w) => w.id === (note?.workspaceId ?? activeWorkspaceId))?.name ??
    "this workspace";

  const toggleShare = () => {
    setMenuOpen(false);
    if (!note) return;
    if (note.visibility === "WORKSPACE") {
      Alert.alert(
        "Make this note private?",
        `Members of ${workspaceName} will no longer see it.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Make private", onPress: () => applyEdit({ visibility: "PRIVATE" }) },
        ],
      );
    } else {
      Alert.alert(
        "Share with the workspace?",
        `Every member of ${workspaceName} will be able to read this note. Only you can edit it.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Share", onPress: () => applyEdit({ visibility: "WORKSPACE" }) },
        ],
      );
    }
  };

  const confirmTrash = () => {
    setMenuOpen(false);
    Alert.alert("Move to trash?", "The trash keeps it for 30 days.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to trash",
        style: "destructive",
        onPress: () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          dirtyRef.current = false;
          trashLocalNote(id);
          requestNotesSync(api, 0);
          if (router.canGoBack()) router.back();
          else router.replace("/(drawer)/notes" as Href);
        },
      },
    ]);
  };

  const retry = () => {
    resetNoteError(id);
    void syncNotes(api, { force: true });
  };

  if (loading || notFound || !note) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          <>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
              Note not found
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginBottom: 16 }}
            >
              It may have been deleted, or it belongs to another workspace.
            </Text>
            <Button mode="outlined" onPress={close}>
              Go back
            </Button>
          </>
        )}
      </View>
    );
  }

  const syncIcon = note.permanentError
    ? "cloud-alert"
    : note.status === "synced"
      ? "cloud-check-outline"
      : note.status === "draft"
        ? null
        : "cloud-upload-outline";
  const projectName = note.projectId
    ? (projects?.find((p) => p.id === note.projectId)?.title ?? "Project")
    : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      // Padding on Android too: with edge-to-edge the window may not resize for
      // the keyboard. When it does, the overlap is 0 and this adds nothing.
      behavior="padding"
    >
      <View style={styles.header}>
        <IconButton icon="arrow-left" accessibilityLabel="Back" onPress={close} />
        <View style={{ flex: 1 }} />
        {syncIcon && (
          <IconButton
            icon={syncIcon}
            size={20}
            iconColor={note.permanentError ? theme.colors.error : theme.colors.onSurfaceVariant}
            accessibilityLabel={note.status === "synced" ? "Saved to the server" : "Not synced yet"}
            onPress={() =>
              setNotice(
                note.permanentError
                  ? `The server did not save this note: ${note.lastError ?? "unknown error"}`
                  : note.status === "synced"
                    ? "Saved to the server."
                    : "Saved on this phone. It uploads when there is a connection.",
              )
            }
          />
        )}
        {note.pinned && (
          <IconButton icon="pin" size={20} iconColor={theme.colors.primary} accessibilityLabel="Pinned" />
        )}
        {mine && (
          <IconButton
            icon={preview ? "pencil-outline" : "eye-outline"}
            accessibilityLabel={preview ? "Edit" : "Preview"}
            onPress={() => {
              flush();
              setPreview((p) => !p);
            }}
          />
        )}
        {mine && (
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                accessibilityLabel="More actions"
                onPress={() => setMenuOpen(true)}
              />
            }
          >
            <Menu.Item
              leadingIcon={note.pinned ? "pin-off-outline" : "pin-outline"}
              title={note.pinned ? "Unpin" : "Pin"}
              onPress={() => {
                setMenuOpen(false);
                applyEdit({ pinned: !note.pinned });
              }}
            />
            <Menu.Item
              leadingIcon={note.visibility === "WORKSPACE" ? "lock-outline" : "account-group-outline"}
              title={note.visibility === "WORKSPACE" ? "Make private" : "Share with workspace"}
              onPress={toggleShare}
            />
            <Menu.Item
              leadingIcon="briefcase-outline"
              title="Link to a project"
              onPress={() => {
                setMenuOpen(false);
                if (projects === null) loadProjects();
                setPickerOpen(true);
              }}
            />
            <Menu.Item leadingIcon="delete-outline" title="Move to trash" onPress={confirmTrash} />
          </Menu>
        )}
      </View>

      {saveFailed && (
        <Banner visible icon="content-save-alert-outline">
          This phone could not save the note. Keep the app open until it uploads, or copy your text.
        </Banner>
      )}
      {note.status === "conflict" && (
        <Banner visible icon="alert-circle-outline">
          Conflicted copy. The original changed on another device, so this text was kept apart.
        </Banner>
      )}
      {note.permanentError && (
        <Banner visible icon="cloud-alert" actions={[{ label: "Retry", onPress: retry }]}>
          {`Saved on this phone only. The server said: ${note.lastError ?? "unknown error"}`}
        </Banner>
      )}
      {!mine && (
        <Banner visible icon="account-group-outline">
          Shared by a workspace member. Only the author can edit it.
        </Banner>
      )}

      <View style={styles.chips}>
        <Chip
          compact
          icon={note.visibility === "WORKSPACE" ? "account-group-outline" : "lock-outline"}
          onPress={mine ? toggleShare : undefined}
        >
          {note.visibility === "WORKSPACE" ? "Shared" : "Private"}
        </Chip>
        {projectName && (
          <Chip
            compact
            icon="briefcase-outline"
            onPress={
              mine
                ? () => {
                    if (projects === null) loadProjects();
                    setPickerOpen(true);
                  }
                : undefined
            }
          >
            {projectName}
          </Chip>
        )}
      </View>

      {preview ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + 24 }]}
        >
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: "bold", marginBottom: 12 }}>
            {title.trim() || noteDisplayTitle(note)}
          </Text>
          <Markdown
            onLinkPress={onMarkdownLinkPress}
            style={{
              body: { color: theme.colors.onSurface, fontSize: 16, lineHeight: 24 },
              heading1: { color: theme.colors.primary, fontSize: 24, marginTop: 16, marginBottom: 8, fontWeight: "bold" },
              heading2: { color: theme.colors.primary, fontSize: 20, marginTop: 16, marginBottom: 8, fontWeight: "bold" },
              heading3: { color: theme.colors.primary, fontSize: 18, marginTop: 12, marginBottom: 6, fontWeight: "bold" },
              link: { color: theme.colors.primary },
              code_inline: {
                backgroundColor: theme.colors.surfaceVariant,
                color: theme.colors.onSurfaceVariant,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              },
              fence: {
                backgroundColor: theme.colors.surfaceVariant,
                color: theme.colors.onSurfaceVariant,
                padding: 12,
                borderRadius: 8,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              },
            }}
          >
            {body.trim() ? body : "*Empty note*"}
          </Markdown>
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.editArea]}>
          <TextInput
            value={title}
            onChangeText={onTitle}
            placeholder="Title"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[styles.titleInput, { color: theme.colors.onSurface }]}
            maxLength={200}
            returnKeyType="next"
            onBlur={flush}
          />
          <TextInput
            value={body}
            onChangeText={onBody}
            placeholder="Start writing"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[styles.bodyInput, { color: theme.colors.onSurface, paddingBottom: insets.bottom + 16 }]}
            multiline
            autoFocus={isNew}
            textAlignVertical="top"
            scrollEnabled
            onBlur={flush}
          />
        </View>
      )}

      <Portal>
        <Dialog visible={pickerOpen} onDismiss={() => setPickerOpen(false)}>
          <Dialog.Title>Link to a project</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 360, paddingHorizontal: 0 }}>
            {projects === null && !projectsError ? (
              <ActivityIndicator style={{ margin: 24 }} />
            ) : projectsError ? (
              <View style={{ padding: 24 }}>
                <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                  Could not load your projects. Check the connection.
                </Text>
                <Button mode="outlined" onPress={loadProjects}>
                  Try again
                </Button>
              </View>
            ) : (
              <ScrollView>
                <List.Item
                  title="No project"
                  left={(p) => <List.Icon {...p} icon={note.projectId ? "circle-outline" : "check-circle"} />}
                  onPress={() => {
                    setPickerOpen(false);
                    if (note.projectId) applyEdit({ projectId: null });
                  }}
                />
                {(projects ?? []).map((p) => (
                  <List.Item
                    key={p.id}
                    title={p.title}
                    left={(props) => (
                      <List.Icon {...props} icon={note.projectId === p.id ? "check-circle" : "circle-outline"} />
                    )}
                    onPress={() => {
                      setPickerOpen(false);
                      if (note.projectId !== p.id) applyEdit({ projectId: p.id });
                    }}
                  />
                ))}
              </ScrollView>
            )}
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setPickerOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={5000}>
        {notice ?? ""}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginBottom: 4 },
  editArea: { paddingHorizontal: 20 },
  titleInput: { fontSize: 22, fontWeight: "bold", paddingVertical: 10 },
  bodyInput: { flex: 1, fontSize: 16, lineHeight: 24, paddingTop: 4 },
  previewContent: { paddingHorizontal: 20, paddingTop: 8 },
});
