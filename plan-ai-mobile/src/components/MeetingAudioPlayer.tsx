import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { IconButton, ProgressBar, Surface, Text, useTheme } from "react-native-paper";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { recordingService } from "../services/recordingService";
import type { TranscriptAudio } from "../services/planAiApi";

/** Which recorded file a time belongs to: the microphone or the system audio. */
export type AudioChannel = "mic" | "sys";

// A drift under this is not heard. Correcting smaller drifts makes the second
// file stutter on every check.
const MAX_DRIFT_SECONDS = 0.3;
const SYNC_EVERY_MS = 500;
const SKIP_SECONDS = 15;
// Seek within 100 ms of the target. The default tolerance lets iOS land on
// the nearest keyframe, which can be seconds away in an m4a file.
const SEEK_TOLERANCE_MS = 100;

export interface MeetingPlayback {
  /** There is at least one file to play. */
  available: boolean;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  /** Position on the main file (the microphone when there is one), in seconds. */
  currentTime: number;
  duration: number;
  toggle: () => void;
  pause: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekToFraction: (fraction: number) => void;
  /** Plays from `seconds` of the given file (mic by default). */
  playFrom: (seconds: number, channel?: AudioChannel) => void;
}

/**
 * Plays a meeting's audio. Desktop meetings have two files, the microphone
 * and the system audio, that did not start at the same moment:
 * system time = mic time - micSysOffsetSeconds. The mic file leads and the
 * system file follows it, corrected when they drift apart by more than 0.3 s.
 * A phone meeting has only the mic file.
 */
