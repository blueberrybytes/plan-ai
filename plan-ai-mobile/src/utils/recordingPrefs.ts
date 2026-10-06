import { File, Paths } from "expo-file-system";

/**
 * Recording choices that must survive the record screen remounting and the
 * app restarting. The language lived only in the screen's state, so coming
 * back to the screen showed "Auto-Detect" and the save went out without a
 * language: a Catalan meeting then came back empty from the batch pass. The
 * desktop recorder had the same bug (fixed 2026-07-14).
 */
interface RecordingPrefs {
  language?: string;
  /** Live translation target, "" or missing when off. */
  translateTo?: string;
}

const prefsFile = () => new File(Paths.document, "recording_prefs.json");

function read(): RecordingPrefs {
  try {
    const f = prefsFile();
    return f.exists ? (JSON.parse(f.textSync()) as RecordingPrefs) : {};
  } catch {
    return {};
  }
}

export function loadLastLanguage(): string {
  return read().language ?? "";
}

export function saveLastLanguage(language: string): void {
  try {
    prefsFile().write(JSON.stringify({ ...read(), language }));
  } catch {
    // a preference, never worth an error
  }
}

export function loadLastTranslateTo(): string {
  return read().translateTo ?? "";
}

export function saveLastTranslateTo(translateTo: string): void {
  try {
    prefsFile().write(JSON.stringify({ ...read(), translateTo }));
  } catch {
    // a preference, never worth an error
  }
}
