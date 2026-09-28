/**
 * Splits a flat "Speaker: text" transcript into speaker blocks, for transcripts
 * that have no structured utterances (text-only saves, crash recoveries, old
 * recordings).
 *
 * The recorder writes one utterance per line with a SINGLE newline
 * ("User: …\nOthers: …"). The views used to split on blank lines only, so a
 * recovered meeting became one block labelled with its first speaker and the
 * other side's words showed up as the user's (field report 2026-09-27). Blank
 * line separated transcripts still parse the same way.
 */
export interface SpeakerBlock {
  /** Null for text before the first labelled line. */
  speaker: string | null;
  text: string;
}

// A label is a short name: starts with a letter, at most 40 characters and
// 4 words. The limits keep prose like "The plan for next week: …" from being
// read as a speaker.
const LABEL_LINE = /^(\p{L}[\p{L}\p{N} ._'-]{0,39}):[ \t]*(.*)$/u;
const MAX_LABEL_WORDS = 4;

function parseLabel(line: string): { speaker: string; text: string } | null {
  const match = line.match(LABEL_LINE);
  if (!match) return null;
  const speaker = match[1].trim();
  if (speaker.split(/\s+/).length > MAX_LABEL_WORDS) return null;
  return { speaker, text: match[2] };
}

/**
 * Returns the blocks, or null when no line carries a speaker label (the
 * caller then renders the raw text).
 */
export function parseSpeakerBlocks(raw: string): SpeakerBlock[] | null {
  const blocks: SpeakerBlock[] = [];
  let labelled = false;

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseLabel(line);
    if (parsed) {
      labelled = true;
      blocks.push({ speaker: parsed.speaker, text: parsed.text });
      continue;
    }
    const current = blocks[blocks.length - 1];
    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
    } else if (line.trim()) {
      blocks.push({ speaker: null, text: line });
    }
  }

  if (!labelled) return null;
  return blocks.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text.length > 0);
}
