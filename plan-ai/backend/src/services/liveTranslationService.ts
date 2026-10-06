import { generateText } from "ai";
import {
  FAST_AI_MODEL,
  MissingApiKeyError,
  getWorkspaceModel,
  privacyProviderPrefs,
} from "../utils/aiModelUtils";
import { aiUsageService } from "./aiUsageService";
import { logger } from "../utils/logger";

/**
 * Live translation of a meeting while it is being recorded.
 *
 * The audio stream hands over every finished phrase. Each one goes to a small
 * fast model with the last few phrases as context, and the translation goes
 * back to the client tagged with the phrase id. Phrases already in the target
 * language are not sent back.
 *
 * Nothing is stored: the translated text only lives on the client's screen.
 */

const MODEL = FAST_AI_MODEL;
const CONTEXT_PHRASES = 3;
const MAX_PHRASE_CHARS = 2000;
const CALL_TIMEOUT_MS = 8000;
const MAX_IN_FLIGHT = 4;
/** After this many failures in a row the translator turns itself off. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Target languages on offer. The value is the name the model is given. */
export const TRANSLATION_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  ca: "Catalan",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ar: "Arabic",
  hi: "Hindi",
  ur: "Urdu",
  ru: "Russian",
  uk: "Ukrainian",
  pl: "Polish",
  ro: "Romanian",
  tr: "Turkish",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
};

/** The language code when it is one we translate to, else null. */
export function normalizeTranslationLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().split("-")[0];
  return code in TRANSLATION_LANGUAGES ? code : null;
}

export type TranslationErrorCode = "MISSING_API_KEY" | "TRANSLATION_UNAVAILABLE";

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  /** Earlier phrases of the meeting, oldest first, in their original language. */
  context: string[];
  hint?: string;
}

export interface TranslationResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type TranslateFn = (req: TranslationRequest) => Promise<TranslationResult>;

const SYSTEM_PROMPT = `You translate one phrase of a live meeting transcript.

- Translate the phrase into the target language. Answer with the translation only: no quotes, no notes, no language name.
- The phrase comes from speech recognition. Keep the meaning, fix nothing else, add nothing.
- Keep names of people, companies and products as they are.
- The earlier phrases are context only. Do not translate them and do not repeat them.
- If the phrase is already in the target language, answer with the phrase unchanged.`;

function buildPrompt(req: TranslationRequest): string {
  const target = TRANSLATION_LANGUAGES[req.targetLanguage] ?? req.targetLanguage;
  return [
    `Target language: ${target}`,
    req.hint ? `Meeting vocabulary: ${req.hint}` : "",
    req.context.length ? `Earlier phrases:\n${req.context.map((c) => `- ${c}`).join("\n")}` : "",
    `Phrase:\n${req.text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The real call. Split out so the translator can be tested without a model. */
export function workspaceTranslateFn(workspaceId: string): TranslateFn {
  return async (req) => {
    const model = await getWorkspaceModel(workspaceId, MODEL);
    const response = await generateText({
      model,
      providerOptions: { openrouter: { provider: { ...privacyProviderPrefs() } } },
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(req),
      temperature: 0,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    return {
      text: response.text.trim(),
      inputTokens: response.totalUsage?.inputTokens || 0,
      outputTokens: response.totalUsage?.outputTokens || 0,
    };
  };
}

const comparable = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const hasWords = (s: string) => /\p{L}/u.test(s);

export interface LiveTranslatorOptions {
  userId: string;
  workspaceId: string;
  targetLanguage: string;
  translate: TranslateFn;
  onTranslation: (t: { id: string; source: "mic" | "sys"; text: string; language: string }) => void;
  onError: (code: TranslationErrorCode) => void;
  /** Project vocabulary, so names and jargon survive the translation. */
  hint?: string;
}

export class LiveTranslator {
  private target: string | null;
  private readonly recent: string[] = [];
  private inFlight = 0;
  private failures = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private closed = false;

  constructor(private readonly opts: LiveTranslatorOptions) {
    this.target = opts.targetLanguage;
  }

  get language(): string | null {
    return this.target;
  }

  /** Changes the target language. Null turns translation off. */
  setLanguage(language: string | null): void {
    this.target = language;
    this.failures = 0;
  }

  /** A finished phrase of the meeting. Never throws and never blocks the stream. */
  push(id: string, source: "mic" | "sys", raw: string): void {
    const text = raw.trim().slice(0, MAX_PHRASE_CHARS);
    if (!text) return;
    const context = this.recent.slice(-CONTEXT_PHRASES);
    this.recent.push(text);
    if (this.recent.length > CONTEXT_PHRASES) this.recent.shift();

    const target = this.target;
    if (this.closed || !target || !hasWords(text)) return;
    // Behind by more than a few phrases: skip this one instead of piling up.
    // A translation that arrives ten seconds late is of no use in a live call.
    if (this.inFlight >= MAX_IN_FLIGHT) return;

    this.inFlight++;
    this.opts
      .translate({ text, targetLanguage: target, context, hint: this.opts.hint })
      .then((result) => {
        this.failures = 0;
        this.inputTokens += result.inputTokens;
        this.outputTokens += result.outputTokens;
        // The language changed while this phrase was at the model.
        if (this.closed || this.target !== target) return;
        if (!result.text || comparable(result.text) === comparable(text)) return;
        this.opts.onTranslation({ id, source, text: result.text, language: target });
      })
      .catch((err: unknown) => this.onFailure(err))
      .finally(() => {
        this.inFlight--;
      });
  }

  private onFailure(err: unknown): void {
    if (this.closed || !this.target) return;
    if (err instanceof MissingApiKeyError) {
      this.target = null;
      this.opts.onError("MISSING_API_KEY");
      return;
    }
    // The provider's error can carry the phrase. Only its kind goes to the log.
    const e = err as { name?: string; statusCode?: number };
    logger.warn(
      `[LiveTranslation] call failed: ${e?.name ?? "Error"}${e?.statusCode ? ` ${e.statusCode}` : ""}`,
    );
    this.failures++;
    if (this.failures >= MAX_CONSECUTIVE_FAILURES) {
      this.target = null;
      this.opts.onError("TRANSLATION_UNAVAILABLE");
    }
  }

  /** Stops the translator and writes one usage row for the whole meeting. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.inputTokens + this.outputTokens === 0) return;
    await aiUsageService
      .logUsage({
        userId: this.opts.userId,
        workspaceId: this.opts.workspaceId,
        feature: "LIVE_TRANSLATION",
        provider: "OPENROUTER",
        model: MODEL,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
      })
      .catch((e) => logger.error("Usage logging error", e));
  }
}
