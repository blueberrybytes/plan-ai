/**
 * Crash-recovery copy of the in-progress meeting transcript.
 *
 * Written continuously WHILE recording (throttled to finalized-utterance
 * updates) and at save time; cleared only after the backend confirms the
 * save. If the app crashes, the window is closed mid-flow, or the upload
 * fails and the user bails, Home offers to recover it on next launch.
 */

const UNSAVED_TRANSCRIPT_KEY = "planai_unsaved_transcript";

export interface UnsavedTranscript {
  content: string;
  savedAt: number;
}

export function persistUnsavedTranscript(content: string): void {
  try {
    if (!content.trim()) return;
    localStorage.setItem(
      UNSAVED_TRANSCRIPT_KEY,
      JSON.stringify({ content, savedAt: Date.now() } satisfies UnsavedTranscript),
    );
  } catch {
    /* localStorage full/unavailable — non-fatal */
  }
}

export function loadUnsavedTranscript(): UnsavedTranscript | null {
  try {
    const raw = localStorage.getItem(UNSAVED_TRANSCRIPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnsavedTranscript>;
    if (typeof parsed.content !== "string" || !parsed.content.trim()) return null;
    return { content: parsed.content, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

export function clearUnsavedTranscript(): void {
  try {
    localStorage.removeItem(UNSAVED_TRANSCRIPT_KEY);
  } catch {
    /* non-fatal */
  }
}
