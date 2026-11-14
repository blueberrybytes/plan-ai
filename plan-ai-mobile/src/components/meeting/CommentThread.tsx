import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  IconButton,
  Surface,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { HttpError, type Comment } from "../../services/planAiApi";
import { formatClock } from "../MeetingAudioPlayer";
import {
  bodyParts,
  filterCandidates,
  insertMention,
  mentionQueryAt,
  toCandidates,
  toFieldText,
  toStoredBody,
  type MentionCandidate,
  type PickedMention,
} from "../../utils/mentions";

/** Same limit as the server and the web. */
const COMMENT_MAX_LENGTH = 5000;

type Target = { transcriptId: string } | { taskId: string };

const isOffline = (err: unknown) => err instanceof HttpError && err.status === undefined;

const failureText = (err: unknown, fallback: string): string => {
  if (isOffline(err)) return "No connection. Try again when you are back online.";
  const status = err instanceof HttpError ? err.status : undefined;
  if (status && status >= 400 && status < 500 && err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
};

/**
 * The comments of one meeting or one task, and the box to write a new one.
 * Typing @ lists workspace members; the people picked get an email.
 */
export function CommentThread({
  target,
  getCurrentTime,
  onSeek,
}: {
  target: Target;
  /** For a meeting: the player position in seconds, or null with no audio. */
  getCurrentTime?: () => number | null;
  /** For a meeting: plays from that second. */
  onSeek?: (seconds: number) => void;
}) {
  const theme = useTheme();
  const { api } = useAuth();
  const transcriptId = "transcriptId" in target ? target.transcriptId : undefined;
  const taskId = "taskId" in target ? target.taskId : undefined;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setComments(await api.listComments({ transcriptId, taskId }));
    } catch (err) {
      setLoadError(failureText(err, "The comments could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [api, transcriptId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Members for @ mentions. Without them comments still work, with no list.
  useEffect(() => {
    let cancelled = false;
    api
      .getWorkspaceMembers()
      .then((team) => {
        if (!cancelled) setCandidates(toCandidates(team.members ?? []));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const replace = (updated: Comment) =>
    setComments((list) => list.map((c) => (c.id === updated.id ? updated : c)));

  const visible = comments.filter((c) => !c.deleted).length;

  return (
    <View style={{ gap: 12, paddingBottom: 40 }}>
      <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {visible > 0 ? `Comments (${visible})` : "Comments"}
      </Text>

      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading comments…</Text>
        </View>
      ) : loadError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.error }}>{loadError}</Text>
          <Button mode="outlined" compact onPress={() => void load()} style={{ alignSelf: "flex-start" }}>
            Try again
          </Button>
        </View>
      ) : comments.length === 0 ? (
        <Text style={{ color: theme.colors.onSurfaceVariant }}>No comments yet.</Text>
      ) : (
        comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            candidates={candidates}
            onSeek={onSeek}
            onChanged={replace}
          />
        ))
      )}

      {!loading && !loadError && (
        <Composer
          candidates={candidates}
          getCurrentTime={getCurrentTime}
          onSend={async (body, atSeconds) => {
            const created = await api.createComment({
              transcriptId,
              taskId,
              body,
              ...(atSeconds !== null ? { atSeconds } : {}),
            });
            setComments((list) => [...list, created]);
          }}
        />
      )}
    </View>
  );
}

/** A text field with @ mentions. Keeps the people picked so the body can be stored. */
function MentionField({
  value,
  onChange,
  picked,
  onPick,
  candidates,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  picked: PickedMention[];
  onPick: (mention: PickedMention) => void;
  candidates: MentionCandidate[];
  placeholder: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [caret, setCaret] = useState(value.length);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();

  const query = mentionQueryAt(value, caret);
  const matches = useMemo(
    () => (query ? filterCandidates(candidates, query.query) : []),
    [candidates, query],
  );

  const pick = (candidate: MentionCandidate) => {
    if (!query) return;
    const next = insertMention(value, query.start, caret, candidate.name);
    onChange(next.text);
    if (!picked.some((p) => p.userId === candidate.userId)) {
      onPick({ userId: candidate.userId, name: candidate.name });
    }
    setCaret(next.caret);
    setSelection({ start: next.caret, end: next.caret });
  };

  return (
    <View>
      <TextInput
        mode="outlined"
        multiline
        value={value}
        onChangeText={(text) => {
          onChange(text);
          setSelection(undefined);
        }}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
          setCaret(e.nativeEvent.selection.start)
        }
        selection={selection}
        placeholder={placeholder}
        maxLength={COMMENT_MAX_LENGTH}
        disabled={disabled}
        style={{ maxHeight: 160 }}
      />
      {matches.length > 0 && (
        <Surface style={[styles.mentionList, { backgroundColor: theme.colors.surface }]} elevation={2}>
          {matches.map((m) => (
            <TouchableRipple key={m.userId} onPress={() => pick(m)} style={styles.mentionItem}>
              <View>
                <Text style={{ color: theme.colors.onSurface }}>{m.name}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {m.email}
                </Text>
              </View>
            </TouchableRipple>
          ))}
        </Surface>
      )}
    </View>
  );
}

