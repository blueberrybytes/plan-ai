import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Slider,
  Tooltip,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  useDeleteTranscriptAudioMutation,
  useGetTranscriptAudioQuery,
} from "../../store/apis/transcriptApi";
import { setToastMessage } from "../../store/slices/app/appSlice";

export type AudioChannel = "mic" | "sys";

export interface RecordingAudioPlayerHandle {
  /** Plays from `seconds` of the given file's own timeline. */
  seek: (seconds: number, channel: AudioChannel) => void;
  /** Where the player is now, in seconds. Null when the meeting has no audio loaded. */
  getCurrentTime: () => number | null;
}

/** Which recorded file an utterance comes from (older rows carry no channel). */
export const channelOfUtterance = (u: {
  channel?: string;
  speaker?: string;
  words?: { globalSpeaker?: string }[];
}): AudioChannel => {
  if (u.channel === "mic" || u.channel === "sys") return u.channel;
  const raw = u.words?.[0]?.globalSpeaker ?? u.speaker ?? "";
  return raw.startsWith("Others") ? "sys" : "mic";
};

export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Beyond this the second track is moved back in step while playing.
const DRIFT_TOLERANCE_S = 0.3;

/**
 * Plays a meeting's audio. Desktop recordings have two files (the user's
 * microphone and the meeting's system audio) that play together as one; the
 * backend measures how much later the mic file runs (`micSysOffsetSeconds`)
 * and the system track follows the mic with that offset. The mic is the clock
 * when there is one.
 */
const RecordingAudioPlayer = forwardRef<
  RecordingAudioPlayerHandle,
  { transcriptId: string; durationHint?: number | null; metadata?: unknown }
