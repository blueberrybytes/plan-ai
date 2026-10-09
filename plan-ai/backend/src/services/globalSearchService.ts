import type { Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";

/**
 * One search box for the web: meetings, tasks, documents and projects of the
 * caller's workspace.
 *
 * Matching is the same idea as the MCP tools `search_meetings` and
 * `search_tasks` (case-insensitive `contains`), with one difference: the query
 * is split into words and every word must appear somewhere in the row.
 *
 * Cost: a transcript can be megabytes. The first round of queries never
 * selects the transcript text, the utterances or a document's content. Those
 * are read afterwards, only for the hits that made the final list and still
 * need a snippet.
 *
 * Every query here starts at a model the default Prisma client filters
 * (restricted projects), and every one carries the workspace id.
 */

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_MAX_QUERY_LENGTH = 200;
export const SEARCH_MAX_WORDS = 8;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const SNIPPET_LENGTH = 160;
/** Utterances carry word timings and are the heaviest column. Read for few rows. */
export const MAX_UTTERANCE_LOOKUPS = 8;

export type SearchHitType = "meeting" | "task" | "document" | "project";

export interface SearchHit {
  type: SearchHitType;
  id: string;
  /** Empty for a meeting nobody named: the app shows its own "untitled" text. */
  title: string;
  /** About 160 characters around the first match. Null when there is no text to show. */
  snippet: string | null;
  /** True when every word of the query is in the title. These come first. */
  titleMatch: boolean;
  projectId: string | null;
  projectTitle: string | null;
  /** ISO date. For a meeting, when it was recorded. */
  date: string;
  /** Meetings only: where the matching sentence starts, in seconds. */
  atSeconds?: number;
}

export interface GlobalSearchResult {
  query: string;
  hits: SearchHit[];
}

export class SearchQueryError extends Error {
  readonly status = 400;
}

/** The query as lowercase words, without repeats. Throws when it is too short. */
export function parseSearchQuery(raw: string): string[] {
  const text = (raw ?? "").slice(0, SEARCH_MAX_QUERY_LENGTH).trim();
  if (text.length < SEARCH_MIN_QUERY_LENGTH) {
    throw new SearchQueryError(`Type at least ${SEARCH_MIN_QUERY_LENGTH} characters to search.`);
  }
  const words = Array.from(new Set(text.toLowerCase().split(/\s+/).filter(Boolean)));
  return words.slice(0, SEARCH_MAX_WORDS);
}

export function clampSearchLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return SEARCH_DEFAULT_LIMIT;
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

type FieldCondition = Record<string, { contains: string; mode: "insensitive" }>;

/** Every word must be in at least one of the fields. */
export function wordsCondition(words: string[], fields: string[]): { OR: FieldCondition[] }[] {
  return words.map((word) => ({
    OR: fields.map((field) => ({ [field]: { contains: word, mode: "insensitive" as const } })),
  }));
}

export function hasAllWords(text: string | null | undefined, words: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return words.every((word) => lower.includes(word));
}

function firstMatchIndex(lower: string, words: string[]): number {
  let first = -1;
  for (const word of words) {
    const at = lower.indexOf(word);
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  return first;
}

/**
 * A piece of `text` around the first word that matches, cut at word limits
 * when it can. Null when no word is in the text.
 */
export function cutSnippet(
  text: string | null | undefined,
  words: string[],
  length = SNIPPET_LENGTH,
): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const at = firstMatchIndex(flat.toLowerCase(), words);
  if (at === -1) return null;
  if (flat.length <= length) return flat;

  // A third of the room before the match, the rest after it.
  let start = Math.max(0, at - Math.floor(length / 3));
  let end = Math.min(flat.length, start + length);
  start = Math.max(0, end - length);
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return `${start > 0 ? "..." : ""}${flat.slice(start, end)}${end < flat.length ? "..." : ""}`;
}

/** The start of the text, for a hit whose match is in the title only. */
export function leadSnippet(
  text: string | null | undefined,
  length = SNIPPET_LENGTH,
): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= length) return flat;
  const space = flat.lastIndexOf(" ", length);
  return `${flat.slice(0, space > 0 ? space : length)}...`;
}

/**
 * The first sentence that says the words: one with all of them when there is
 * one, otherwise the first with any. Null when the utterances have no times.
 */
