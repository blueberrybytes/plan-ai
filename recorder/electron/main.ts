import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  nativeTheme,
  session,
  shell,
} from "electron";
import { join } from "path";

nativeTheme.themeSource = "dark";

// Custom protocol for receiving auth tokens from the system browser
const PROTOCOL = "blueberrybytes-recorder";

let mainWindow: BrowserWindow | null = null;

function setupProtocol(): void {
  // Register as the default handler for planai-recorder://
  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function setupSession(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers["cross-origin-opener-policy"];
    delete headers["Cross-Origin-Opener-Policy"];
    callback({ responseHeaders: headers });
  });
}

function handleProtocolUrl(url: string): void {
  // planai-recorder://auth?token=<customToken>
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "auth") {
      const token = parsed.searchParams.get("token");
      if (token && mainWindow) {
        // Send token to renderer so it can call signInWithCustomToken
        mainWindow.webContents.send("desktop-auth-token", token);
        mainWindow.focus();
      }
    }
  } catch (err) {
    console.error("Failed to parse protocol URL:", url, err);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0b0d11",
    icon: join(__dirname, "../../resources/icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupProtocol();
  setupSession();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS: deep link arrives via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Windows/Linux: deep link arrives via second-instance event (argv)
app.on("second-instance", (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (url) handleProtocolUrl(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC: Open the web app desktop auth page in the system browser
ipcMain.handle("open-desktop-auth", () => {
  // electron-vite inlines VITE_ env vars into process.env for the main process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webAppUrl =
    (process.env as any)["VITE_PLAN_AI_WEB_URL"] ?? "https://plan-ai.blueberrybytes.com";
  return shell.openExternal(`${webAppUrl}/auth/desktop`);
});

// IPC: List desktop/window sources for system audio capture
ipcMain.handle("get-desktop-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    appIconDataURL: source.appIcon?.toDataURL() ?? null,
    thumbnailDataURL: source.thumbnail?.toDataURL() ?? null,
  }));
});

// IPC: App version
ipcMain.handle("get-app-version", () => app.getVersion());
