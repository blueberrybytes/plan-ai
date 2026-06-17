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

export const saveConfig = (config: RecordingConfig) => {
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

export const loadConfig = (): RecordingConfig | null => {
  const raw = sessionStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as RecordingConfig) : null;
};
