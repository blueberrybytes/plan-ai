import { useSyncExternalStore } from "react";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { Note, NoteScope, NoteVisibility } from "./planAiApi";
import { reportUnexpected } from "../utils/reportError";

/**
 * Notes on this phone. Every note the app knows is one JSON file:
 *
 *   Documents/private/notes/<noteId>.json
 *
 * Documents/private is kept out of iCloud and Google backups
 * (plugins/with-no-backup-folders.js), like the auth cache.
 *
 * A file is both the outbox and the offline cache:
 * - draft: a new note that is still empty. Never uploaded. Deleted when the
 *   editor closes with nothing in it.
 * - pending: local changes the server does not have yet.
 * - conflict: a "(conflicted copy)" made when the server had a newer version.
 *   Uploaded as a new note, like pending.
 * - synced: same as the server. These are the cache that lets the list open
 *   offline. Only the newest MAX_CACHED are kept.
 *
 * The editor writes here (debounced) and notesSync.ts uploads. The id is made
 * on the phone, so a create sent twice gives one note on the server.
 */

export type NoteSyncStatus = "draft" | "pending" | "synced" | "conflict";

export interface LocalNote {
  schema: 1;
  id: string;
  /** Firebase uid of the account that wrote or cached it. Other accounts never see it. */
  accountUid: string;
  /** Null when the note was written before the workspace was known. Set at upload. */
  workspaceId: string | null;
  title: string;
  /** Markdown. */
  body: string;
  pinned: boolean;
  visibility: NoteVisibility;
  projectId: string | null;
  status: NoteSyncStatus;
  /** Server version the local text is based on. Null until the server has the note. */
  baseVersion: number | null;
  /** Last copy the server sent. Null for a note never uploaded. */
  server: Note | null;
  /** Last change, local or from the server, in ms. Sorts the list. */
  updatedAt: number;
  /** Goes up on every local edit, so an upload can tell it raced an edit. */
  localRev: number;
  /** Goes up when the server replaced the text, so an open editor reloads it. */
  remoteRev: number;
  /** Moved to the trash on the phone; the DELETE has not reached the server yet. */
  pendingTrash?: boolean;
  /** Id of the note this conflicted copy was made from. */
  conflictOf?: string;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
  /** A refusal that retrying will not fix. Waits for the user. */
  permanentError?: boolean;
}

const MAX_CACHED = 200;
const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE = 200;

const notesDir = () => new Directory(Paths.document, "private", "notes");
const noteFile = (id: string) => new File(notesDir(), `${id}.json`);
const noteTmpFile = (id: string) => new File(notesDir(), `${id}.json.tmp`);

// Everything on disk, loaded once. Writes go to both.
let byId: Map<string, LocalNote> | null = null;
const listeners = new Set<() => void>();
let changeCount = 0;

const notify = () => {
  changeCount++;
  listeners.forEach((l) => l());
};

function parse(text: string): LocalNote | null {
  try {
    const n = JSON.parse(text) as LocalNote;
    return n && typeof n.id === "string" && typeof n.accountUid === "string" ? n : null;
  } catch {
    return null;
  }
}

function load(): Map<string, LocalNote> {
  if (byId) return byId;
  const map = new Map<string, LocalNote>();
  try {
    const dir = notesDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    let unreadable = 0;
    let firstError: unknown = null;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const tmp = entry.name.endsWith(".json.tmp");
      if (!tmp && !entry.name.endsWith(".json")) continue;
      try {
        const n = parse(entry.textSync());
        // A .tmp only counts when the real file is missing (a crash mid-write).
        if (n && (!tmp || !map.has(n.id))) map.set(n.id, n);
        // A broken .json may hold text that never reached the server.
        else if (!n && !tmp) unreadable++;
      } catch (err) {
        // unreadable file: skip it, never block the app
        unreadable++;
        firstError ??= err;
      }
    }
    // The files stay on disk. Counts only: the names are note ids, the
    // content is the user's text.
    if (unreadable > 0) {
      reportUnexpected(
        firstError ?? new Error("Unreadable note files"),
        "notes",
        { op: "load", unreadable, loaded: map.size },
      );
    }
  } catch (err) {
    console.warn("[notes] could not read the notes folder", err);
    reportUnexpected(err, "notes", { op: "load_folder" });
  }
  byId = map;
  return map;
}

