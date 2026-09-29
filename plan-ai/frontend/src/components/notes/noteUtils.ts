import type { Note } from "../../store/apis/notesApi";

/** YYYY-MM-DD of the user's local calendar day (not UTC). */
export const localDateKey = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Parses YYYY-MM-DD as a local date, so formatting it never shifts the day. */
export const parseDateKey = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A note id made in the browser (the API accepts 16 to 64 of A-Z a-z 0-9 _ -).
 * Creating with our own id makes a retried create safe.
 */
export const newNoteId = (length = 24): string => {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
};

/** Plain text of the first line with content, markdown marks removed. */
export const firstLine = (markdown: string): string => {
  for (const raw of markdown.split("\n")) {
    const line = raw
      .replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (line) return line;
  }
  return "";
};

/** Short plain-text preview of the body for list rows. */
export const bodySnippet = (markdown: string, max = 120): string => {
  const text = markdown
    .split("\n")
    .map((line) => firstLine(line))
    .filter(Boolean)
    .join(" ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/** The title to show: the note's title, else its first line, else null. */
export const noteHeading = (note: Pick<Note, "title" | "body">): string | null => {
  const title = note.title?.trim();
  if (title) return title;
  const line = firstLine(note.body);
  return line ? line.slice(0, 80) : null;
};

/** Title of the copy made when a save hits a newer version on the server. */
export const conflictedCopyTitle = (title: string, suffix: string, maxLength = 200): string => {
  const ending = ` (${suffix})`;
  const base = title.trim().slice(0, Math.max(0, maxLength - ending.length));
  return `${base}${ending}`;
};

/** True when a key press comes from a field where the user types text. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    element.isContentEditable ||
    element.getAttribute?.("contenteditable") === "true"
  );
};

export interface NoteDraftLinks {
  projectId?: string | null;
  transcriptId?: string | null;
}

/**
 * A note that exists only in the browser until its first save. It has the
 * API's shape so the editor handles drafts and saved notes the same way.
 */
export const makeDraftNote = (id: string, links: NoteDraftLinks = {}): Note => {
  const now = new Date().toISOString();
  return {
    id,
    workspaceId: "",
    userId: "",
    isMine: true,
    title: null,
    body: "",
    visibility: "PRIVATE",
    pinned: false,
    projectId: links.projectId ?? null,
    transcriptId: links.transcriptId ?? null,
    periodType: null,
    periodStart: null,
    source: "WEB",
    version: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
};
