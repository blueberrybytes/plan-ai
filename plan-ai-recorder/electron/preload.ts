import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // The host OS platform ("darwin", "win32", "linux")
  platform: process.platform,

  // Desktop source listing for system audio capture
  getDesktopSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke("get-desktop-sources"),

  // App version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),

  // Opens the web app /auth/desktop page in the system browser
  openDesktopAuth: (provider?: string): Promise<void> => ipcRenderer.invoke("open-desktop-auth", provider),

  // Clears Chromium defaultSession storage so Apple/Google Logins don't infinitely auto-connect
  clearAuthSession: (): Promise<boolean> => ipcRenderer.invoke("clear-auth-session"),

  // Opens any generic URL natively in the user's default browser
  openExternalUrl: (url: string): Promise<void> => ipcRenderer.invoke("open-external-url", url),

  // Fetches hardware and OS-level diagnostics for the Admin Panel
  getSystemDiagnostics: (): Promise<any> => ipcRenderer.invoke("get-system-diagnostics"),

  // Check screen recording permission on macOS
  checkScreenRecordingPermission: (): Promise<boolean> =>
    ipcRenderer.invoke("check-screen-recording-permission"),

  // Check microphone permission on macOS
  checkMicrophonePermission: (): Promise<boolean> =>
    ipcRenderer.invoke("check-microphone-permission"),

  // Open macOS System Preferences
  openSystemPreferences: (pane: "microphone" | "screen"): Promise<void> =>
    ipcRenderer.invoke("open-system-preferences", pane),

  // Listen for the custom-protocol auth code delivered by the main process
  onDesktopAuthCode: (callback: (code: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, code: string) => callback(code);
    ipcRenderer.on("desktop-auth-code", handler);
    return () => ipcRenderer.removeListener("desktop-auth-code", handler);
  },

  // Listen for the auth flow being cancelled (window closed early)
  onDesktopAuthCancelled: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on("desktop-auth-cancelled", handler);
    return () => ipcRenderer.removeListener("desktop-auth-cancelled", handler);
  },

  // Start native macOS system audio recording
  startSystemAudio: (): Promise<string | null> => ipcRenderer.invoke("start-system-audio"),

  // Chunk native macOS system audio
  chunkSystemAudio: (): Promise<Uint8Array | null> => ipcRenderer.invoke("chunk-system-audio"),

  // Stop native macOS system audio recording and get the buffer
  stopSystemAudio: (): Promise<Uint8Array | null> => ipcRenderer.invoke("stop-system-audio"),

  // Save file natively using Electron dialog
  saveFile: (content: string, defaultPath: string): Promise<boolean> => 
    ipcRenderer.invoke("save-file", content, defaultPath),

  // Auto-Updater: Listen for Mac App Store updates
  onMasUpdateAvailable: (callback: (info: { version: string; url: string }) => void): (() => void) => {
    const handler = (_event: any, info: { version: string; url: string }) => callback(info);
    ipcRenderer.on("mas-update-available", handler);
    return () => ipcRenderer.removeListener("mas-update-available", handler);
  },

  // Auto-Updater: Listen for OTA updates available
  onOtaUpdateAvailable: (callback: (info: any) => void): (() => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on("ota-update-available", handler);
    return () => ipcRenderer.removeListener("ota-update-available", handler);
  },

  // Auto-Updater: Listen for OTA download progress
  onOtaDownloadProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on("ota-download-progress", handler);
    return () => ipcRenderer.removeListener("ota-download-progress", handler);
  },

  // Auto-Updater: Listen for OTA download completed
  onOtaUpdateDownloaded: (callback: (info: any) => void): (() => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on("ota-update-downloaded", handler);
    return () => ipcRenderer.removeListener("ota-update-downloaded", handler);
  },

  // Trigger a native main process crash (for Sentry testing)
  simulateMainCrash: (): void => ipcRenderer.send("simulate-main-crash"),

  // Auto-Updater: Restart and install the downloaded update
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke("quit-and-install"),
});

interface DesktopSource {
  id: string;
  name: string;
  appIconDataURL: string | null;
  thumbnailDataURL: string | null;
}
