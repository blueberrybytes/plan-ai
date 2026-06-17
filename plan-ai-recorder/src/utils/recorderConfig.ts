export interface RecordingConfig {
  systemSourceId: string | null;
  language?: string;
  micDeviceId?: string;
  /**
   * Speaker / hands-free mode. When true the mic is captured with the browser's
   * AEC (echoCancellation), which removes loudspeaker bleed AT CAPTURE — the
   * "Teams way". Off by default (headphones need no AEC, and AEC mildly mutes
   * the system audio you're listening to).
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
