import { getWhisperConfig, type WhisperConfig } from "./sttConfig";
import { writeWavHeader } from "../../utils/audioPcm";
import { withLongRequestDispatcher } from "./longRequest";

/**
 * Client for a self-hosted Whisper server speaking the OpenAI
 * `/v1/audio/transcriptions` API (speaches, faster-whisper-server, LocalAI…).
 * Used by the post-meeting pass, the live captions and Telegram voice notes.
 */

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
  /** Whisper's own estimate that the window held no speech, 0 to 1. */
  noSpeechProb?: number;
  /** Mean log-probability of the decoded tokens; near 0 is confident. */
  avgLogprob?: number;
  /** gzip ratio of the text; high values mean the decoder is looping. */
  compressionRatio?: number;
}

export interface WhisperTranscription {
  text: string;
  language?: string;
  duration?: number;
  segments: WhisperSegment[];
  words: WhisperWord[];
}

export interface WhisperTranscribeOptions {
  model: string;
  /** A language code, or "multi" / empty for auto-detection. */
  language?: string | null;
  /** Project vocabulary (names, products, acronyms), sent as the decoder prompt. */
  keyterms?: string[];
  filename?: string;
  mimeType?: string;
  timeoutMs?: number;
}

export class WhisperRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WhisperRequestError";
  }
}

/**
 * Whisper takes ISO 639-1 codes. The recorder sends Deepgram codes, which can
 * carry a region ("en-US", "pt-BR", "es-419") or be "multi". The region is
 * dropped, and "multi" becomes auto-detection, which Whisper does per request.
 */
export const toWhisperLanguage = (language?: string | null): string | undefined => {
  if (!language) return undefined;
  const code = language.trim().toLowerCase();
  if (!code || code === "multi" || code === "auto") return undefined;
  const base = code.split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : undefined;
};

/**
 * Project vocabulary goes in Whisper's `prompt`, which the decoder reads as
 * text that came just before the audio. Measured on a Spanish sample with
 * large-v3-turbo: with "Jira, Plan AI, Twenty…" as the prompt, "Plan I" and
 * "Twenti" came out right. The `hotwords` field that faster-whisper also
 * offers changed nothing, so it isn't used.
 *
 * Plain terms, no "Glossary:" lead-in: words in another language would pull
 * Whisper's language detection towards it. The prompt window is about 224
 * tokens and anything past it is cut silently, so the cap here keeps the cut
 * on whole terms.
 */
const MAX_PROMPT_CHARS = 600;

export const buildPrompt = (keyterms?: string[]): string | undefined => {
  if (!keyterms?.length) return undefined;
  let out = "";
  for (const term of keyterms) {
    const t = term.trim();
    if (!t) continue;
    const next = out ? `${out}, ${t}` : t;
    if (next.length > MAX_PROMPT_CHARS - 1) break;
    out = next;
  }
  return out ? `${out}.` : undefined;
};

const normalizeForMatch = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Whisper was trained on subtitled video, so on noise or near-silence it
 * sometimes "hears" the credits. The server's VAD filter removes most of
 * that, and this list catches the rest. Only whole-segment matches are
 * dropped: "gracias" or "thank you" on their own are real meeting speech.
 */
const HALLUCINATIONS = [
  "subtitulos realizados por la comunidad de amaraorg",
  "subtitulos por la comunidad de amaraorg",
  "subtitles by the amaraorg community",
  "gracias por ver el video",
  "gracias por ver",
  "thanks for watching",
  "thank you for watching",
  "suscribete al canal",
  "suscribete",
  "moltes gracies per veure el video",
].map(normalizeForMatch);

/**
 * `prompt`, when given, is also treated as noise: over near-silence Whisper
 * sometimes just repeats the vocabulary it was primed with.
 */
export const isLikelyHallucination = (text: string, prompt?: string): boolean => {
  const n = normalizeForMatch(text);
  if (n.length === 0 || HALLUCINATIONS.includes(n)) return true;
  return prompt !== undefined && n === normalizeForMatch(prompt);
};

/**
 * Whisper's own signals for invented text, with Whisper's own thresholds:
 * a window that probably held no speech (no_speech_prob > 0.6) decoded with
 * low confidence (avg_logprob < -1.0), or text so repetitive that gzip packs
 * it more than 2.4 to 1, which is the decoder stuck in a loop. These work in
 * every language; the phrase list above is only the backstop for servers
 * that don't return them.
 */
const NO_SPEECH_THRESHOLD = 0.6;
const LOGPROB_THRESHOLD = -1.0;
const COMPRESSION_RATIO_THRESHOLD = 2.4;

export const isLowConfidenceSegment = (s: WhisperSegment): boolean => {
  if (
    s.noSpeechProb !== undefined &&
    s.avgLogprob !== undefined &&
    s.noSpeechProb > NO_SPEECH_THRESHOLD &&
    s.avgLogprob < LOGPROB_THRESHOLD
  ) {
    return true;
  }
  return s.compressionRatio !== undefined && s.compressionRatio > COMPRESSION_RATIO_THRESHOLD;
};