>(function RecordingAudioPlayer({ transcriptId, durationHint, metadata }, ref) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  // The links are signed for 12 h. Asked again when the page is reopened
  // after an hour, and when a track fails to load (the page stayed open).
  const { data, isError, refetch } = useGetTranscriptAudioQuery(transcriptId, {
    refetchOnMountOrArgChange: 60 * 60,
  });
  const lastRefetch = useRef(0);
  const onTrackError = useCallback(() => {
    if (Date.now() - lastRefetch.current < 60_000) return;
    lastRefetch.current = Date.now();
    void refetch();
  }, [refetch]);
  const [deleteAudio, { isLoading: deleting }] = useDeleteTranscriptAudioMutation();
  const audio = data?.data ?? null;
  const offset = audio?.micSysOffsetSeconds ?? 0;

  const micRef = useRef<HTMLAudioElement>(null);
  const sysRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationHint ?? 0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const master = useCallback(() => micRef.current ?? sysRef.current, []);

  /** Sets both tracks to `masterTime` on the master clock. */
  const setBoth = useCallback(
    (masterTime: number) => {
      const t0 = Math.max(0, masterTime);
      if (micRef.current) {
        micRef.current.currentTime = t0;
        if (sysRef.current) sysRef.current.currentTime = Math.max(0, t0 - offset);
      } else if (sysRef.current) {
        sysRef.current.currentTime = t0;
      }
      setTime(t0);
    },
    [offset],
  );

  /**
   * Puts the system track where the mic says it should be. Before the system
   * recording started (or after it ended) it stays silent instead of playing
   * its first seconds too early.
   */
  const alignSys = useCallback(
    (shouldPlay: boolean) => {
      const mic = micRef.current;
      const sys = sysRef.current;
      if (!mic || !sys) return;
      const expected = mic.currentTime - offset;
      const ended = Number.isFinite(sys.duration) && sys.duration > 0 && expected >= sys.duration;
      if (expected < 0 || ended) {
        if (!sys.paused) sys.pause();
        if (expected < 0 && sys.currentTime !== 0) sys.currentTime = 0;
        return;
      }
      if (Math.abs(sys.currentTime - expected) > DRIFT_TOLERANCE_S) sys.currentTime = expected;
      if (shouldPlay && sys.paused) void sys.play().catch(() => undefined);
    },
    [offset],
  );

  const play = useCallback(async () => {
    const m = master();
    if (!m) return;
    try {
      await m.play();
      setPlaying(true);
      alignSys(true);
    } catch {
      setPlaying(false);
    }
  }, [master, alignSys]);

  const pause = useCallback(() => {
    micRef.current?.pause();
    sysRef.current?.pause();
    setPlaying(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seek: (seconds, channel) => {
        // A system-audio moment is converted to the mic clock when the mic leads.
        const masterTime = channel === "sys" && micRef.current ? seconds + offset : seconds;
        setBoth(masterTime);
        void play();
      },
      getCurrentTime: () => master()?.currentTime ?? null,
    }),
    [master, offset, play, setBoth],
  );

  // Keep the second track in step and the position up to date.
  useEffect(() => {
    const m = master();
    if (!m) return;
    const onTime = () => {
      setTime(m.currentTime);
      if (micRef.current && !micRef.current.paused) alignSys(true);
    };
    const onMeta = () => {
      // MediaRecorder WebM files often report an infinite duration.
      if (Number.isFinite(m.duration) && m.duration > 0) setDuration(m.duration);
    };
    const onEnded = () => {
      if (m === micRef.current) sysRef.current?.pause();
      setPlaying(false);
    };
    m.addEventListener("timeupdate", onTime);
    m.addEventListener("loadedmetadata", onMeta);
    m.addEventListener("durationchange", onMeta);
    m.addEventListener("ended", onEnded);
    return () => {
      m.removeEventListener("timeupdate", onTime);
      m.removeEventListener("loadedmetadata", onMeta);
      m.removeEventListener("durationchange", onMeta);
      m.removeEventListener("ended", onEnded);
    };
  }, [audio, master, alignSys]);

  const handleDelete = async () => {
    try {
      pause();
      await deleteAudio(transcriptId).unwrap();
      setConfirmOpen(false);
      dispatch(setToastMessage({ message: t("recordingPlayer.deleted"), severity: "success" }));
    } catch (e) {
      const message =
        (e as { data?: { message?: string } })?.data?.message || t("recordingPlayer.deleteFailed");
      dispatch(setToastMessage({ message, severity: "error" }));
    }
  };

  if (isError) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("recordingPlayer.loadFailed")}
      </Typography>
    );
  }
  if (!audio) return null;

  if (audio.audioDeletedAt) {
    const date = new Date(audio.audioDeletedAt).toLocaleDateString();
    const byRetention =
      (metadata as { audioDeletedReason?: string } | null | undefined)?.audioDeletedReason ===
      "retention";
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t(byRetention ? "recordingPlayer.deletedByRetention" : "recordingPlayer.deletedOn", {
          date,
        })}
      </Typography>
    );
  }
  if (!audio.micUrl && !audio.sysUrl) return null;

  const max = Math.max(duration, time, 1);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, mb: 2, display: "flex", alignItems: "center", gap: 1.5, borderRadius: 2 }}
    >
      {audio.micUrl && (
        <audio ref={micRef} src={audio.micUrl} preload="metadata" onError={onTrackError} />
      )}
      {audio.sysUrl && (
        <audio ref={sysRef} src={audio.sysUrl} preload="metadata" onError={onTrackError} />
      )}
      <IconButton
        onClick={() => (playing ? pause() : void play())}
        aria-label={playing ? t("recordingPlayer.pause") : t("recordingPlayer.play")}
        color="primary"
      >
        {playing ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>
        {formatClock(time)}
        {duration > 0 ? ` / ${formatClock(duration)}` : ""}
      </Typography>
      <Box sx={{ flex: 1, px: 1 }}>
        <Slider
          size="small"
          min={0}
          max={max}
          step={1}
          value={Math.min(time, max)}
          onChange={(_, v) => setBoth(v as number)}
          aria-label={t("recordingPlayer.title")}
        />
      </Box>
      <Tooltip title={t("recordingPlayer.deleteAudio")}>
        <IconButton onClick={() => setConfirmOpen(true)} size="small" disabled={deleting}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t("recordingPlayer.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("recordingPlayer.deleteConfirmBody")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t("recordingPlayer.cancel")}</Button>
          <Button color="error" onClick={() => void handleDelete()} disabled={deleting}>
            {t("recordingPlayer.confirmDelete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
});

export default RecordingAudioPlayer;