// Notes whose last write to disk failed. Their text is only in memory, so
// the editor warns the user until a write works again.
const unsaved = new Set<string>();

/** Writes through a temp file so a kill never leaves half a JSON. */
function persist(n: LocalNote): void {
  load().set(n.id, n);
  try {
    const dir = notesDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const tmp = noteTmpFile(n.id);
    tmp.write(JSON.stringify(n));
    const target = noteFile(n.id);
    if (target.exists) target.delete();
    tmp.move(target);
    unsaved.delete(n.id);
  } catch (err) {
    console.warn("[notes] could not save a note", err);
    // Once per note until a write works again, so typing does not flood Sentry.
    if (!unsaved.has(n.id)) {
      reportUnexpected(err, "notes", { op: "persist", noteId: n.id, status: n.status });
    }
    unsaved.add(n.id);
  }
}

function unlink(id: string): void {
  load().delete(id);
  unsaved.delete(id);
  for (const f of [noteFile(id), noteTmpFile(id)]) {
    try {
      if (f.exists) f.delete();
    } catch (err) {
      // The note comes back on the next start. Worth knowing, not blocking.
      reportUnexpected(err, "notes", { op: "unlink", noteId: id }, "warning");
    }
  }
}

export const newNoteId = (): string => Crypto.randomUUID();

const cleanTitle = (t: string | null | undefined) => (t ?? "").trim();

/** Same text and settings as the server copy. */
export function sameAsServer(
  n: Pick<LocalNote, "title" | "body" | "pinned" | "visibility" | "projectId">,
  s: Note,
): boolean {
  return (
    cleanTitle(n.title) === cleanTitle(s.title) &&
    n.body === s.body &&
    n.pinned === s.pinned &&
    n.visibility === s.visibility &&
    (n.projectId ?? null) === (s.projectId ?? null)
  );
}

export const sameText = (
  a: { title: string | null; body: string },
  b: { title: string | null; body: string },
) => cleanTitle(a.title) === cleanTitle(b.title) && a.body === b.body;

const isEmpty = (n: Pick<LocalNote, "title" | "body">) =>
  cleanTitle(n.title) === "" && n.body.trim() === "";

