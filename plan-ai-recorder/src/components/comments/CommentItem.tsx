// Port of plan-ai/frontend/src/components/comments/CommentItem.tsx.
import React, { useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  EditOutlined as EditOutlinedIcon,
  DeleteOutline as DeleteOutlineIcon,
} from "@mui/icons-material";
import { useAuth } from "../../hooks/useAuth";
import type { Comment } from "../../services/planAiApi";
import { formatClock } from "../RecordingAudioPlayer";
import MentionInput from "./MentionInput";
import {
  bodyParts,
  toFieldText,
  toStoredBody,
  type MentionCandidate,
  type PickedMention,
} from "../../utils/mentions";

/** Same limit as the server and the web. */
export const COMMENT_MAX_LENGTH = 5000;

/**
 * The text of a comment. It is what a person typed, so it is rendered as
 * plain text: no markdown and no HTML. A mention is the member's name in a
 * stronger weight and links to nothing.
 */
const CommentBody: React.FC<{ comment: Comment }> = ({ comment }) => (
  <Typography
    variant="body2"
    sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}
  >
    {bodyParts(comment.body, comment.mentions).map((part, i) =>
      part.type === "mention" ? (
        <Box component="span" key={i} sx={{ fontWeight: 600 }}>
          @{part.name}
        </Box>
      ) : (
        <React.Fragment key={i}>{part.text}</React.Fragment>
      ),
    )}
  </Typography>
);

const whenOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const CommentItem: React.FC<{
  comment: Comment;
  candidates: MentionCandidate[];
  /** Plays the meeting from that second. Without it the moment is plain text. */
  onSeek?: (seconds: number) => void;
  onChanged: (comment: Comment) => void;
}> = ({ comment, candidates, onSeek, onChanged }) => {
  const { api } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorName = comment.author.name?.trim() || comment.author.email;

  const startEditing = () => {
    const field = toFieldText(comment.body, comment.mentions);
    setText(field.text);
    setPicked(field.picked);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body || busy) return;
    setBusy(true);
    try {
      onChanged(await api.updateComment(comment.id, body));
      setEditing(false);
      setError(null);
    } catch {
      setError("The change could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteComment(comment.id);
      onChanged({ ...comment, deleted: true });
      setError(null);
    } catch {
      setError("The comment could not be deleted. Try again.");
    } finally {
      setConfirmOpen(false);
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Avatar
        src={comment.author.avatarUrl || undefined}
        alt=""
        sx={{ width: 32, height: 32, fontSize: 14 }}
      >
        {authorName.charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {authorName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {whenOf(comment.createdAt)}
          </Typography>
          {comment.edited && (
            <Typography variant="caption" color="text.secondary">
              edited
            </Typography>
          )}
          {comment.atSeconds !== null &&
            (onSeek ? (
              <Box
                component="button"
                type="button"
                onClick={() => onSeek(comment.atSeconds ?? 0)}
                title={`Play from ${formatClock(comment.atSeconds)}`}
                sx={{
                  all: "unset",
                  cursor: "pointer",
                  typography: "caption",
                  fontWeight: 600,
                  color: "primary.main",
                  fontVariantNumeric: "tabular-nums",
                  "&:hover": { textDecoration: "underline" },
                  "&:focus-visible": { outline: "2px solid", outlineOffset: 2 },
                }}
              >
                {formatClock(comment.atSeconds)}
              </Box>
            ) : (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatClock(comment.atSeconds)}
              </Typography>
            ))}
        </Stack>

        {comment.deleted ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
            Comment deleted
          </Typography>
        ) : editing ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <MentionInput
              value={text}
              onChange={setText}
              onPick={(mention) => setPicked((list) => [...list, mention])}
              candidates={candidates}
              onSubmit={() => void save()}
              label="Comment"
              disabled={busy}
              autoFocus
              maxLength={COMMENT_MAX_LENGTH}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={() => void save()}
                disabled={busy || text.trim().length === 0}
              >
                Save
              </Button>
            </Stack>
          </Stack>
        ) : (
          <CommentBody comment={comment} />
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Box>

      {!editing && !comment.deleted && (comment.canEdit || comment.canDelete) && (
        <Stack direction="row" spacing={0}>
          {comment.canEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={startEditing} aria-label="Edit">
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {comment.canDelete && (
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => setConfirmOpen(true)} aria-label="Delete">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>Delete this comment?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The comment is no longer shown in the thread. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button color="error" onClick={() => void remove()} disabled={busy}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default CommentItem;
