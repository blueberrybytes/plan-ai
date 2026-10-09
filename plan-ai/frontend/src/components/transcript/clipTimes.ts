/** Limits of a clip. The server checks the same ones. */
export const CLIP_MIN_SECONDS = 1;
export const CLIP_MAX_SECONDS = 300;
/** Length of the clip proposed when the dialog opens. */
export const CLIP_DEFAULT_SECONDS = 30;

/**
 * Seconds from "ss", "mm:ss" or "h:mm:ss". Null when the text is not a time.
 * Seconds may have decimals ("1:02.5").
 */
export const parseClock = (text: string): number | null => {
  const parts = text.trim().split(":");
  if (parts.length === 0 || parts.length > 3) return null;
  if (parts.some((part) => !/^\d+(\.\d+)?$/.test(part.trim()))) return null;
  const numbers = parts.map((part) => Number(part.trim()));
  // Only the last part may have decimals, and minutes and seconds stop at 59
  // when there is a bigger unit before them.
  if (numbers.slice(0, -1).some((n) => !Number.isInteger(n))) return null;
  if (numbers.slice(1).some((n) => n >= 60)) return null;
  return numbers.reduce((total, n) => total * 60 + n, 0);
};

/** 75 becomes "1:15", 3725 becomes "1:02:05". */
export const formatClipClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/**
 * The range proposed in the dialog: from where the player is now, 30 seconds
 * on, without passing the end of the recording.
 */
export const defaultClipRange = (
  currentSeconds: number | null,
  durationSeconds?: number | null,
): { start: number; end: number } => {
  const duration = durationSeconds && durationSeconds > 0 ? Math.floor(durationSeconds) : null;
  let start = Math.max(0, Math.floor(currentSeconds ?? 0));
  if (duration !== null && start > duration - CLIP_MIN_SECONDS) {
    start = Math.max(0, duration - CLIP_DEFAULT_SECONDS);
  }
  const end = start + CLIP_DEFAULT_SECONDS;
  return { start, end: duration !== null ? Math.min(end, duration) : end };
};

export type ClipRangeError = "format" | "order" | "tooShort" | "tooLong" | "outside";

/** What is wrong with the two times typed, or the range in seconds. */
export const readClipRange = (
  startText: string,
  endText: string,
  durationSeconds?: number | null,
): { error: ClipRangeError } | { startSeconds: number; endSeconds: number } => {
  const startSeconds = parseClock(startText);
  const endSeconds = parseClock(endText);
  if (startSeconds === null || endSeconds === null) return { error: "format" };
  if (endSeconds <= startSeconds) return { error: "order" };
  const length = endSeconds - startSeconds;
  if (length < CLIP_MIN_SECONDS) return { error: "tooShort" };
  if (length > CLIP_MAX_SECONDS) return { error: "tooLong" };
  // The stored duration is a whole number of seconds: one second of slack.
  if (durationSeconds && durationSeconds > 0 && endSeconds > durationSeconds + 1) {
    return { error: "outside" };
  }
  return { startSeconds, endSeconds };
};
