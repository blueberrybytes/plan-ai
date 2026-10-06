/**
 * Live translation of the meeting transcript: the pure part. No React and no
 * native modules here, so it can be tested on its own.
 */

/** Target languages the backend translates to. "" means off. */
export const TRANSLATION_LANGUAGES = [
  { code: "", name: "Off" },
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

export type TranslationErrorCode = "MISSING_API_KEY" | "TRANSLATION_UNAVAILABLE";

/** Translations by line number of the live transcript (see transcriptLineCount). */
export type TranslationLines = Record<number, string>;

/** A code from the list, or "" (off) for anything else. */
export function normalizeTranslationTarget(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return TRANSLATION_LANGUAGES.some((l) => l.code === value) ? value : "";
}

export function translationLanguageName(code: string): string {
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name ?? "Off";
}

/**
 * Lines the record screen draws for a transcript. It must count the same way
 * the screen splits it: the result is the index the next committed line gets.
 */
export function transcriptLineCount(transcript: string): number {
  return transcript.split("\n").filter(Boolean).length;
}

/** The translated text and its phrase id, or null when the message is not usable. */
export function parseTranslationMessage(msg: unknown): { id: string; text: string } | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as { type?: unknown; id?: unknown; text?: unknown };
  if (m.type !== "translation" || typeof m.id !== "string" || typeof m.text !== "string") {
    return null;
  }
  const text = m.text.trim();
  return m.id && text ? { id: m.id, text } : null;
}

export function parseTranslationErrorCode(msg: unknown): TranslationErrorCode {
  const code = (msg as { code?: unknown } | null)?.code;
  return code === "MISSING_API_KEY" ? "MISSING_API_KEY" : "TRANSLATION_UNAVAILABLE";
}

/**
 * Remembers which transcript line each finished phrase became. One per
 * socket: the backend restarts its phrase ids on every connection, so an id
 * from an older socket must not match a new phrase.
 */
export class PhraseLineMap {
  private lineById = new Map<string, number>();

  /** Call before the phrase is added, with the transcript as it is now. */
  remember(id: unknown, transcriptBefore: string): void {
    if (typeof id !== "string" || !id) return;
    this.lineById.set(id, transcriptLineCount(transcriptBefore));
  }

  lineOf(id: string): number | null {
    return this.lineById.get(id) ?? null;
  }
}

/** A copy of the lines with one translation set. */
export function withTranslation(
  lines: TranslationLines,
  line: number,
  text: string,
): TranslationLines {
  return { ...lines, [line]: text };
}
