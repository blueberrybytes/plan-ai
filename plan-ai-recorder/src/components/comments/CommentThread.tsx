// Port of plan-ai/frontend/src/components/comments/CommentThread.tsx, for a meeting.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { AccessTime as AccessTimeIcon } from "@mui/icons-material";
import { useAuth } from "../../hooks/useAuth";
import type { Comment } from "../../services/planAiApi";
import { formatClock } from "../RecordingAudioPlayer";
import CommentItem, { COMMENT_MAX_LENGTH } from "./CommentItem";
import MentionInput from "./MentionInput";
import {
  toCandidates,
  toStoredBody,
  type MentionCandidate,
  type PickedMention,
} from "../../utils/mentions";

/**
 * The comments of one meeting and the box to write a new one. Typing @ lists
 * workspace members; the people picked get an email.
 */
const CommentThread: React.FC<{
  transcriptId: string;
  /** Where the player is now, in seconds, or null when there is no audio. */
  getCurrentTime: () => number | null;
  /** Plays from that second. */
  onSeek: (seconds: number) => void;
}> = ({ transcriptId, getCurrentTime, onSeek }) => {
  const { api } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [members, setMembers] = useState<MentionCandidate[]>([]);

  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [atSeconds, setAtSeconds] = useState<number | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setComments(await api.listComments(transcriptId));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api, transcriptId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Members for @ mentions. Without them comments still work, with no list.
  useEffect(() => {
    let cancelled = false;
    api
      .getWorkspaceMembers()
      .then((team) => {
        if (!cancelled) setMembers(toCandidates(team.members ?? []));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const candidates = useMemo(() => members, [members]);
  const visibleCount = comments.filter((c) => !c.deleted).length;

  const markMoment = () => {
    const now = getCurrentTime();
    setNoAudio(now === null);
    if (now !== null) setAtSeconds(Math.max(0, Math.floor(now)));
  };

  const send = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body || sending) return;
    setSending(true);
    try {
      const created = await api.createComment({
        transcriptId,
        body,
        ...(atSeconds !== null ? { atSeconds } : {}),
      });
      setComments((list) => [...list, created]);
      setText("");
      setPicked([]);
      setAtSeconds(null);
      setNoAudio(false);
      setSendFailed(false);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  };

  const replace = (updated: Comment) =>
    setComments((list) => list.map((c) => (c.id === updated.id ? updated : c)));

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" color="text.secondary">
        {visibleCount > 0 ? `Comments (${visibleCount})` : "Comments"}
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading comments
          </Typography>
        </Stack>
      ) : loadFailed ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          The comments could not be loaded.
        </Alert>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No comments yet.
        </Typography>
      ) : (
        <Stack spacing={2}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              candidates={candidates}
              onSeek={onSeek}
              onChanged={replace}
            />
          ))}
        </Stack>
      )}

      {!loadFailed && !loading && (
        <Stack spacing={1}>
          <MentionInput
            value={text}
            onChange={setText}
            onPick={(mention) => setPicked((list) => [...list, mention])}
            candidates={candidates}
            onSubmit={() => void send()}
            label="Comment"
            placeholder="Write a comment. Use @ to mention someone."
            disabled={sending}
            maxLength={COMMENT_MAX_LENGTH}
          />
          {sendFailed && (
            <Alert severity="error" onClose={() => setSendFailed(false)}>
              The comment could not be posted. Try again.
            </Alert>
          )}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {atSeconds === null ? (
              <Button size="small" startIcon={<AccessTimeIcon />} onClick={markMoment}>
                Comment at this moment
              </Button>
            ) : (
              <>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  At {formatClock(atSeconds)}
                </Typography>
                <Button size="small" onClick={() => setAtSeconds(null)}>
                  Remove the moment
                </Button>
              </>
            )}
            {noAudio && atSeconds === null && (
              <Typography variant="caption" color="text.secondary">
                This meeting has no audio, so there is no moment to mark.
              </Typography>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              size="small"
              onClick={() => void send()}
              disabled={sending || text.trim().length === 0}
            >
              Comment
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default CommentThread;