export function findUtteranceMatch(
  utterances: unknown,
  words: string[],
): { atSeconds: number; text: string } | null {
  if (!Array.isArray(utterances)) return null;
  let partial: { atSeconds: number; text: string } | null = null;
  for (const item of utterances) {
    if (!item || typeof item !== "object") continue;
    const { transcript, start } = item as { transcript?: unknown; start?: unknown };
    if (typeof transcript !== "string" || typeof start !== "number" || !Number.isFinite(start)) {
      continue;
    }
    const lower = transcript.toLowerCase();
    if (words.every((word) => lower.includes(word))) {
      return { atSeconds: Math.max(0, start), text: transcript };
    }
    if (!partial && words.some((word) => lower.includes(word))) {
      partial = { atSeconds: Math.max(0, start), text: transcript };
    }
  }
  return partial;
}

/** Title matches first, then the rest. Newest first inside each group. */
export function rankHits(hits: SearchHit[], limit: number): SearchHit[] {
  return [...hits]
    .sort((a, b) => {
      if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
      return b.date.localeCompare(a.date);
    })
    .slice(0, limit);
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

const projectSelect = { select: { id: true, title: true } } as const;

/**
 * Two light queries per kind of item: rows whose title has every word, and
 * rows that match anywhere. Both are needed because the second one alone,
 * cut at `take`, could leave out an older row with the words in its title.
 */
async function findMeetings(workspaceId: string, words: string[], take: number) {
  const select = {
    id: true,
    title: true,
    summary: true,
    recordedAt: true,
    createdAt: true,
    project: projectSelect,
  } satisfies Prisma.TranscriptSelect;
  const orderBy = { createdAt: "desc" } as const;
  const [byTitle, anywhere] = await Promise.all([
    prisma.transcript.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title"]) },
      select,
      orderBy,
      take,
    }),
    prisma.transcript.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title", "summary", "transcript"]) },
      select,
      orderBy,
      take,
    }),
  ]);
  return dedupeById([...byTitle, ...anywhere]);
}

async function findTasks(workspaceId: string, words: string[], take: number) {
  const select = {
    id: true,
    title: true,
    description: true,
    createdAt: true,
    project: projectSelect,
  } satisfies Prisma.TaskSelect;
  const orderBy = { createdAt: "desc" } as const;
  // Tasks have no workspace id of their own. They belong to a project.
  const [byTitle, anywhere] = await Promise.all([
    prisma.task.findMany({
      where: { project: { workspaceId }, AND: wordsCondition(words, ["title"]) },
      select,
      orderBy,
      take,
    }),
    prisma.task.findMany({
      where: { project: { workspaceId }, AND: wordsCondition(words, ["title", "description"]) },
      select,
      orderBy,
      take,
    }),
  ]);
  return dedupeById([...byTitle, ...anywhere]);
}

async function findDocuments(workspaceId: string, words: string[], take: number) {
  const select = {
    id: true,
    title: true,
    createdAt: true,
    project: projectSelect,
  } satisfies Prisma.DocDocumentSelect;
  const orderBy = { createdAt: "desc" } as const;
  const [byTitle, anywhere] = await Promise.all([
    prisma.docDocument.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title"]) },
      select,
      orderBy,
      take,
    }),
    prisma.docDocument.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title", "content"]) },
      select,
      orderBy,
      take,
    }),
  ]);
  return dedupeById([...byTitle, ...anywhere]);
}

async function findProjects(workspaceId: string, words: string[], take: number) {
  const select = {
    id: true,
    title: true,
    description: true,
    createdAt: true,
  } satisfies Prisma.ProjectSelect;
  const orderBy = { createdAt: "desc" } as const;
  const [byTitle, anywhere] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title"]) },
      select,
      orderBy,
      take,
    }),
    prisma.project.findMany({
      where: { workspaceId, AND: wordsCondition(words, ["title", "description"]) },
      select,
      orderBy,
      take,
    }),
  ]);
  return dedupeById([...byTitle, ...anywhere]);
}

