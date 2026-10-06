import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import prisma from "../prisma/prismaClient";
import {
  DEFAULT_AI_MODEL,
  getStructuredProviderOptions,
  getWorkspaceModel,
  privacyProviderPrefs,
} from "../utils/aiModelUtils";
import { aiUsageService } from "./aiUsageService";
import { TRANSLATION_LANGUAGES, normalizeTranslationLanguage } from "./liveTranslationService";

/**
 * Translation of a saved transcript, asked for from the transcript page.
 *
 * The transcript is cut into lines (one per utterance, or one per line of the
 * flat text), translated in batches and stored per language. The stored copy
 * is reused until the transcript text changes.
 */

const MODEL = DEFAULT_AI_MODEL;
const BATCH_LINES = 40;
const BATCH_CHARS = 6000;
const PARALLEL_BATCHES = 4;
/** About five hours of meeting. Longer transcripts are refused, not cut. */
const MAX_SOURCE_CHARS = 600_000;

export interface TranscriptTranslationResult {
  language: string;
  summary: string | null;
  /**
   * One string per utterance when the transcript has utterances, else one per
   * line of the flat transcript (speaker labels kept as they are).
   */
  lines: string[];
  /** True when it came from the stored copy and no model was called. */
  cached: boolean;
}

interface TranslationError {
  status: number;
  message: string;
}
const fail = (status: number, message: string): TranslationError => ({ status, message });

interface SourceLine {
  /** "Speaker: " for flat transcripts, kept out of the model's hands. */
  prefix: string;
  text: string;
}