/** A server note as a local record (not saved). */
export function fromServer(note: Note, accountUid: string, prev?: LocalNote): LocalNote {
  return {
    schema: 1,
    id: note.id,
    accountUid,
    workspaceId: note.workspaceId,
    title: note.title ?? "",
    body: note.body,
    pinned: note.pinned,
    visibility: note.visibility,
    projectId: note.projectId,
    status: "synced",
    baseVersion: note.version,
    server: note,
    updatedAt: Date.parse(note.updatedAt) || Date.now(),
    localRev: prev?.localRev ?? 0,
    remoteRev: (prev?.remoteRev ?? 0) + (prev && !sameText(prev, note) ? 1 : 0),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export function getLocalNote(id: string): LocalNote | null {
  return load().get(id) ?? null;
}

/** Notes with something to send (edits, conflicted copies or a trash). */
export function notesToUpload(uid: string): LocalNote[] {
  return [...load().values()].filter(
    (n) =>
      n.accountUid === uid &&
      (n.pendingTrash || n.status === "pending" || n.status === "conflict"),
  );
}

export const isMineNote = (n: LocalNote) => (n.server ? n.server.isMine : true);
export const isUnsynced = (n: LocalNote) => n.status !== "synced" || !!n.pendingTrash;

/** Local version of the backend's list scopes, for the offline list. */
export function matchesScope(n: LocalNote, scope: NoteScope): boolean {
  switch (scope) {
    case "inbox":
      return (
        isMineNote(n) &&
        !n.projectId &&
        !n.server?.transcriptId &&
        !n.server?.periodType &&
        !n.pinned
      );
    case "pinned":
      return n.pinned;
    case "mine":
      return isMineNote(n);
    case "shared":
      return n.visibility === "WORKSPACE";
    case "trash":
      return false;
    default:
      return true;
  }
}

export function matchesQuery(n: LocalNote, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle);
}

/** Pinned first, then newest, like the server. */
export const byListOrder = (a: LocalNote, b: LocalNote) =>
  Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;

const shortDate = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

/** Title to show: the title, else the first line of the body. */
export function noteDisplayTitle(n: LocalNote): string {
  const title = cleanTitle(n.title);
  if (title) return title;
  if (n.server?.periodType && n.server.periodStart) {
    const label = n.server.periodType === "WEEK" ? "Week of" : "Daily note,";
    return `${label} ${shortDate(n.server.periodStart)}`;
  }
  const firstLine = n.body
    .split("\n")
    .map((l) => l.replace(/^\s*(#+|[-*>]|\d+\.)\s*/, "").trim())
    .find((l) => l.length > 0);
  return firstLine || "Untitled note";
}

/** Today's date on the phone, YYYY-MM-DD. */
export function localDateKey(d = new Date()): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Local edits (the editor) ─────────────────────────────────────────────────

/** A new empty note, saved at once so opening the editor never waits. */
export function createDraftNote(init: {
  id: string;
  accountUid: string;
  workspaceId: string | null;
}): LocalNote {
  const existing = getLocalNote(init.id);
  if (existing) return existing;
  const n: LocalNote = {
    schema: 1,
    id: init.id,
    accountUid: init.accountUid,
    workspaceId: init.workspaceId,
    title: "",
    body: "",
    pinned: false,
    visibility: "PRIVATE",
    projectId: null,
    status: "draft",
    baseVersion: null,
    server: null,
    updatedAt: Date.now(),
    localRev: 0,
    remoteRev: 0,
  };
  persist(n);
  notify();
  return n;
}

export type NoteEdit = Partial<
  Pick<LocalNote, "title" | "body" | "pinned" | "visibility" | "projectId">
>;

/**
 * Applies an edit and queues it. An empty note the server never saw stays a
 * draft, so opening "new note" and leaving uploads nothing.
 */
export function saveLocalEdit(id: string, edit: NoteEdit): LocalNote | null {
  const prev = getLocalNote(id);
  if (!prev) return null;
  const next: LocalNote = {
    ...prev,
    ...edit,
    title: edit.title !== undefined ? edit.title.slice(0, MAX_TITLE) : prev.title,
    updatedAt: Date.now(),
    localRev: prev.localRev + 1,
    // A new edit is worth a try now, and may fix what the server refused.
    attempts: 0,
    nextAttemptAt: undefined,
    permanentError: false,
    lastError: undefined,
  };
  if (prev.baseVersion === null && isEmpty(next) && prev.status !== "conflict") {
    next.status = "draft";
  } else if (next.server && next.baseVersion === next.server.version && sameAsServer(next, next.server)) {
    next.status = "synced";
  } else if (prev.status !== "conflict") {
    next.status = "pending";
  }
  persist(next);
  notify();
  return next;
}

/** Drops a draft that is still empty (the editor closed with nothing in it). */
export function discardIfEmptyDraft(id: string): void {
  const n = getLocalNote(id);
  if (n && n.status === "draft" && n.baseVersion === null && isEmpty(n)) {
    unlink(id);
    notify();
  }
}

// Last note moved to the trash from the editor, for the list's Undo.
let lastTrashed: { id: string; at: number } | null = null;

/** Moves a note to the trash on the phone. The sync sends the DELETE. */
export function trashLocalNote(id: string): void {
  const n = getLocalNote(id);
  if (!n) return;
  if (n.baseVersion === null) {
    // The server never had it.
    unlink(id);
  } else {
    persist({
      ...n,
      pendingTrash: true,
      attempts: 0,
      nextAttemptAt: undefined,
      permanentError: false,
      lastError: undefined,
    });
  }
  lastTrashed = n.baseVersion === null ? null : { id, at: Date.now() };
  notify();
}

/** The note trashed in the last minute, once. */
export function takeLastTrashed(): string | null {
  const t = lastTrashed;
  lastTrashed = null;
  return t && Date.now() - t.at < 60_000 ? t.id : null;
}

/** Cancels a trash the server has not received yet. False when it already has. */
export function cancelLocalTrash(id: string): boolean {
  const n = getLocalNote(id);
  if (!n?.pendingTrash) return false;
  persist({ ...n, pendingTrash: false });
  notify();
  return true;
}

/** Clears a refusal so the next sync tries again. */
export function resetNoteError(id: string): void {
  const n = getLocalNote(id);
  if (!n) return;
  persist({ ...n, permanentError: false, attempts: 0, nextAttemptAt: undefined, lastError: undefined });
  notify();
}

// ── Sync side (notesSync.ts) ────────────────────────────────────────────────

export function patchLocalNote(id: string, patch: Partial<LocalNote>): LocalNote | null {
  const prev = getLocalNote(id);
  if (!prev) return null;
  const next = { ...prev, ...patch };
  persist(next);
  notify();
  return next;
}

export function removeLocalNote(id: string): void {
  unlink(id);
  notify();
}

// Old id to new id, when a note became a copy (the server lost the original).
const replacedBy = new Map<string, string>();
export const replacementOf = (id: string) => replacedBy.get(id) ?? null;

/**
 * Keeps local text the server will not take as it is, as a new note titled
 * "(conflicted copy)". Uploaded like any other pending note.
 */
export function saveConflictedCopy(
  from: LocalNote,
  text: { title: string; body: string } = from,
): LocalNote {
  const base = cleanTitle(text.title) || noteDisplayTitle({ ...from, ...text });
  const suffix = " (conflicted copy)";
  const copy: LocalNote = {
    schema: 1,
    id: newNoteId(),
    accountUid: from.accountUid,
    workspaceId: from.workspaceId,
    title: base.slice(0, MAX_TITLE - suffix.length) + suffix,
    body: text.body,
    pinned: false,
    visibility: "PRIVATE",
    projectId: from.projectId,
    status: "conflict",
    baseVersion: null,
    server: null,
    updatedAt: Date.now(),
    localRev: 1,
    remoteRev: 0,
    conflictOf: from.id,
  };
  persist(copy);
  notify();
  return copy;
}

/** A conflicted copy of this note was made in the last minute. */
export function hasRecentCopyOf(id: string): boolean {
  const since = Date.now() - 60_000;
  for (const n of load().values()) {
    if (n.conflictOf === id && n.updatedAt >= since) return true;
  }
  return false;
}

/** The original is gone from the server: its text lives on as a copy. */
export function replaceWithCopy(id: string): LocalNote | null {
  const n = getLocalNote(id);
  if (!n) return null;
  const copy = saveConflictedCopy(n);
  replacedBy.set(id, copy.id);
  unlink(id);
  notify();
  return copy;
}

/**
 * Saves notes the server sent into the cache. A note with local changes keeps
 * them. With `complete` (a full "all" list of a workspace) the cached notes it
 * no longer has are dropped: they were deleted or unshared elsewhere.
 */
export function cacheServerNotes(
  uid: string,
  notes: Note[],
  opts: { workspaceId?: string; complete?: boolean } = {},
): void {
  const map = load();
  let changed = false;
  for (const note of notes) {
    const prev = map.get(note.id);
    // Unsent edits of another account on this phone are never touched.
    if (prev && prev.accountUid !== uid && isUnsynced(prev)) continue;
    // A local edit wins. If the server moved on, the upload gets a 409 and
    // the conflict is handled there.
    if (prev && isUnsynced(prev)) continue;
    const own = prev?.accountUid === uid ? prev : undefined;
    if (own?.server && own.server.version === note.version && own.server.updatedAt === note.updatedAt) {
      continue;
    }
    persist(fromServer(note, uid, own));
    changed = true;
  }
  if (opts.complete && opts.workspaceId) {
    const seen = new Set(notes.map((n) => n.id));
    for (const n of [...map.values()]) {
      if (
        n.accountUid === uid &&
        n.workspaceId === opts.workspaceId &&
        n.status === "synced" &&
        !n.pendingTrash &&
        !seen.has(n.id)
      ) {
        unlink(n.id);
        changed = true;
      }
    }
  }
  if (prune(uid)) changed = true;
  if (changed) notify();
}

/** One note the server sent, e.g. on opening it. Local changes win. */
export function cacheServerNote(uid: string, note: Note): LocalNote {
  const prev = getLocalNote(note.id);
  if (prev && prev.accountUid !== uid && isUnsynced(prev)) return fromServer(note, uid);
  if (prev && isUnsynced(prev)) return prev;
  if (
    prev &&
    prev.accountUid === uid &&
    prev.server?.version === note.version &&
    prev.server.updatedAt === note.updatedAt
  ) {
    return prev;
  }
  const next = fromServer(note, uid, prev?.accountUid === uid ? prev : undefined);
  persist(next);
  notify();
  return next;
}

/**
 * Keeps the newest MAX_CACHED synced notes of the account and drops empty
 * drafts left by a killed app. Notes waiting to upload are never dropped.
 */
function prune(uid: string): boolean {
  const now = Date.now();
  let changed = false;
  const mine = [...load().values()].filter((n) => n.accountUid === uid);
  for (const n of mine) {
    if (n.status === "draft" && isEmpty(n) && now - n.updatedAt > STALE_DRAFT_MS) {
      unlink(n.id);
      changed = true;
    }
  }
  const synced = mine
    .filter((n) => n.status === "synced" && !n.pendingTrash && load().has(n.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const n of synced.slice(MAX_CACHED)) {
    unlink(n.id);
    changed = true;
  }
  return changed;
}

// ── React ────────────────────────────────────────────────────────────────────
// Reads during render go through useSyncExternalStore. The React Compiler
// would otherwise keep the result of a plain call like getLocalNote(id) for
// as long as `id` does not change, and miss every edit and sync.

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Calls `listener` after every local edit or sync. Returns the unsubscribe. */
export const subscribeLocalNotes = (listener: () => void): (() => void) => subscribe(listener);

/** One note, updated on every local edit or sync. */
export function useLocalNote(id: string): LocalNote | null {
  return useSyncExternalStore(subscribe, () => load().get(id) ?? null);
}

/** True while the last write of this note to the phone failed. */
export function useNoteSaveFailed(id: string): boolean {
  return useSyncExternalStore(subscribe, () => unsaved.has(id));
}

let listSnapshot: { count: number; uid: string | null; notes: LocalNote[] } | null = null;
const EMPTY: LocalNote[] = [];

/** Every note of this account on the phone, trashed ones included. */
export function useAccountNotes(uid: string | null | undefined): LocalNote[] {
  return useSyncExternalStore(subscribe, () => {
    if (!uid) return EMPTY;
    if (!listSnapshot || listSnapshot.count !== changeCount || listSnapshot.uid !== uid) {
      listSnapshot = {
        count: changeCount,
        uid,
        notes: [...load().values()].filter((n) => n.accountUid === uid),
      };
    }
    return listSnapshot.notes;
  });
}
