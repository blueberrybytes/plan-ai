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
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  DeleteOutline as DeleteIcon,
} from "@mui/icons-material";
import { useAuth } from "../hooks/useAuth";
import type { components } from "../types/api";

type AudioInfo = components["schemas"]["TranscriptAudioResponse"];
export type AudioChannel = "mic" | "sys";

export interface RecordingAudioPlayerHandle {
  /** Plays from `seconds` of the given file's own timeline. */
  seek: (seconds: number, channel: AudioChannel) => void;
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

// Beyond this the system track is moved back in step while playing.
const DRIFT_TOLERANCE_S = 0.3;

/**
 * Plays a meeting's audio: the user's microphone and the meeting's system
 * audio play together as one. The backend measures how much later the mic
 * file runs (`micSysOffsetSeconds`); the system track follows the mic with
 * that offset, and the mic is the clock when there is one.
 */
const RecordingAudioPlayer = forwardRef<
  RecordingAudioPlayerHandle,
  {
    transcriptId: string;
    durationHint?: number | null;
    deletedReason?: string;
    onDeleted?: () => void;
  }
>(function RecordingAudioPlayer(
  { transcriptId, durationHint, deletedReason, onDeleted },
  ref,
) {
  const { api } = useAuth();
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationHint ?? 0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const micRef = useRef<HTMLAudioElement>(null);
  const sysRef = useRef<HTMLAudioElement>(null);
  const offset = audio?.micSysOffsetSeconds ?? 0;
  // The links are signed for 12 h. When a track fails to load (the window
  // stayed open), new links are asked for and playback resumes where it was.
  const [reloadKey, setReloadKey] = useState(0);
  const lastReloadRef = useRef(0);
  const resumeAtRef = useRef<number | null>(null);
  const onTrackError = useCallback(() => {
    if (Date.now() - lastReloadRef.current < 60_000) return;
    lastReloadRef.current = Date.now();
    resumeAtRef.current =
      (micRef.current ?? sysRef.current)?.currentTime ?? null;
    setPlaying(false);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getTranscriptAudio(transcriptId)
      .then((a) => {
        if (!cancelled) setAudio(a);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, transcriptId, reloadKey]);

  const setBoth = useCallback(
    (masterTime: number) => {
      const t0 = Math.max(0, masterTime);
      if (micRef.current) {
        micRef.current.currentTime = t0;
        if (sysRef.current)
          sysRef.current.currentTime = Math.max(0, t0 - offset);
      } else if (sysRef.current) {
        sysRef.current.currentTime = t0;
      }
      setTime(t0);
    },
    [offset],
  );

  /**
   * Puts the system track where the mic says it should be. Before the system
   * recording started, or after it ended, it stays silent instead of playing
   * the wrong seconds.
   */
  const alignSys = useCallback(
    (shouldPlay: boolean) => {
      const mic = micRef.current;
      const sys = sysRef.current;
      if (!mic || !sys) return;
      const expected = mic.currentTime - offset;
      const ended =
        Number.isFinite(sys.duration) &&
        sys.duration > 0 &&
        expected >= sys.duration;
      if (expected < 0 || ended) {
        if (!sys.paused) sys.pause();
        if (expected < 0 && sys.currentTime !== 0) sys.currentTime = 0;
        return;
      }
      if (Math.abs(sys.currentTime - expected) > DRIFT_TOLERANCE_S) {
        sys.currentTime = expected;
      }
      if (shouldPlay && sys.paused) void sys.play().catch(() => undefined);
    },
    [offset],
  );

  // The mic (or the only track) is the clock; the system track follows it.
  const play = useCallback(async () => {
    const m = micRef.current ?? sysRef.current;
    if (!m) return;
    try {
      await m.play();
      setPlaying(true);
      alignSys(true);
    } catch {
      setPlaying(false);
    }
  }, [alignSys]);

  const pause = useCallback(() => {
    micRef.current?.pause();
    sysRef.current?.pause();
    setPlaying(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seek: (seconds, channel) => {
        const masterTime =
          channel === "sys" && micRef.current ? seconds + offset : seconds;
        setBoth(masterTime);
        void play();
      },
    }),
    [offset, play, setBoth],
  );

  useEffect(() => {
    const m = micRef.current ?? sysRef.current;
    if (!m) return;
    const onTime = () => {
      setTime(m.currentTime);
      if (micRef.current && !micRef.current.paused) alignSys(true);
    };
    const onMeta = () => {
      // MediaRecorder WebM files often report an infinite duration.
      if (Number.isFinite(m.duration) && m.duration > 0)
        setDuration(m.duration);
      if (resumeAtRef.current !== null) {
        setBoth(resumeAtRef.current);
        resumeAtRef.current = null;
      }
    };
    const onEnded = () => {
      micRef.current?.pause();
      sysRef.current?.pause();
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
  }, [audio, alignSys, setBoth]);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      pause();
      await api.deleteTranscriptAudio(transcriptId);
      setConfirmOpen(false);
      setAudio({ audioDeletedAt: new Date().toISOString() });
      onDeleted?.();
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not delete the audio.",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loadFailed) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Could not load the audio.
      </Typography>
    );
  }
  if (!audio) return null;
  if (audio.audioDeletedAt) {
    const date = new Date(audio.audioDeletedAt).toLocaleDateString();
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The audio of this meeting was deleted on {date}
        {deletedReason === "retention"
          ? " by the workspace retention rule"
          : ""}
        . The transcript stays.
      </Typography>
    );
  }
  if (!audio.micUrl && !audio.sysUrl) return null;

  const max = Math.max(duration, time, 1);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 2,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        borderRadius: 2,
      }}
    >
      {audio.micUrl && (
        <audio
          ref={micRef}
          src={audio.micUrl}
          preload="metadata"
          onError={onTrackError}
        />
      )}
      {audio.sysUrl && (
        <audio
          ref={sysRef}
          src={audio.sysUrl}
          preload="metadata"
          onError={onTrackError}
        />
      )}
      <IconButton
        onClick={() => (playing ? pause() : void play())}
        aria-label={playing ? "Pause" : "Play"}
        color="primary"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </IconButton>
      <Typography
        variant="body2"
        sx={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}
      >
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
          aria-label="Recording position"
        />
      </Box>
      <Tooltip title="Delete audio">
        <IconButton
          onClick={() => setConfirmOpen(true)}
          size="small"
          disabled={deleting}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete the audio of this meeting?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The audio files are deleted for good. The transcript, summary,
            speakers and tasks stay. Reprocessing will then work from the text
            only.
          </DialogContentText>
          {deleteError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {deleteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
});

export default RecordingAudioPlayer;
