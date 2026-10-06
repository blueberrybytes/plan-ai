import type { TranscriptTranslation } from "../../store/apis/transcriptApi";

/** Languages the backend translates to (TRANSLATION_LANGUAGES in the backend). */
export const TRANSLATION_LANGUAGE_CODES = [
  "en",
  "es",
  "ca",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "ar",
  "hi",
  "ur",
  "ru",
  "uk",
  "pl",
  "ro",
  "tr",
  "zh",
  "ja",
  "ko",
] as const;

/** The language's name in the language of the interface, for example "inglés". */
export function languageLabel(code: string, uiLanguage: string): string {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

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
