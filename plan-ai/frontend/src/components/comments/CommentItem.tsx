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
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import {
  useDeleteCommentMutation,
  useUpdateCommentMutation,
  type Comment,
  type CommentThreadTarget,
} from "../../store/apis/commentApi";
import { formatClock } from "../transcript/RecordingAudioPlayer";
import MentionInput from "./MentionInput";
import {
  bodyParts,
  toFieldText,
  toStoredBody,
  type MentionCandidate,
  type PickedMention,
} from "./mentions";

export const COMMENT_MAX_LENGTH = 5000;

interface CommentItemProps {
  comment: Comment;
  target: CommentThreadTarget;
  candidates: MentionCandidate[];
  /** Plays the meeting from that second. Without it the moment is shown as text. */
  onSeek?: (seconds: number) => void;
}

const relativeTime = (iso: string, language: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: language.startsWith("es") ? es : enUS,
  });
};

/**
 * The text of a comment. It is what a person typed, so it is rendered as
 * plain text nodes: no markdown and no HTML. A mention is the member's name
 * in a stronger weight and links to nothing.
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

const CommentItem: React.FC<CommentItemProps> = ({ comment, target, candidates, onSeek }) => {
  const { t, i18n } = useTranslation();
  const [updateComment, { isLoading: saving }] = useUpdateCommentMutation();
  const [deleteComment, { isLoading: deleting }] = useDeleteCommentMutation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorName = comment.author.name?.trim() || comment.author.email;
  const created = new Date(comment.createdAt);

  const startEditing = () => {
    const field = toFieldText(comment.body, comment.mentions);
    setText(field.text);
    setPicked(field.picked);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body || saving) return;
    try {
      await updateComment({ target, id: comment.id, body }).unwrap();
      setEditing(false);
      setError(null);
    } catch {
      setError(t("comments.saveFailed"));
    }
  };

  const remove = async () => {
    try {
      await deleteComment({ target, id: comment.id }).unwrap();
      setConfirmOpen(false);
      setError(null);
    } catch {
      setConfirmOpen(false);
      setError(t("comments.deleteFailed"));
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
          <Tooltip title={Number.isNaN(created.getTime()) ? "" : created.toLocaleString()}>
            <Typography variant="caption" color="text.secondary">
              {relativeTime(comment.createdAt, i18n.language)}
            </Typography>
          </Tooltip>
          {comment.edited && (
            <Typography variant="caption" color="text.secondary">
              {t("comments.edited")}
            </Typography>
          )}
          {comment.atSeconds !== null &&
            (onSeek ? (
              <Box
                component="button"
                type="button"
                onClick={() => onSeek(comment.atSeconds ?? 0)}
                title={t("comments.jumpTo", { time: formatClock(comment.atSeconds) })}
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
            {t("comments.deleted")}
          </Typography>
        ) : editing ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <MentionInput
              value={text}
              onChange={setText}
              onPick={(mention) => setPicked((list) => [...list, mention])}
              candidates={candidates}
              onSubmit={() => void save()}
              label={t("comments.label")}
              disabled={saving}
              autoFocus
              maxLength={COMMENT_MAX_LENGTH}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => setEditing(false)} disabled={saving}>
                {t("comments.cancel")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={() => void save()}
                disabled={saving || text.trim().length === 0}
              >
                {t("comments.save")}
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

      {!editing && (comment.canEdit || comment.canDelete) && (
        <Stack direction="row" spacing={0}>
          {comment.canEdit && (
            <Tooltip title={t("comments.edit")}>
              <IconButton size="small" onClick={startEditing} aria-label={t("comments.edit")}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {comment.canDelete && (
            <Tooltip title={t("comments.delete")}>
              <IconButton
                size="small"
                onClick={() => setConfirmOpen(true)}
                aria-label={t("comments.delete")}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}

      <Dialog open={confirmOpen} onClose={() => !deleting && setConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>{t("comments.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("comments.deleteConfirmBody")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
            {t("comments.cancel")}
          </Button>
          <Button color="error" onClick={() => void remove()} disabled={deleting}>
            {t("comments.confirmDelete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default CommentItem;
