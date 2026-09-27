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
 */

const LEGACY_KEY = "planai_unsaved_transcript";
const KEY_PREFIX = "planai_unsaved_meeting:";

export interface UnsavedTranscript {
  content: string;
  savedAt: number;
  /** Recording session id. Absent on copies written by older versions. */
  sessionId?: string;
  /** Epoch ms when capture started. */
  startedAt?: number;
  /** ASR language picked for the recording ("" = auto). */
  language?: string;
}

export interface UnsavedSession {
  sessionId: string;
  startedAt: number;
  language?: string;
}

function write(key: string, record: UnsavedTranscript): void {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    /* localStorage full/unavailable — non-fatal */
  }
}

function parse(raw: string | null): UnsavedTranscript | null {
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

/** Every meeting that was never confirmed as saved, oldest first. */
export function loadUnsavedMeetings(): UnsavedTranscript[] {
  const found: UnsavedTranscript[] = [];
  try {
    const legacy = parse(localStorage.getItem(LEGACY_KEY));
    if (legacy && legacy.content.trim()) found.push(legacy);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const record = parse(localStorage.getItem(key));
      if (record) {
        found.push({
          ...record,
          sessionId: record.sessionId ?? key.slice(KEY_PREFIX.length),
        });
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return found.sort((a, b) => (a.startedAt ?? a.savedAt) - (b.startedAt ?? b.savedAt));
}

/** Clears one meeting's record, or the legacy record when no id is given. */
export function clearUnsavedTranscript(sessionId?: string): void {
  try {
    localStorage.removeItem(sessionId ? `${KEY_PREFIX}${sessionId}` : LEGACY_KEY);
  } catch {
    /* non-fatal */
  }
}