// Same idea as the web's speakerBlocks.ts: a short name, then a colon.
const LABEL_LINE = /^(\p{L}[\p{L}\p{N} ._'-]{0,39}:[ \t]*)(.*)$/u;

/** The lines to translate, from the utterances when there are any. */
export function sourceLines(transcript: {
  utterances: unknown;
  transcript: string | null;
}): SourceLine[] {
  if (Array.isArray(transcript.utterances) && transcript.utterances.length > 0) {
    return transcript.utterances.map((u) => ({
      prefix: "",
      text: String((u as { transcript?: unknown })?.transcript ?? ""),
    }));
  }
  return (transcript.transcript ?? "").split(/\r?\n/).map((line) => {
    const match = line.match(LABEL_LINE);
    return match ? { prefix: match[1], text: match[2] } : { prefix: "", text: line };
  });
}

export function hashSource(lines: SourceLine[], summary: string | null): string {
  const hash = createHash("sha256");
  hash.update(summary ?? "");
  for (const l of lines) hash.update(`\n${l.prefix}${l.text}`);
  return hash.digest("hex");
}

interface Batch {
  /** Index of each line in the full list. */
  indexes: number[];
  texts: string[];
}

/** Groups the lines that have words into batches. Empty lines are left alone. */
export function toBatches(lines: SourceLine[]): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { indexes: [], texts: [] };
  let chars = 0;
  lines.forEach((line, index) => {
    if (!/\p{L}/u.test(line.text)) return;
    if (
      current.indexes.length >= BATCH_LINES ||
      (chars + line.text.length > BATCH_CHARS && current.indexes.length > 0)
    ) {
      batches.push(current);
      current = { indexes: [], texts: [] };
      chars = 0;
    }
    current.indexes.push(index);
    current.texts.push(line.text);
    chars += line.text.length;
  });
  if (current.indexes.length > 0) batches.push(current);
  return batches;
}

const BatchSchema = z.object({
  items: z.array(
    z.object({
      n: z.number().describe("The number of the line, as given."),
      text: z.string().describe("The translation of that line."),
    }),
  ),
});

const SYSTEM_PROMPT = `You translate numbered lines of a meeting transcript.

- Translate every line into the target language. Return one item per line, with the same number.
- The lines come from speech recognition. Keep the meaning, add nothing, drop nothing.
- Keep names of people, companies and products as they are.
- A line already in the target language is returned unchanged.
- Never merge or split lines.`;

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type BatchTranslateFn = (
  texts: string[],
  language: string,
) => Promise<{ texts: Array<string | undefined>; usage: Usage }>;

export type TextTranslateFn = (
  text: string,
  language: string,
) => Promise<{ text: string; usage: Usage }>;

const providerOptions = () => {
  const structured = getStructuredProviderOptions(MODEL);
  return {
    openrouter: { ...structured.openrouter, provider: { ...privacyProviderPrefs() } },
  };
};

const usageOf = (u: { inputTokens?: number; outputTokens?: number } | undefined): Usage => ({
  inputTokens: u?.inputTokens || 0,
  outputTokens: u?.outputTokens || 0,
});

function workspaceBatchTranslate(workspaceId: string): BatchTranslateFn {
  return async (texts, language) => {
    const model = await getWorkspaceModel(workspaceId, MODEL);
    const response = await generateText({
      model,
      providerOptions: providerOptions(),
      output: Output.object({
        name: "TranslatedLines",
        description: "The translated lines, one item per input line.",
        schema: BatchSchema,
      }),
      system: SYSTEM_PROMPT,
      prompt: [
        `Target language: ${TRANSLATION_LANGUAGES[language]}`,
        `Lines:\n${texts.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ")}`).join("\n")}`,
      ].join("\n\n"),
      temperature: 0,
    });
    const out: Array<string | undefined> = texts.map(() => undefined);
    for (const item of response.output?.items ?? []) {
      const i = Math.round(item.n) - 1;
      if (i >= 0 && i < out.length && item.text.trim()) out[i] = item.text.trim();
    }
    return { texts: out, usage: usageOf(response.totalUsage) };
  };
}

function workspaceTextTranslate(workspaceId: string): TextTranslateFn {
  return async (text, language) => {
    const model = await getWorkspaceModel(workspaceId, MODEL);
    const response = await generateText({
      model,
      providerOptions: { openrouter: { provider: { ...privacyProviderPrefs() } } },
      system:
        "You translate the summary of a meeting. Answer with the translation only. Keep the formatting, the line breaks and the names of people, companies and products.",
      prompt: `Target language: ${TRANSLATION_LANGUAGES[language]}\n\nSummary:\n${text}`,
      temperature: 0,
    });
    return { text: response.text.trim(), usage: usageOf(response.totalUsage) };
  };
}

/** Runs the jobs a few at a time, keeping the order of the results. */
async function inPool<T, R>(items: T[], size: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await job(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

export interface TranslateTranscriptInput {
  workspaceId: string;
  userId: string;
  transcriptId: string;
  language: string;
  /** Translate again even when a stored copy matches. */
  force?: boolean;
  /** For tests. */
  translateBatch?: BatchTranslateFn;
  translateText?: TextTranslateFn;
}

export async function translateTranscript(
  input: TranslateTranscriptInput,
): Promise<TranscriptTranslationResult> {
  const language = normalizeTranslationLanguage(input.language);
  if (!language) throw fail(400, "That language is not available for translation.");

  const transcript = await prisma.transcript.findFirst({
    where: { id: input.transcriptId, workspaceId: input.workspaceId },
    select: { id: true, projectId: true, summary: true, transcript: true, utterances: true },
  });
  if (!transcript) throw fail(404, "Transcript not found");

  const lines = sourceLines(transcript);
  const summary = transcript.summary?.trim() || null;
  const batches = toBatches(lines);
  if (batches.length === 0 && !summary) throw fail(400, "This transcript has no text yet.");

  const totalChars = lines.reduce((n, l) => n + l.text.length, 0);
  if (totalChars > MAX_SOURCE_CHARS) {
    throw fail(413, "This transcript is too long to translate in one go.");
  }

  const sourceHash = hashSource(lines, summary);
  const key = { transcriptId_language: { transcriptId: transcript.id, language } };
  if (!input.force) {
    const stored = await prisma.transcriptTranslation.findUnique({ where: key });
    if (stored && stored.sourceHash === sourceHash && Array.isArray(stored.lines)) {
      return {
        language,
        summary: stored.summary,
        lines: stored.lines.map((l) => String(l ?? "")),
        cached: true,
      };
    }
  }

  const translateBatch = input.translateBatch ?? workspaceBatchTranslate(input.workspaceId);
  const translateText = input.translateText ?? workspaceTextTranslate(input.workspaceId);
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: Usage) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
  };

  let translated: string[];
  let translatedSummary: string | null = null;
  try {
    // A line the model skipped keeps its original text, so nothing goes missing.
    translated = lines.map((l) => l.prefix + l.text);
    const [, summaryResult] = await Promise.all([
      inPool(batches, PARALLEL_BATCHES, async (batch) => {
        const result = await translateBatch(batch.texts, language);
        add(result.usage);
        batch.indexes.forEach((lineIndex, i) => {
          const text = result.texts[i];
          if (text) translated[lineIndex] = lines[lineIndex].prefix + text;
        });
      }),
      summary ? translateText(summary, language) : Promise.resolve(null),
    ]);
    if (summaryResult) {
      add(summaryResult.usage);
      translatedSummary = summaryResult.text || null;
    }
  } finally {
    // Batches that did run were paid for, also when a later one failed.
    if (usage.inputTokens + usage.outputTokens > 0) {
      await aiUsageService.logUsage({
        userId: input.userId,
        workspaceId: input.workspaceId,
        projectId: transcript.projectId,
        feature: "TRANSCRIPT_TRANSLATION",
        provider: "OPENROUTER",
        model: MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    }
  }

  const data = { sourceHash, summary: translatedSummary, lines: translated };
  await prisma.transcriptTranslation.upsert({
    where: key,
    create: { transcriptId: transcript.id, language, ...data },
    update: data,
  });

  return { language, summary: translatedSummary, lines: translated, cached: false };
}
