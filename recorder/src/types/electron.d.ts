export interface DesktopSource {
  id: string;
  name: string;
  appIconDataURL: string | null;
  thumbnailDataURL: string | null;
}

declare global {
  interface Window {
    electron: {
      getDesktopSources: () => Promise<DesktopSource[]>;
      getAppVersion: () => Promise<string>;
      /** Opens the Plan AI web app /auth/desktop page in the system browser */
      openDesktopAuth: () => Promise<void>;
      /** Checks if macOS screen recording permissions are granted */
      checkScreenRecordingPermission: () => Promise<boolean>;
      /** Checks if macOS microphone permissions are granted */
      checkMicrophonePermission: () => Promise<boolean>;
      /** Opens macOS System Preferences for specific privacy panes */
      openSystemPreferences: (pane: "microphone" | "screen") => Promise<void>;
      /** Registers a listener for the custom-protocol auth token; returns an unsubscribe fn */
      onDesktopAuthToken: (callback: (token: string) => void) => () => void;
      /** Start native macOS system audio recording (ScreenCaptureKit) */
      startSystemAudio: () => Promise<string | null>;
      /** Stop and restart native macOS system audio recording, returning previous chunk */
      chunkSystemAudio: () => Promise<Uint8Array | null>;
      /** Stop native macOS system audio recording and retrieve data */
      stopSystemAudio: () => Promise<Uint8Array | null>;
    };
  }
}

export {};