/** Markdown and HTML marks make a poor snippet. This is display only. */
function plainText(content: string): string {
  return content.replace(/<[^>]+>/g, " ").replace(/[#*_`>|]+/g, " ");
}

/**
 * Fills the snippet of the meeting hits whose words are in the transcript
 * text, and the time of the matching sentence for the first few.
 */
async function addMeetingText(workspaceId: string, hits: SearchHit[], words: string[]) {
  const pending = hits.filter((hit) => hit.type === "meeting" && hit.snippet === null);
  if (pending.length === 0) return;
  const withTimes = pending.slice(0, MAX_UTTERANCE_LOOKUPS).map((hit) => hit.id);
  const textOnly = pending.slice(MAX_UTTERANCE_LOOKUPS).map((hit) => hit.id);

  const [timed, plain] = await Promise.all([
    prisma.transcript.findMany({
      where: { workspaceId, id: { in: withTimes } },
      select: { id: true, transcript: true, utterances: true },
    }),
    textOnly.length > 0
      ? prisma.transcript.findMany({
          where: { workspaceId, id: { in: textOnly } },
          select: { id: true, transcript: true },
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map(pending.map((hit) => [hit.id, hit]));
  for (const row of timed) {
    const hit = byId.get(row.id);
    if (!hit) continue;
    const spoken = findUtteranceMatch(row.utterances, words);
    if (spoken) hit.atSeconds = Math.floor(spoken.atSeconds);
    hit.snippet =
      (spoken ? cutSnippet(spoken.text, words) : null) ?? cutSnippet(row.transcript, words);
  }
  for (const row of plain) {
    const hit = byId.get(row.id);
    if (hit) hit.snippet = cutSnippet(row.transcript, words);
  }
}

async function addDocumentText(workspaceId: string, hits: SearchHit[], words: string[]) {
  const pending = hits.filter((hit) => hit.type === "document");
  if (pending.length === 0) return;
  const rows = await prisma.docDocument.findMany({
    where: { workspaceId, id: { in: pending.map((hit) => hit.id) } },
    select: { id: true, content: true },
  });
  const byId = new Map(pending.map((hit) => [hit.id, hit]));
  for (const row of rows) {
    const hit = byId.get(row.id);
    if (!hit) continue;
    const text = plainText(row.content);
    hit.snippet = cutSnippet(text, words) ?? leadSnippet(text);
  }
}

export async function searchWorkspace(
  workspaceId: string,
  rawQuery: string,
  rawLimit?: number,
): Promise<GlobalSearchResult> {
  const words = parseSearchQuery(rawQuery);
  const limit = clampSearchLimit(rawLimit);

  const [meetings, tasks, documents, projects] = await Promise.all([
    findMeetings(workspaceId, words, limit),
    findTasks(workspaceId, words, limit),
    findDocuments(workspaceId, words, limit),
    findProjects(workspaceId, words, limit),
  ]);

  const candidates: SearchHit[] = [
    ...meetings.map<SearchHit>((row) => ({
      type: "meeting",
      id: row.id,
      title: row.title ?? "",
      // Left empty when the words are only in the transcript text: filled later.
      snippet:
        cutSnippet(row.summary, words) ??
        (hasAllWords(row.title, words) ? leadSnippet(row.summary) : null),
      titleMatch: hasAllWords(row.title, words),
      projectId: row.project?.id ?? null,
      projectTitle: row.project?.title ?? null,
      date: (row.recordedAt ?? row.createdAt).toISOString(),
    })),
    ...tasks.map<SearchHit>((row) => ({
      type: "task",
      id: row.id,
      title: row.title,
      snippet: cutSnippet(row.description, words) ?? leadSnippet(row.description),
      titleMatch: hasAllWords(row.title, words),
      projectId: row.project?.id ?? null,
      projectTitle: row.project?.title ?? null,
      date: row.createdAt.toISOString(),
    })),
    ...documents.map<SearchHit>((row) => ({
      type: "document",
      id: row.id,
      title: row.title,
      snippet: null,
      titleMatch: hasAllWords(row.title, words),
      projectId: row.project?.id ?? null,
      projectTitle: row.project?.title ?? null,
      date: row.createdAt.toISOString(),
    })),
    ...projects.map<SearchHit>((row) => ({
      type: "project",
      id: row.id,
      title: row.title,
      snippet: cutSnippet(row.description, words) ?? leadSnippet(row.description),
      titleMatch: hasAllWords(row.title, words),
      projectId: row.id,
      projectTitle: row.title,
      date: row.createdAt.toISOString(),
    })),
  ];

  const hits = rankHits(candidates, limit);
  await Promise.all([
    addMeetingText(workspaceId, hits, words),
    addDocumentText(workspaceId, hits, words),
  ]);

  return { query: words.join(" "), hits };
}
