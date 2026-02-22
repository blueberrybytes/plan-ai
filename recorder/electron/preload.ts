import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // Desktop source listing for system audio capture
  getDesktopSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke("get-desktop-sources"),

  // App version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),

  // Opens the web app /auth/desktop page in the system browser
  openDesktopAuth: (): Promise<void> => ipcRenderer.invoke("open-desktop-auth"),

  // Check screen recording permission on macOS
  checkScreenRecordingPermission: (): Promise<boolean> =>
    ipcRenderer.invoke("check-screen-recording-permission"),

  // Check microphone permission on macOS
  checkMicrophonePermission: (): Promise<boolean> =>
    ipcRenderer.invoke("check-microphone-permission"),

  // Listen for the custom-protocol token delivered by the main process
  onDesktopAuthToken: (callback: (token: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, token: string) => callback(token);
    ipcRenderer.on("desktop-auth-token", handler);
    return () => ipcRenderer.removeListener("desktop-auth-token", handler);
  },
});

interface DesktopSource {
  id: string;
  name: string;
  appIconDataURL: string | null;
  thumbnailDataURL: string | null;
}
