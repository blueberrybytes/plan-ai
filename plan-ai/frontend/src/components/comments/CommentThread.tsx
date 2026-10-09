import React, { useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useTranslation } from "react-i18next";
import {
  useCreateCommentMutation,
  useListCommentsQuery,
  type CommentThreadTarget,
} from "../../store/apis/commentApi";
import { useGetWorkspaceMembersQuery } from "../../store/apis/workspaceApi";
import { formatClock } from "../transcript/RecordingAudioPlayer";
import CommentItem, { COMMENT_MAX_LENGTH } from "./CommentItem";
import MentionInput from "./MentionInput";
import { toCandidates, toStoredBody, type PickedMention } from "./mentions";

interface CommentThreadProps {
  target: CommentThreadTarget;
  /**
   * For a meeting: where the player is now, in seconds, or null when there is
   * no audio. With it the composer offers "comment at this moment".
   */
  getCurrentTime?: () => number | null;
  /** For a meeting: plays from that second. */
  onSeek?: (seconds: number) => void;
}

/** The comments of one task or one meeting, and the box to write a new one. */
const CommentThread: React.FC<CommentThreadProps> = ({ target, getCurrentTime, onSeek }) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useListCommentsQuery(target);
  const { data: team } = useGetWorkspaceMembersQuery();
  const [createComment, { isLoading: sending }] = useCreateCommentMutation();

  const candidates = useMemo(() => toCandidates(team?.members ?? []), [team]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [atSeconds, setAtSeconds] = useState<number | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const comments = data?.comments ?? [];
  const visibleCount = comments.filter((c) => !c.deleted).length;

  const markMoment = () => {
    const now = getCurrentTime?.() ?? null;
    setNoAudio(now === null);
    if (now !== null) setAtSeconds(Math.max(0, Math.floor(now)));
  };

  const send = async () => {
    const body = toStoredBody(text.trim(), picked);
    if (!body || sending) return;
    try {
      await createComment({ target, body, atSeconds }).unwrap();
      setText("");
      setPicked([]);
      setAtSeconds(null);
      setNoAudio(false);
      setSendFailed(false);
    } catch {
      setSendFailed(true);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" color="text.secondary">
        {visibleCount > 0
          ? t("comments.titleWithCount", { count: visibleCount })
          : t("comments.title")}
      </Typography>

      {isLoading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t("comments.loading")}
          </Typography>
        </Stack>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              {t("comments.retry")}
            </Button>
          }
        >
          {t("comments.loadFailed")}
        </Alert>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("comments.empty")}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              target={target}
              candidates={candidates}
              onSeek={onSeek}
            />
          ))}
        </Stack>
      )}

      {!isError && !isLoading && (
        <Stack spacing={1}>
          <MentionInput
            value={text}
            onChange={setText}
            onPick={(mention) => setPicked((list) => [...list, mention])}
            candidates={candidates}
            onSubmit={() => void send()}
            label={t("comments.label")}
            placeholder={t("comments.placeholder")}
            disabled={sending}
            maxLength={COMMENT_MAX_LENGTH}
          />
          {sendFailed && (
            <Alert severity="error" onClose={() => setSendFailed(false)}>
              {t("comments.sendFailed")}
            </Alert>
          )}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {getCurrentTime &&
              (atSeconds === null ? (
                <Button size="small" startIcon={<AccessTimeIcon />} onClick={markMoment}>
                  {t("comments.atThisMoment")}
                </Button>
              ) : (
                <>
                  <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {t("comments.momentSet", { time: formatClock(atSeconds) })}
                  </Typography>
                  <Button size="small" onClick={() => setAtSeconds(null)}>
                    {t("comments.removeMoment")}
                  </Button>
                </>
              ))}
            {noAudio && atSeconds === null && (
              <Typography variant="caption" color="text.secondary">
                {t("comments.noAudio")}
              </Typography>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              size="small"
              onClick={() => void send()}
              disabled={sending || text.trim().length === 0}
            >
              {t("comments.send")}
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default CommentThread;
