import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  nativeTheme,
  session,
  systemPreferences,
  shell,
} from "electron";
import { join } from "path";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess } from "child_process";

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
  console.log("[IPC main] Requesting desktop sources...");
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      fetchWindowIcons: true,
    });
    console.log(`[IPC main] desktopCapturer returned ${sources.length} sources`);
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      appIconDataURL: source.appIcon?.toDataURL() ?? null,
      thumbnailDataURL: source.thumbnail?.toDataURL() ?? null,
    }));
  } catch (err) {
    console.error("[IPC main] desktopCapturer failed:", err);
    throw err;
  }
});

// IPC: Screen Recording Permissions (macOS)
ipcMain.handle("check-screen-recording-permission", async () => {
  console.log("[IPC main] Checking macOS screen recording permissions...");
  if (process.platform !== "darwin") {
    console.log("[IPC main] Not macOS, bypassing check.");
    return true;
  }

  const status = systemPreferences.getMediaAccessStatus("screen");
  console.log("[IPC main] macOS systemPreferences returned status:", status);
  if (status === "granted") return true;

  // If not-determined, triggering a dummy capture request forces macOS to show the permission dialog
  if (status === "not-determined") {
    console.log("[IPC main] Triggering dummy capture to provoke macOS permission dialog...");
    try {
      await desktopCapturer.getSources({ types: ["screen"] });
    } catch {
      // Ignore
    }
    return false; // Still returning false so the user knows they need to restart the app
  }

  return false;
});

// IPC: Microphone Permissions (macOS)
ipcMain.handle("check-microphone-permission", async () => {
  console.log("[IPC main] Checking macOS microphone permissions...");
  if (process.platform !== "darwin") return true;

  const status = systemPreferences.getMediaAccessStatus("microphone");
  console.log("[IPC main] macOS microphone permission status:", status);
  if (status === "granted") return true;

  if (status === "not-determined") {
    console.log("[IPC main] Requesting microphone access...");
    return await systemPreferences.askForMediaAccess("microphone");
  }

  return false;
});

// IPC: App version
ipcMain.handle("get-app-version", () => app.getVersion());

// ─── Native macOS System Audio Capture ───────────────────────────────────────
let systemAudioProcess: ChildProcess | null = null;
let currentAudioPath: string | null = null;

ipcMain.handle("start-system-audio", async () => {
  if (process.platform !== "darwin") return null;
  if (systemAudioProcess) throw new Error("System audio capture is already running.");

  const binaryPath = app.isPackaged
    ? join(process.resourcesPath, "macos", "AudioCapture")
    : join(process.cwd(), "macos", "AudioCapture");

  currentAudioPath = join(app.getPath("temp"), `sys_audio_${Date.now()}.m4a`);
  console.log("[IPC main] Starting macOS system audio capture to", currentAudioPath);

  systemAudioProcess = spawn(binaryPath, [currentAudioPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  systemAudioProcess.stdout?.on("data", (d) =>
    console.log(`[AudioCapture] ${d.toString().trim()}`),
  );
  systemAudioProcess.stderr?.on("data", (d) =>
    console.error(`[AudioCapture ERR] ${d.toString().trim()}`),
  );

  systemAudioProcess.on("close", (code) => {
    console.log(`[AudioCapture] process exited with code ${code}`);
    systemAudioProcess = null;
  });

  return currentAudioPath;
});

ipcMain.handle("chunk-system-audio", async () => {
  if (!systemAudioProcess || !currentAudioPath) return null;

  return new Promise<Uint8Array | null>((resolve) => {
    console.log("[IPC main] Chunking system audio capture...");
    const oldProcess = systemAudioProcess!;
    const oldPath = currentAudioPath!;

    // Instantly start the next process to avoid dropping audio
    const binaryPath = app.isPackaged
      ? join(process.resourcesPath, "macos", "AudioCapture")
      : join(process.cwd(), "macos", "AudioCapture");

    currentAudioPath = join(app.getPath("temp"), `sys_audio_${Date.now()}.m4a`);
    systemAudioProcess = spawn(binaryPath, [currentAudioPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    systemAudioProcess.stdout?.on("data", (d) =>
      console.log(`[AudioCapture] ${d.toString().trim()}`),
    );
    systemAudioProcess.stderr?.on("data", (d) =>
      console.error(`[AudioCapture ERR] ${d.toString().trim()}`),
    );
    systemAudioProcess.on("close", (code) => {
      console.log(`[AudioCapture NEW] process exited with code ${code}`);
      if (systemAudioProcess === systemAudioProcess) {
        systemAudioProcess = null;
      }
    });

    // Gracefully kill old one and retrieve data
    oldProcess.once("close", () => {
      console.log(`[IPC main] Old AudioCapture process closed. Reading file: ${oldPath}`);
      try {
        if (existsSync(oldPath)) {
          const buffer = readFileSync(oldPath);
          console.log(`[IPC main] Successfully read ${buffer.length} bytes from sys audio file.`);
          unlinkSync(oldPath);
          resolve(new Uint8Array(buffer));
        } else {
          console.warn(`[IPC main] System audio file did NOT exist: ${oldPath}`);
          resolve(null);
        }
      } catch (err) {
        console.error("[IPC main] Error reading sys audio chunk file:", err);
        resolve(null);
      }
    });

    console.log("[IPC main] Sending SIGTERM to old AudioCapture process...");
    oldProcess.kill("SIGTERM");

    setTimeout(() => {
      // Force kill if it hangs
      try {
        oldProcess.kill("SIGKILL");
      } catch {
        /* ignored */
      }
    }, 1500);
  });
});

ipcMain.handle("stop-system-audio", async () => {
  if (!systemAudioProcess || !currentAudioPath) return null;

  return new Promise<Uint8Array | null>((resolve) => {
    console.log("[IPC main] Stopping system audio capture...");

    systemAudioProcess!.once("close", () => {
      systemAudioProcess = null;
      try {
        if (existsSync(currentAudioPath!)) {
          const buffer = readFileSync(currentAudioPath!);
          unlinkSync(currentAudioPath!);
          currentAudioPath = null;
          resolve(new Uint8Array(buffer));
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error("[IPC main] Error reading sys audio file:", err);
        resolve(null);
      }
    });

    systemAudioProcess!.kill("SIGTERM");

    setTimeout(() => {
      if (systemAudioProcess) {
        console.warn("[IPC main] AudioCapture process hung, forcing kill.");
        systemAudioProcess.kill("SIGKILL");
      }
    }, 3000);
  });
});
