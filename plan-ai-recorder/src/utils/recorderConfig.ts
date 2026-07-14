export interface RecordingConfig {
  systemSourceId: string | null;
  language?: string;
  micDeviceId?: string;
  /**
   * Speaker / hands-free mode. When true the mic is captured with the browser's
   * AEC (echoCancellation), which removes loudspeaker bleed AT CAPTURE — the
   * "Teams way". ON by default (undefined ⇒ on): the common case is a virtual
   * meeting on a loudspeaker. A headphone user can flip it off live on the
   * Recording screen; the choice persists in the `planai_speaker_mode`
   * localStorage key (only "false" disables it).
   */
  speakerMode?: boolean;
  /** Legacy: direct context IDs. Prefer `projectIds`. */
  contextIds?: string[];
  /** User-facing project IDs. Backend resolves to internal contextIds. */
  projectIds?: string[];
}

const CONFIG_KEY = "recorder-config";
const LANGUAGE_KEY = "planai_language";

export const saveConfig = (config: RecordingConfig) => {
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

export const loadConfig = (): RecordingConfig | null => {
  const raw = sessionStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as RecordingConfig) : null;
};

/**
 * The chosen ASR language, persisted across Home remounts and app restarts
 * (the config above lives in sessionStorage, which dies with the window).
 *
 * Home remounts after every meeting, so a selector that only kept the code in
 * component state silently reverted to auto-detect ("" ⇒ Deepgram "multi").
 * `multi` only covers en/es/fr/de/hi/ru/pt/ja/it/nl — a Catalan meeting
 * transcribed under it comes back EMPTY, so a silent reset loses the recording.
 * "" is a real value here (explicit auto-detect) and must round-trip.
 */
export const saveLanguagePreference = (language: string) => {
  localStorage.setItem(LANGUAGE_KEY, language);
};

export const loadLanguagePreference = (): string | null =>
  localStorage.getItem(LANGUAGE_KEY);
