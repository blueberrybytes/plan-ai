import type { SearchHit, SearchHitType } from "../../store/apis/searchApi";

/**
 * The parts of the command palette that need no React: where a hit goes, how
 * hits are grouped, the commands shown before typing, and the arrow keys.
 */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;

/** The order of the groups on screen. */
export const HIT_TYPE_ORDER: readonly SearchHitType[] = ["meeting", "task", "document", "project"];

/**
 * The page of a hit.
 *
 * A meeting inside a project opens in the project's meeting page, any other
 * in the recordings page. Neither page takes a time in its address, so a hit
 * found at a moment of the recording opens the meeting from the start.
 * A task has no page of its own: it opens on its project's board.
 */
export const hitRoute = (hit: Pick<SearchHit, "type" | "id" | "projectId">): string => {
  switch (hit.type) {
    case "meeting":
      return hit.projectId
        ? `/projects/${hit.projectId}/info/transcripts/${hit.id}`
        : `/recordings/${hit.id}`;
    case "task":
      return hit.projectId
        ? `/projects/${hit.projectId}?tab=board&task=${encodeURIComponent(hit.id)}`
        : "/projects";
    case "document":
      return `/docs/view/${hit.id}`;
    case "project":
      return `/projects/${hit.id}`;
  }
};

export interface HitGroup {
  type: SearchHitType;
  hits: SearchHit[];
}

/** Hits by type, in a fixed order. Inside a group the server's ranking is kept. */
export const groupHits = (hits: readonly SearchHit[]): HitGroup[] =>
  HIT_TYPE_ORDER.map((type) => ({ type, hits: hits.filter((hit) => hit.type === type) })).filter(
    (group) => group.hits.length > 0,
  );

/** The hits in the order they are drawn, which is the order the arrows follow. */
export const flattenGroups = (groups: readonly HitGroup[]): SearchHit[] =>
  groups.flatMap((group) => group.hits);

export interface NavCommand {
  labelKey: string;
  path: string;
}

interface NavEntry extends NavCommand {
  /** Pages grouped under this sidebar entry. */
  section?: NavCommand[];
}

/**
 * The "go to" commands, built from the entries the sidebar shows. An entry
 * that groups several pages gives one command per page.
 */
export const buildNavCommands = (
  entries: readonly NavEntry[],
  extra: readonly NavCommand[] = [],
): NavCommand[] => {
  const commands = [
    ...entries.flatMap((entry) =>
      entry.section?.length ? entry.section : [{ labelKey: entry.labelKey, path: entry.path }],
    ),
    ...extra,
  ].map(({ labelKey, path }) => ({ labelKey, path }));
  const seen = new Set<string>();
  return commands.filter((command) =>
    seen.has(command.path) ? false : (seen.add(command.path), true),
  );
};

export type PaletteKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** The selected row after a key. The list wraps around at both ends. */
export const moveSelection = (current: number, count: number, key: PaletteKey): number => {
  if (count <= 0) return 0;
  switch (key) {
    case "ArrowDown":
      return current >= count - 1 ? 0 : current + 1;
    case "ArrowUp":
      return current <= 0 ? count - 1 : current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
  }
};

/** What the palette shows for the text typed so far. */
export type PaletteMode = "commands" | "tooShort" | "search";

export const paletteMode = (query: string): PaletteMode => {
  const length = query.trim().length;
  if (length === 0) return "commands";
  return length < SEARCH_MIN_CHARS ? "tooShort" : "search";
};

/** 95 becomes "1:35", 3725 becomes "1:02:05". */
export const formatHitTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
