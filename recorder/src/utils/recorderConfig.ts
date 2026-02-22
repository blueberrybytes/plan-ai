export interface RecordingConfig {
  systemSourceId: string | null;
}

const CONFIG_KEY = "recorder-config";

export const saveConfig = (config: RecordingConfig) => {
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

export const loadConfig = (): RecordingConfig | null => {
  const raw = sessionStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as RecordingConfig) : null;
};
