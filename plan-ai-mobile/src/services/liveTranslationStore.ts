import { loadLastTranslateTo, saveLastTranslateTo } from "../utils/recordingPrefs";
import {
  normalizeTranslationTarget,
  withTranslation,
  type TranslationErrorCode,
  type TranslationLines,
} from "../utils/liveTranslation";

/**
 * Live translation state of the meeting on screen. It lives outside the
 * React tree, like the recording session, so it survives the record screen
 * remounting. Only the target language is saved (recordingPrefs). The
 * translated text stays in memory: it is not written to the session folder
 * and not uploaded.
 */
export interface LiveTranslationState {
  /** Target language code, "" when off. */
  target: string;
  lines: TranslationLines;
  /** Last error from the backend, until the user closes the notice. */
  error: TranslationErrorCode | null;
}

let state: LiveTranslationState | null = null;
const listeners = new Set<() => void>();

// Read on first use, not at import, so the prefs file is only touched when
// the record screen or a recording needs it.
const current = (): LiveTranslationState => {
  if (!state) {
    state = { target: normalizeTranslationTarget(loadLastTranslateTo()), lines: {}, error: null };
  }
  return state;
};

const set = (patch: Partial<LiveTranslationState>) => {
  state = { ...current(), ...patch };
  listeners.forEach((l) => l());
};

export const liveTranslationStore = {
  getState: current,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** The user picked a target (or off). Translations already shown stay. */
  setTarget(target: string): void {
    const next = normalizeTranslationTarget(target);
    saveLastTranslateTo(next);
    set({ target: next, error: null });
  },

  setLine(line: number, text: string): void {
    set({ lines: withTranslation(current().lines, line, text) });
  },

  /** The backend turned translation off: show why and go back to off. */
  fail(code: TranslationErrorCode): void {
    saveLastTranslateTo("");
    set({ target: "", error: code });
  },

  clearError(): void {
    if (current().error) set({ error: null });
  },

  /** A new meeting starts: its transcript starts again at line 0. */
  resetLines(): void {
    set({ lines: {}, error: null });
  },
};
