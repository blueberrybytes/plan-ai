/**
 * Search queries for a long text, such as a meeting transcript.
 *
 * A meeting opens with greetings and small talk, so its first characters say
 * little about what was discussed. These helpers take windows spread over the
 * whole text and merge what each one finds, so the knowledge base is searched
 * for the middle and the end of the meeting too.
 */

const DEFAULT_WINDOWS = 5;
const DEFAULT_WINDOW_CHARS = 600;

/** Moves a cut point to the nearest whitespace after it, so no word is split. */
function nextBreak(text: string, from: number): number {
  const at = text.slice(from, from + 80).search(/\s/);
  return at === -1 ? from : from + at + 1;
}

/**
 * Up to `count` windows of about `size` characters, evenly spread from the
 * start to the end of the text. A short text gives one query: the text itself.
 */
export function spreadQueries(
  text: string,
  count = DEFAULT_WINDOWS,
  size = DEFAULT_WINDOW_CHARS,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size * 2 || count <= 1) return [clean.slice(0, size * 2)];

  const windows = Math.min(count, Math.ceil(clean.length / size));
  const lastStart = clean.length - size;
  const queries: string[] = [];
  for (let i = 0; i < windows; i++) {
    const rawStart = Math.round((lastStart * i) / (windows - 1));
    // The last window may come out a few characters short. Better than a split word.
    const start = i === 0 ? 0 : nextBreak(clean, rawStart);
    const query = clean.slice(start, start + size).trim();
    if (query) queries.push(query);
  }
  return queries;
}

/**
 * Merges the results of several searches into one list of at most `limit`
 * items without repeats. It takes one item from each list in turn, so every
 * part of the text keeps its best matches.
 */
export function interleaveUnique(lists: string[][], limit: number): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let rank = 0; rank < longest && merged.length < limit; rank++) {
    for (const list of lists) {
      const item = list[rank];
      if (item === undefined || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
      if (merged.length >= limit) break;
    }
  }
  return merged;
}
