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
import { readFileSync, existsSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";

// Load .env manually — VITE_ vars never reach process.env in the Node main process
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [key, ...rest] = line.trim().split("=");
      if (key && !key.startsWith("#")) {
        process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
      }
    });
}

nativeTheme.themeSource = "dark";

// Custom protocol for receiving auth tokens from the system browser
const PROTOCOL = "blueberrybytes-recorder";
const AUTH_CALLBACK_PORT = 4321;

let mainWindow: BrowserWindow | null = null;

/**
 * Starts a lightweight HTTP server that receives the auth token from the web browser.
 * This is more reliable than OS-level custom protocol dispatch in Electron dev mode,
 * where the app is not a proper macOS bundle.
 *
 * Flow: DesktopCallback.tsx → GET http://localhost:4321/auth?token=... → here → renderer
 */
function startAuthCallbackServer(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${AUTH_CALLBACK_PORT}`);
    if (url.pathname === "/auth") {
      const token = url.searchParams.get("token");
      console.log("[auth-server] token received:", !!token);

      // CORS headers so the web app (different origin) can call this
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(
        "<html><body><h2>Authenticated! ✓</h2><p>You can close this tab and return to the app.</p><script>window.close()</script></body></html>",
      );

      if (token) handleAuthToken(token);
      // Keep server alive in case multiple attempts needed
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on("error", (err) => {
    console.warn("[auth-server] Could not start on port", AUTH_CALLBACK_PORT, err.message);
  });

  server.listen(AUTH_CALLBACK_PORT, "127.0.0.1", () => {
    console.log(`[auth-server] Listening on http://localhost:${AUTH_CALLBACK_PORT}`);
  });
}

function setupProtocol(): void {
  console.log("[protocol] process.defaultApp:", process.defaultApp);
  console.log("[protocol] process.argv:", process.argv);
  console.log("[protocol] process.execPath:", process.execPath);

  // In dev mode (process.defaultApp === true), the app runs via the shared Electron
  // binary. Without passing the script path, macOS associates the protocol with that
  // binary and may open a different Electron project. Passing process.argv[1] scopes
  // the registration to this specific app's entry script.
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const result = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
      console.log("[protocol] setAsDefaultProtocolClient (dev mode):", result);
    }
  } else {
    const result = app.setAsDefaultProtocolClient(PROTOCOL);
    console.log("[protocol] setAsDefaultProtocolClient (packaged):", result);
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

function handleAuthToken(token: string): void {
  console.log("[auth] token received, sending to renderer, mainWindow:", !!mainWindow);
  if (mainWindow) {
    mainWindow.webContents.send("desktop-auth-token", token);
    mainWindow.show();
    mainWindow.focus();
  }
}

function handleProtocolUrl(url: string): void {
  console.log("[protocol] handleProtocolUrl:", url);
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "auth") {
      const token = parsed.searchParams.get("token");
      if (token) handleAuthToken(token);
    }
  } catch (err) {
    console.error("[protocol] Failed to parse protocol URL:", url, err);
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

// ─── Single-instance lock ────────────────────────────────────────────────────
// Without this, every blueberrybytes-recorder:// URL opens a NEW Electron process.
// requestSingleInstanceLock makes the second instance quit immediately and fire
// `second-instance` in the first instance instead.
const gotTheLock = app.requestSingleInstanceLock();
console.log("[lock] gotTheLock:", gotTheLock);

if (!gotTheLock) {
  console.log("[lock] Second instance — quitting.");
  // This is the second instance spawned by the protocol URL — quit right away.
  app.quit();
} else {
  // Windows/Linux: protocol URL arrives in the second-instance argv
  app.on("second-instance", (_event, argv) => {
    console.log("[lock] second-instance fired, argv:", argv);
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupProtocol();
    setupSession();
    startAuthCallbackServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

// macOS: protocol URL arrives via open-url (fires in the FIRST instance directly)
app.on("open-url", (event, url) => {
  console.log("[protocol] open-url fired:", url);
  event.preventDefault();
  handleProtocolUrl(url);
});

// IPC: Open the web app desktop auth page in the system browser
// Append ?local_port=4321 so DesktopCallback can POST the token to localhost
ipcMain.handle("open-desktop-auth", () => {
  const webAppUrl = process.env["VITE_PLAN_AI_WEB_URL"] ?? "https://plan-ai.blueberrybytes.com";
  return shell.openExternal(`${webAppUrl}/auth/desktop?local_port=${AUTH_CALLBACK_PORT}`);
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
