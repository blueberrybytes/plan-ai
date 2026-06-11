export interface DesktopSource {
  id: string;
  name: string;
  appIconDataURL: string | null;
  thumbnailDataURL: string | null;
}

export interface SystemDiagnostics {
  arch: string;
  platform: string;
  osRelease: string;
  totalMemMB: number;
  freeMemMB: number;
  nodeVersion: string;
  electronVersion: string;
}

declare global {
  interface Window {
    electron: {
      /** The host OS platform: "darwin" (macOS), "win32" (Windows), or "linux" */
      platform: string;
      getDesktopSources: () => Promise<DesktopSource[]>;
      getAppVersion: () => Promise<string>;
      /** Opens the Plan AI web app /auth/desktop page in the system browser */
      openDesktopAuth: (provider?: string) => Promise<void>;
      /** Clears Chromium defaultSession storage so Apple/Google Logins don't infinitely auto-connect */
      clearAuthSession: () => Promise<boolean>;
      /** Opens a generic URL in the system default browser */
      openExternalUrl: (url: string) => Promise<void>;
      /** Fetches hardware and OS-level diagnostics for the Admin Panel */
      getSystemDiagnostics: () => Promise<SystemDiagnostics>;
      /** Checks if screen recording permissions are granted (macOS only — always true on other platforms) */
      checkScreenRecordingPermission: () => Promise<boolean>;
      /** Checks if microphone permissions are granted (macOS only — always true on other platforms) */
      checkMicrophonePermission: () => Promise<boolean>;
      /** Opens OS privacy settings for the given pane (macOS & Windows) */
      openSystemPreferences: (pane: "microphone" | "screen") => Promise<void>;
      /** Registers a listener for the custom-protocol auth token; returns an unsubscribe fn */
      onDesktopAuthCode: (callback: (code: string) => void) => () => void;
      /** Registers a listener for if the user manually closes the desktop auth modal */
      onDesktopAuthCancelled: (callback: () => void) => () => void;
      /**
       * Start native system audio recording.
       * Returns "started" (macOS binary), "already_running", or "use_web_api" (Windows/Linux — renderer uses getDisplayMedia).
       */
      startSystemAudio: () => Promise<string | null>;
      /** Request a completed audio chunk from the native macOS binary (SIGUSR1 rotation) */
      chunkSystemAudio: () => Promise<Uint8Array | null>;
      /** Stop native macOS system audio recording and retrieve the final chunk */
      stopSystemAudio: () => Promise<Uint8Array | null>;
      /** Save a string content to file natively bypassing browser restrictions */
      saveFile: (content: string, defaultPath: string) => Promise<boolean>;
      /** Register listener for Mac App Store update notifications */
      onMasUpdateAvailable: (callback: (info: { version: string; url: string }) => void) => () => void;
      /** Register listener for OTA update available notifications */
      onOtaUpdateAvailable: (callback: (info: { version: string; [key: string]: any }) => void) => () => void;
      /** Register listener for OTA update download completed */
      onOtaUpdateDownloaded: (callback: (info: { version: string; [key: string]: any }) => void) => () => void;
      /** Trigger a native main process crash (for Sentry testing) */
      simulateMainCrash: () => void;
      /** Auto-Updater: Restart and install the downloaded update */
      quitAndInstall: () => Promise<void>;
    };
  }
}

export { };
