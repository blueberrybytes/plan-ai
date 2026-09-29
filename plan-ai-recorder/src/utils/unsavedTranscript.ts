/**
 * Crash-recovery record of an in-progress meeting.
 *
 * One record per recording session, created when the recording starts,
 * updated with the transcript as utterances finalize, and cleared only after
 * the backend confirms the save. The audio itself is copied to disk under the
 * same session id (see recoveryAudio.ts). If the app crashes, the window is
 * closed mid-flow, or the upload fails and the user bails, Home offers to
 * recover it on next launch.
 *
 * Records used to share one key, so starting a new recording overwrote a
 * meeting that was never recovered. Each session now has its own key. The old
 * single key is still read, so copies written by older versions are not lost.
 *
 * Records are encrypted by the main process (AES-256-GCM, key kept in the OS
 * keychain through safeStorage) before they reach localStorage. Plain-text
 * records from older versions are still read, and sealed on the next load.
 * If encryption is unavailable, records are stored in plain text as before.
 */

import type { CalendarEvent } from "./recorderConfig";
import type { components } from "../types/api";

export type RecordingBookmark = components["schemas"]["RecordingBookmark"];

const LEGACY_KEY = "planai_unsaved_transcript";
const KEY_PREFIX = "planai_unsaved_meeting:";
// Must match SEALED_TEXT_PREFIX in electron/main.ts.
const SEALED_PREFIX = "plan-enc:v1:";

export interface UnsavedTranscript {
  content: string;
  savedAt: number;
  /** Recording session id. Absent on copies written by older versions. */
  sessionId?: string;
  /** Epoch ms when capture started. */
  startedAt?: number;
  /** ASR language picked for the recording ("" = auto). */
  language?: string;
  /** Moments marked during the meeting (seconds on the saved audio). */
  bookmarks?: RecordingBookmark[];
  /** Calendar event of the meeting, when one was happening. */
  calendarEvent?: CalendarEvent;
}

export interface UnsavedSession {
  sessionId: string;
  startedAt: number;
  language?: string;
  bookmarks?: RecordingBookmark[];
  calendarEvent?: CalendarEvent;
}

/** Encrypted when the main process can, plain JSON otherwise. */
function seal(json: string): string {
  try {
    return window.electron?.localData?.seal(json) ?? json;
  } catch {
    return json;
  }
}

/** The JSON behind a stored value, or null when it cannot be decrypted. */
function unseal(raw: string): string | null {
  if (!raw.startsWith(SEALED_PREFIX)) return raw;
  try {
    return window.electron?.localData?.open(raw) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, record: UnsavedTranscript): void {
  try {
    localStorage.setItem(key, seal(JSON.stringify(record)));
  } catch {
    /* localStorage full/unavailable — non-fatal */
  }
}

function parse(stored: string | null): UnsavedTranscript | null {
  if (!stored) return null;
  const raw = unseal(stored);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UnsavedTranscript>;
    if (typeof parsed.content !== "string") return null;
    return {
      content: parsed.content,
      savedAt: parsed.savedAt ?? 0,
      sessionId:
        typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      startedAt:
        typeof parsed.startedAt === "number" ? parsed.startedAt : undefined,
      language:
        typeof parsed.language === "string" ? parsed.language : undefined,
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : undefined,
      calendarEvent:
        parsed.calendarEvent && typeof parsed.calendarEvent.title === "string"
          ? parsed.calendarEvent
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Registers a new recording so it is recoverable even before any text arrives. */
export function startUnsavedMeeting(session: UnsavedSession): void {
  write(`${KEY_PREFIX}${session.sessionId}`, {
    content: "",
    savedAt: Date.now(),
    ...session,
  });
}

export function persistUnsavedTranscript(
  content: string,
  session: UnsavedSession,
): void {
  if (!content.trim()) return;
  write(`${KEY_PREFIX}${session.sessionId}`, {
    content,
    savedAt: Date.now(),
    ...session,
  });
}

/** Updates a meeting's record in place, keeping its transcript text. */
export function updateUnsavedMeeting(
  sessionId: string,
  patch: Partial<Omit<UnsavedTranscript, "sessionId">>,
): void {
  const key = `${KEY_PREFIX}${sessionId}`;
  try {
    const current = parse(localStorage.getItem(key));
    if (!current) return;
    write(key, { ...current, ...patch, sessionId });
  } catch {
    /* localStorage unavailable */
  }
}

/** Every meeting that was never confirmed as saved, oldest first. */
export function loadUnsavedMeetings(): UnsavedTranscript[] {
  const found: UnsavedTranscript[] = [];
  // Plain-text records (older versions) are sealed once read. Done after the
  // scan: writing while iterating localStorage.key(i) could skip entries.
  const toSeal: Array<[string, UnsavedTranscript]> = [];
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    const legacy = parse(legacyRaw);
    if (legacy && legacy.content.trim()) {
      found.push(legacy);
      if (legacyRaw && !legacyRaw.startsWith(SEALED_PREFIX)) toSeal.push([LEGACY_KEY, legacy]);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      const record = parse(raw);
      if (record) {
        found.push({
          ...record,
          sessionId: record.sessionId ?? key.slice(KEY_PREFIX.length),
        });
        if (raw && !raw.startsWith(SEALED_PREFIX)) toSeal.push([key, record]);
      }
    }
    if (window.electron?.localData) {
      for (const [key, record] of toSeal) write(key, record);
    }
  } catch {
    /* localStorage unavailable */
  }
  return found.sort((a, b) => (a.startedAt ?? a.savedAt) - (b.startedAt ?? b.savedAt));
}

/**
 * Session ids of every stored record, readable or not. A sealed record that
 * cannot be opened right now (keychain locked or denied) still owns its audio
 * folder, so pruning must keep it.
 */
export function listUnsavedSessionIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length));
    }
  } catch {
    /* localStorage unavailable */
  }
  return ids;
}

/** Clears one meeting's record, or the legacy record when no id is given. */
export function clearUnsavedTranscript(sessionId?: string): void {
  try {
    localStorage.removeItem(sessionId ? `${KEY_PREFIX}${sessionId}` : LEGACY_KEY);
  } catch {
    /* non-fatal */
  }
}
