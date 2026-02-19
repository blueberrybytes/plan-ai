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
      /** Registers a listener for the custom-protocol auth token; returns an unsubscribe fn */
      onDesktopAuthToken: (callback: (token: string) => void) => () => void;
    };
  }
}

export {};
