import type { TranscriptTranslation } from "../services/planAiApi";

/**
 * Pure helpers for sharing a saved meeting: clip times and the translated
 * view. Same rules as the web (plan-ai/frontend/src/components/transcript/
 * clipTimes.ts and transcriptTranslation.ts); the server checks the clip
 * limits again.
 */

export const CLIP_MIN_SECONDS = 1;
export const CLIP_MAX_SECONDS = 300;
/** Length of the clip proposed when the dialog opens. */
export const CLIP_DEFAULT_SECONDS = 30;

/** Seconds from "ss", "mm:ss" or "h:mm:ss". Null when the text is not a time. */
export const parseClock = (text: string): number | null => {
  const parts = text.trim().split(":");
  if (parts.length === 0 || parts.length > 3) return null;
  if (parts.some((part) => !/^\d+(\.\d+)?$/.test(part.trim()))) return null;
  const numbers = parts.map((part) => Number(part.trim()));
  // Only the last part may have decimals. Minutes and seconds stop at 59
  // when a bigger unit comes before them.
  if (numbers.slice(0, -1).some((n) => !Number.isInteger(n))) return null;
  if (numbers.slice(1).some((n) => n >= 60)) return null;
  return numbers.reduce((total, n) => total * 60 + n, 0);
};

/** From where the player is now, 30 seconds on, inside the recording. */
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

/** What is wrong with the two times typed, as a sentence, or the range in seconds. */
export const readClipRange = (
  startText: string,
  endText: string,
  durationSeconds?: number | null,
): { error: string } | { startSeconds: number; endSeconds: number } => {
  const startSeconds = parseClock(startText);
  const endSeconds = parseClock(endText);
  if (startSeconds === null || endSeconds === null) {
    return { error: "Write the times as minutes and seconds, for example 4:05." };
  }
  if (endSeconds <= startSeconds) return { error: "The end must come after the start." };
  const length = endSeconds - startSeconds;
  if (length < CLIP_MIN_SECONDS) return { error: "A clip lasts at least 1 second." };
  if (length > CLIP_MAX_SECONDS) return { error: "A clip lasts at most 5 minutes." };
  // The stored duration is a whole number of seconds: one second of slack.
  if (durationSeconds && durationSeconds > 0 && endSeconds > durationSeconds + 1) {
    return { error: "The end is past the end of the recording." };
  }
  return { startSeconds, endSeconds };
};

interface TranslatableTranscript {
  utterances?: unknown;
  transcript?: string | null;
}

/**
 * The transcript with its text swapped for the translation. Speakers and
 * times stay. When the translation does not line up (the meeting was edited
 * or reprocessed meanwhile) the original comes back.
 */
export function applyTranslation<T extends TranslatableTranscript>(
  transcript: T,
  translation: Pick<TranscriptTranslation, "lines"> | null,
): T {
  if (!translation) return transcript;
  const { lines } = translation;
  if (Array.isArray(transcript.utterances) && transcript.utterances.length > 0) {
    if (lines.length !== transcript.utterances.length) return transcript;
    return {
      ...transcript,
      utterances: transcript.utterances.map((u, i) => ({
        ...(u as Record<string, unknown>),
        transcript: lines[i],
      })),
    };
  }
  const original = (transcript.transcript ?? "").split(/\r?\n/);
  if (lines.length !== original.length) return transcript;
  return { ...transcript, transcript: lines.join("\n") };
}

/** A name for a file: letters, digits, spaces and dashes only. */
export const fileSafeName = (title: string, fallback: string): string => {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
};