function Composer({
  candidates,
  getCurrentTime,
  onSend,
}: {
  candidates: MentionCandidate[];
  getCurrentTime?: () => number | null;
  onSend: (body: string, atSeconds: number | null) => Promise<void>;
}) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [atSeconds, setAtSeconds] = useState<number | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markMoment = () => {
    const now = getCurrentTime?.() ?? null;
    setNoAudio(now === null);
    if (now !== null) setAtSeconds(Math.max(0, Math.floor(now)));
  };

  const send = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body, atSeconds);
      setText("");
      setPicked([]);
      setAtSeconds(null);
      setNoAudio(false);
    } catch (err) {
      setError(failureText(err, "The comment was not sent. Try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <MentionField
        value={text}
        onChange={setText}
        picked={picked}
        onPick={(m) => setPicked((list) => [...list, m])}
        candidates={candidates}
        placeholder="Write a comment. Type @ to mention someone."
        disabled={sending}
      />
      {error && <HelperText type="error">{error}</HelperText>}
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {getCurrentTime &&
          (atSeconds === null ? (
            <Button compact icon="clock-outline" onPress={markMoment}>
              At this moment
            </Button>
          ) : (
            <>
              <Text style={{ color: theme.colors.onSurface }}>At {formatClock(atSeconds)}</Text>
              <Button compact onPress={() => setAtSeconds(null)}>
                Remove time
              </Button>
            </>
          ))}
        {noAudio && atSeconds === null && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Play the audio first to mark a moment.
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <Button
          mode="contained"
          compact
          onPress={() => void send()}
          loading={sending}
          disabled={sending || text.trim().length === 0}
        >
          Send
        </Button>
      </View>
    </View>
  );
}

function CommentItem({
  comment,
  candidates,
  onSeek,
  onChanged,
}: {
  comment: Comment;
  candidates: MentionCandidate[];
  onSeek?: (seconds: number) => void;
  onChanged: (comment: Comment) => void;
}) {
  const theme = useTheme();
  const { api } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (comment.deleted) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: "italic" }}>
        Comment deleted.
      </Text>
    );
  }

  const author = comment.author?.name || comment.author?.email || "Someone";
  const when = new Date(comment.createdAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const startEdit = () => {
    const field = toFieldText(comment.body, comment.mentions ?? []);
    setText(field.text);
    setPicked(field.picked);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.updateComment(comment.id, body));
      setEditing(false);
    } catch (err) {
      setError(failureText(err, "The change was not saved."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteComment(comment.id);
      onChanged({ ...comment, deleted: true });
    } catch (err) {
      setError(failureText(err, "The comment was not deleted."));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface style={[styles.item, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
      <View style={styles.row}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurface, flexShrink: 1 }}>
          {author}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {when}
          {comment.edited ? " (edited)" : ""}
        </Text>
        <View style={{ flex: 1 }} />
        {!editing && comment.canEdit && (
          <IconButton icon="pencil-outline" size={18} onPress={startEdit} disabled={busy} style={styles.icon} />
        )}
        {!editing && comment.canDelete && (
          <IconButton
            icon="delete-outline"
            size={18}
            onPress={() => setConfirmDelete(true)}
            disabled={busy}
            style={styles.icon}
          />
        )}
      </View>

      {typeof comment.atSeconds === "number" && (
        <Text
          variant="labelMedium"
          onPress={onSeek ? () => onSeek(comment.atSeconds as number) : undefined}
          style={{
            color: theme.colors.primary,
            textDecorationLine: onSeek ? "underline" : "none",
            marginTop: 2,
          }}
        >
          At {formatClock(comment.atSeconds)}
        </Text>
      )}

      {editing ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <MentionField
            value={text}
            onChange={setText}
            picked={picked}
            onPick={(m) => setPicked((list) => [...list, m])}
            candidates={candidates}
            placeholder="Comment"
            disabled={busy}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }} />
            <Button compact onPress={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              mode="contained"
              compact
              onPress={() => void save()}
              loading={busy}
              disabled={busy || text.trim().length === 0}
            >
              Save
            </Button>
          </View>
        </View>
      ) : (
        <Text style={{ color: theme.colors.onSurface, marginTop: 4, lineHeight: 21 }}>
          {bodyParts(comment.body, comment.mentions ?? []).map((part, i) =>
            part.type === "mention" ? (
              <Text key={i} style={{ color: theme.colors.primary, fontWeight: "600" }}>
                @{part.name}
              </Text>
            ) : (
              <Text key={i}>{part.text}</Text>
            ),
          )}
        </Text>
      )}

      {confirmDelete && (
        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={{ color: theme.colors.onSurface, flex: 1 }}>Delete this comment?</Text>
          <Button compact onPress={() => setConfirmDelete(false)} disabled={busy}>
            Cancel
          </Button>
          <Button compact textColor={theme.colors.error} onPress={() => void remove()} loading={busy} disabled={busy}>
            Delete
          </Button>
        </View>
      )}
      {error && <HelperText type="error">{error}</HelperText>}
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  item: {
    padding: 12,
    borderRadius: 8,
  },
  icon: {
    margin: 0,
  },
  mentionList: {
    marginTop: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  mentionItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
