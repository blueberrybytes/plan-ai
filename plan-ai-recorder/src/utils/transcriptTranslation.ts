import type { TranscriptTranslation } from "../services/planAiApi";

// Same rule as the web (plan-ai/frontend/src/components/transcript/transcriptTranslation.ts).

interface TranslatableTranscript {
  utterances?: unknown;
  transcript?: string | null;
}

/**
 * The transcript with its text swapped for the translation. Speakers, times
 * and everything else stay. When the translation does not line up with the
 * transcript (it was edited or reprocessed meanwhile) the original comes back.
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

/** A name for a saved file: letters, digits, spaces and dashes only. */
export const fileSafeName = (title: string, fallback: string): string => {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
};
