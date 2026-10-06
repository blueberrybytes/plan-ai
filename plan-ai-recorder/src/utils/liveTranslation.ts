/**
 * Live translation of the transcript while recording.
 *
 * The backend tags every finished phrase with an id and sends its translation
 * a second or two later with the same id. A bubble can hold several phrases
 * (same speaker, merged), so each bubble keeps the ids of its phrases in
 * spoken order and the translated text is looked up when it is painted.
 *
 * Translations only live on screen. They are not saved with the recording and
 * not written to the crash recovery copy.
 */

/** "" means translation is off. */
export const TRANSLATION_OFF = "";

/** Target languages the backend offers (TRANSLATION_LANGUAGES there). */
export const TRANSLATION_LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "ca", name: "Catalan" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ur", name: "Urdu" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "pl", name: "Polish" },
  { code: "ro", name: "Romanian" },
  { code: "tr", name: "Turkish" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
];

export type TranslationErrorCode =
  | "MISSING_API_KEY"
  | "TRANSLATION_UNAVAILABLE";

/** Translated text by phrase id. */
export type TranslationMap = Record<string, string>;

/** A stored or received target code, or "" when it is not one we offer. */
export const normalizeTranslateTo = (value: unknown): string =>
  typeof value === "string" &&
  TRANSLATION_LANGUAGES.some((l) => l.code === value)
    ? value
    : TRANSLATION_OFF;

/**
 * Phrase ids of a bubble after one more phrase is merged at its end. A phrase
 * without id (older backend, interim text committed on pause) adds nothing.
 */
export const withPhraseId = (
  phraseIds: string[] | undefined,
  phraseId: string | undefined,
): string[] | undefined =>
  phraseId ? [...(phraseIds ?? []), phraseId] : phraseIds;

/**
 * The translation of a bubble: the translations of its phrases, joined in
 * spoken order. Phrases with no translation (already in the target language,
 * or the model call failed) are skipped. "" when there is nothing to show.
 */
export const translationForPhrases = (
  phraseIds: string[] | undefined,
  translations: TranslationMap,
): string => {
  if (!phraseIds || phraseIds.length === 0) return "";
  const parts: string[] = [];
  for (const id of phraseIds) {
    const text = translations[id];
    if (text) parts.push(text);
  }
  return parts.join(" ");
};

/** The notice shown when the backend turns translation off. */
export const translationErrorMessage = (code: TranslationErrorCode): string =>
  code === "MISSING_API_KEY"
    ? "Live translation is off. This workspace needs an AI key configured."
    : "Live translation is not available right now. It has been turned off.";