export function useMeetingPlayback(audio: TranscriptAudio | null): MeetingPlayback {
  const micUrl = audio?.micUrl ?? null;
  const sysUrl = audio?.sysUrl ?? null;
  const offset = audio?.micSysOffsetSeconds ?? 0;
  const mic = useAudioPlayer(micUrl, { updateInterval: 250 });
  const sys = useAudioPlayer(sysUrl, { updateInterval: 250 });
  const leadIsMic = !!micUrl;
  const lead = leadIsMic ? mic : sys;
  const follower = micUrl && sysUrl ? sys : null;
  const status = useAudioPlayerStatus(lead);

  // Refs so the callbacks below stay stable for the screen's effects.
  const ref = useRef({ lead, follower, offset, leadIsMic });
  ref.current = { lead, follower, offset, leadIsMic };

  /** Moves the following file to match the lead's position. Never throws. */
  const alignFollower = useCallback((leadTime: number, play: boolean) => {
    const { follower: f, offset: o } = ref.current;
    if (!f) return;
    try {
      const target = leadTime - o;
      const ended = f.duration > 0 && target >= f.duration;
      if (target < 0 || ended) {
        // The system audio has not started yet at this point, or is over.
        if (f.playing) f.pause();
        if (target < 0) void f.seekTo(0).catch(() => undefined);
        return;
      }
      if (Math.abs(f.currentTime - target) > MAX_DRIFT_SECONDS) {
        void f.seekTo(target, SEEK_TOLERANCE_MS, SEEK_TOLERANCE_MS).catch(() => undefined);
      }
      if (play && !f.playing) f.play();
    } catch (err) {
      console.warn("[player] could not align the system audio", err);
    }
  }, []);

  const seekLead = useCallback(
    (leadTime: number) => {
      const { lead: l } = ref.current;
      const max = l.duration > 0 ? l.duration : Number.POSITIVE_INFINITY;
      const t = Math.min(Math.max(0, leadTime), max);
      void l.seekTo(t, SEEK_TOLERANCE_MS, SEEK_TOLERANCE_MS).catch(() => undefined);
      alignFollower(t, l.playing);
    },
    [alignFollower],
  );

  const play = useCallback(async (restartIfEnded: boolean) => {
    // While a meeting records, the microphone would pick up the playback and
    // it would end up in that meeting's audio and transcript. Changing the
    // audio mode could also stop the capture. So nothing plays until it ends.
    if (recordingService.isMeetingActive()) {
      Alert.alert(
        "A meeting is being recorded",
        "Playback is off until the recording stops, so it does not end up in that meeting.",
      );
      return;
    }
    {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: "doNotMix",
        });
      } catch (err) {
        console.warn("[player] could not set the audio mode", err);
      }
    }
    const { lead: l } = ref.current;
    try {
      // Played to the end: the play button starts again from the beginning.
      if (restartIfEnded && l.duration > 0 && l.currentTime >= l.duration - 0.25) {
        await l.seekTo(0).catch(() => undefined);
      }
      l.play();
      alignFollower(l.currentTime, true);
    } catch (err) {
      console.warn("[player] could not play", err);
    }
  }, [alignFollower]);

  const pause = useCallback(() => {
    const { lead: l, follower: f } = ref.current;
    try {
      l.pause();
      f?.pause();
    } catch {
      // released player (the screen is closing)
    }
  }, []);

  // Keep the system audio in step while playing, and stop it with the lead.
  const playing = status.playing;
  useEffect(() => {
    if (!follower) return;
    if (!playing) {
      try {
        follower.pause();
      } catch {
        // released player
      }
      return;
    }
    const timer = setInterval(() => {
      try {
        alignFollower(ref.current.lead.currentTime, true);
      } catch {
        // released player
      }
    }, SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [playing, follower, alignFollower]);

  const toggle = useCallback(() => {
    if (ref.current.lead.playing) pause();
    else void play(true);
  }, [pause, play]);

  const seekBy = useCallback(
    (delta: number) => seekLead(ref.current.lead.currentTime + delta),
    [seekLead],
  );

  const seekToFraction = useCallback(
    (fraction: number) => {
      const d = ref.current.lead.duration;
      if (d > 0) seekLead(Math.min(1, Math.max(0, fraction)) * d);
    },
    [seekLead],
  );

  const playFrom = useCallback(
    (seconds: number, channel: AudioChannel = "mic") => {
      const { leadIsMic: micLeads, offset: o } = ref.current;
      // Convert to the lead file's time: mic time = system time + offset.
      let leadTime = seconds;
      if (micLeads && channel === "sys") leadTime = seconds + o;
      if (!micLeads && channel === "mic") leadTime = seconds - o;
      seekLead(leadTime);
      if (!ref.current.lead.playing) void play(false);
    },
    [seekLead, play],
  );

  return {
    available: !!(micUrl || sysUrl),
    playing: status.playing,
    isLoaded: status.isLoaded,
    isBuffering: status.isBuffering,
    currentTime: status.currentTime,
    duration: status.duration,
    toggle,
    pause,
    seekBy,
    seekToFraction,
    playFrom,
  };
}

/** Clock time: 4:05, 12:34 or 1:02:03. */
export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/** Compact player: back 15 s, play or pause, forward 15 s, and a bar to tap. */
export function MeetingAudioBar({ playback }: { playback: MeetingPlayback }) {
  const theme = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const { playing, isLoaded, isBuffering, currentTime, duration } = playback;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <Surface
      elevation={0}
      style={{
        backgroundColor: theme.colors.surfaceVariant,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton
          icon="rewind-15"
          size={22}
          accessibilityLabel="Back 15 seconds"
          onPress={() => playback.seekBy(-SKIP_SECONDS)}
          style={{ margin: 0 }}
        />
        <IconButton
          icon={playing ? "pause" : "play"}
          mode="contained"
          size={24}
          accessibilityLabel={playing ? "Pause" : "Play the recording"}
          onPress={playback.toggle}
          style={{ margin: 0 }}
        />
        <IconButton
          icon="fast-forward-15"
          size={22}
          accessibilityLabel="Forward 15 seconds"
          onPress={() => playback.seekBy(SKIP_SECONDS)}
          style={{ margin: 0 }}
        />
        <Text
          variant="labelMedium"
          style={{
            flex: 1,
            textAlign: "right",
            marginRight: 8,
            color: theme.colors.onSurfaceVariant,
            fontVariant: ["tabular-nums"],
          }}
        >
          {!isLoaded || isBuffering
            ? "Loading..."
            : `${formatClock(currentTime)} / ${formatClock(duration)}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Position in the recording"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (barWidth > 0) playback.seekToFraction(e.nativeEvent.locationX / barWidth);
        }}
        hitSlop={{ top: 8, bottom: 8 }}
        style={{ paddingVertical: 8, paddingHorizontal: 4 }}
      >
        <ProgressBar
          progress={progress}
          color={theme.colors.primary}
          style={{ height: 4, borderRadius: 2 }}
        />
      </Pressable>
    </Surface>
  );
}
