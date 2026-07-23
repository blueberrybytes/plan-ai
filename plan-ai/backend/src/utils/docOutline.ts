/**
 * Pulls a slide-sized outline out of generated markdown.
 *
 * The deck is a summary of the document, not a second generation: re-asking the
 * LLM for "the same proposal but as slides" costs another call, adds latency in
 * front of a waiting prospect, and lets the two artifacts contradict each other.
 */

/** Lines that are structure rather than prose. */
const isStructural = (line: string): boolean =>
  !line.trim() ||
  line.startsWith("#") ||
  line.startsWith(">") ||
  line.startsWith("```") ||
  line.startsWith("|") ||
  /^[-*+]\s/.test(line.trim()) ||
  /^\d+\.\s/.test(line.trim()) ||
  /^[-*_]{3,}$/.test(line.trim());

/** Strips inline markdown so text lands clean in a PowerPoint text box. */
const stripInline = (text: string): string =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .trim();

/**
 * First real paragraph of the document — the framing sentence a reader would
 * quote back. Returns "" when the document is all headings and lists.
 */
export const extractSummary = (markdown: string, maxChars = 600): string => {
  const paragraph: string[] = [];

  for (const line of markdown.split("\n")) {
    if (isStructural(line)) {
      // Only stop once we've actually collected something; leading headings and
      // blank lines are skipped rather than treated as the end of the paragraph.
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.trim());
  }

  return stripInline(paragraph.join(" ")).slice(0, maxChars);
};

/**
 * Top-level bullets, in document order. Nested items are skipped: a slide wants
 * headline scope, not the sub-clauses under it.
 */
export const extractBullets = (markdown: string, limit = 6): string[] => {
  const bullets: string[] = [];
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    if (rawLine.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Indented items are children of the bullet above — skip them.
    if (/^\s/.test(rawLine)) continue;

    const match = rawLine.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (!match) continue;

    const text = stripInline(match[1]);
    if (text) bullets.push(text);
    if (bullets.length >= limit) break;
  }

  return bullets;
};