/** A segment worth dropping, by Whisper's signals or by the phrase list. */
export const isNoiseSegment = (s: WhisperSegment, prompt?: string): boolean =>
  isLowConfidenceSegment(s) || isLikelyHallucination(s.text, prompt);

/**
 * Whisper words carry a leading space and the punctuation of the sentence.
 * Deepgram gives two fields for the same thing: `word` lowercase and bare,
 * and `punctuated_word` as displayed. The rest of the pipeline (echo dedup,
 * speaker insights) reads Deepgram's shape, so the words are mapped to it.
 */
export const toDeepgramWord = (
  w: WhisperWord,
  offsetSeconds = 0,
): { word: string; punctuated_word: string; start: number; end: number; confidence: number } => {
  const punctuated = w.word.trim();
  return {
    word: punctuated.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
    punctuated_word: punctuated,
    start: w.start + offsetSeconds,
    end: w.end + offsetSeconds,
    confidence: typeof w.probability === "number" ? w.probability : 1,
  };
};

/**
 * Brings a live sentence to a normal level before Whisper sees it: the same
 * problem transcodeToWav16kMono solves for recordings (a quiet mic makes
 * Whisper's voice filter drop real speech), done in place because live
 * sentences are raw PCM already. Peak-based, aiming at about -3 dBFS, and the
 * gain is capped: a clip that's quiet because it's only room noise must not
 * be turned into something that sounds like a voice.
 */
const TARGET_PEAK = 0.7;
const MAX_GAIN = 16;

export const normalizePcm16 = (pcm: Buffer): Buffer => {
  const samples = pcm.length >> 1;
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const v = Math.abs(pcm.readInt16LE(i * 2));
    if (v > peak) peak = v;
  }
  if (peak === 0) return pcm;
  const gain = Math.min(MAX_GAIN, (TARGET_PEAK * 32767) / peak);
  if (gain <= 1) return pcm;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(pcm.readInt16LE(i * 2) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  return out;
};

/** Wrap raw 16-bit little-endian mono PCM in a WAV header, without re-encoding. */
export const pcm16ToWav = (pcm: Buffer, sampleRate: number): Buffer =>
  Buffer.concat([writeWavHeader(sampleRate, pcm.length), pcm]);

interface RawSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
  words?: unknown;
  no_speech_prob?: unknown;
  avg_logprob?: unknown;
  compression_ratio?: unknown;
}

const optionalNumber = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

const parseWords = (raw: unknown): WhisperWord[] => {
  if (!Array.isArray(raw)) return [];
  const out: WhisperWord[] = [];
  for (const w of raw as Array<Record<string, unknown>>) {
    if (typeof w?.word !== "string" || typeof w.start !== "number" || typeof w.end !== "number") {
      continue;
    }
    out.push({
      word: w.word,
      start: w.start,
      end: w.end,
      probability: typeof w.probability === "number" ? w.probability : undefined,
    });
  }
  return out;
};

const parseTranscription = (body: unknown): WhisperTranscription => {
  const b = (body ?? {}) as Record<string, unknown>;
  const segments: WhisperSegment[] = Array.isArray(b.segments)
    ? (b.segments as RawSegment[])
        .filter((s) => typeof s.start === "number" && typeof s.end === "number")
        .map((s) => ({
          start: s.start as number,
          end: s.end as number,
          text: typeof s.text === "string" ? s.text.trim() : "",
          words: parseWords(s.words),
          noSpeechProb: optionalNumber(s.no_speech_prob),
          avgLogprob: optionalNumber(s.avg_logprob),
          compressionRatio: optionalNumber(s.compression_ratio),
        }))
    : [];
  return {
    text: typeof b.text === "string" ? b.text.trim() : "",
    language: typeof b.language === "string" ? b.language : undefined,
    duration: typeof b.duration === "number" ? b.duration : undefined,
    segments,
    words: parseWords(b.words),
  };
};

export const transcribeWithWhisper = async (
  audio: Buffer,
  options: WhisperTranscribeOptions,
  config: WhisperConfig = getWhisperConfig(),
): Promise<WhisperTranscription> => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: options.mimeType ?? "audio/wav" }),
    options.filename ?? "audio.wav",
  );
  form.append("model", options.model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  form.append("temperature", "0");
  // Server-side Silero VAD: skips non-speech before decoding. It's the main
  // guard against Whisper inventing text over silence and background noise.
  form.append("vad_filter", "true");

  const language = toWhisperLanguage(options.language);
  if (language) form.append("language", language);
  const prompt = buildPrompt(options.keyterms);
  if (prompt) form.append("prompt", prompt);

  let res: Response;
  try {
    res = await fetch(
      `${config.baseUrl}/v1/audio/transcriptions`,
      withLongRequestDispatcher({
        method: "POST",
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(options.timeoutMs ?? config.batchTimeoutMs),
      }),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new WhisperRequestError(`Whisper server unreachable at ${config.baseUrl}: ${reason}`);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new WhisperRequestError(`Whisper returned HTTP ${res.status}: ${detail}`, res.status);
  }
  return parseTranscription(await res.json());
};
