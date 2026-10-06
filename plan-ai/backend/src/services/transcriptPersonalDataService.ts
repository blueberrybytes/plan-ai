import prisma from "../prisma/prismaClient";
import {
  detectPersonalData,
  emptyCounts,
  maskPersonalData,
  type PersonalDataCounts,
} from "../utils/personalData";
import { sourceLines } from "./transcriptTranslationService";

/**
 * Personal data in a saved transcript: how much there is, and the same
 * transcript with it hidden. Worked out on request with rules, never stored,
 * and the transcript itself is not changed.
 */

export interface TranscriptPersonalData {
  /** How many pieces of each kind were found in the transcript and its summary. */
  counts: PersonalDataCounts;
  total: number;
  /** The summary with the personal data replaced by labels. */
  summary: string | null;
  /**
   * The transcript with the personal data replaced by labels: one string per
   * utterance, or one per line of the flat transcript. Same shape as a
   * translation, so the same code can show it.
   */
  lines: string[];
}

export async function getTranscriptPersonalData(
  workspaceId: string,
  transcriptId: string,
): Promise<TranscriptPersonalData> {
  const transcript = await prisma.transcript.findFirst({
    where: { id: transcriptId, workspaceId },
    select: { summary: true, transcript: true, utterances: true },
  });
  if (!transcript) throw { status: 404, message: "Transcript not found" };

  const counts = emptyCounts();
  const mask = (text: string): string => {
    const spans = detectPersonalData(text);
    for (const span of spans) counts[span.type] += 1;
    return maskPersonalData(text, spans);
  };

  const lines = sourceLines(transcript).map((line) => line.prefix + mask(line.text));
  const summary = transcript.summary ? mask(transcript.summary) : null;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { counts, total, summary, lines };
}
