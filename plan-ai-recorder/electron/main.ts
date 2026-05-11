import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  nativeTheme,
  session,
  systemPreferences,
  shell,
  Notification,
  Menu,
  Tray,
  dialog,
} from "electron";
import * as path from "path";
import { join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, unlinkSync, copyFileSync, chmodSync, writeFileSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess, execFile } from "child_process";
import { autoUpdater } from "electron-updater";
import * as Sentry from "@sentry/electron/main";

// Initialize Sentry only in production if DSN is provided
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = app.isPackaged && !!sentryDsn;
console.log("[main] Sentry enabled:", sentryEnabled);
Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,
});

// Custom protocol for receiving auth tokens from the system browser
const BASE_PROTOCOL = import.meta.env.VITE_APP_PROTOCOL || "blueberrybytes-recorder";
const PROTOCOL = app.isPackaged ? BASE_PROTOCOL : `${BASE_PROTOCOL}-dev`;
const isHouseGroup = BASE_PROTOCOL === "housegroup-recorder";

nativeTheme.themeSource = isHouseGroup ? "light" : "dark";
// Force-disable CORS and Web Security policies at the deepest chromium level for WebAuthn/Passkeys
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy,CrossOriginEmbedderPolicy,IsolateOrigins,site-per-process');
// Prevent Windows from immediately dropping wss:// WebSocket connections due to self-signed corporate proxy setups
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

const AUTH_CALLBACK_PORT = 4321;

let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let pendingAuthCode: string | null = null;
let tray: Tray | null = null;
let systemAudioProcess: ChildProcess | null = null;

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

    if (url.pathname === "/auth-cancel") {
      console.log("[auth-server] cancellation received");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.writeHead(200);
      res.end();
      if (authWindow) {
        authWindow.close();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("desktop-auth-cancelled");
      }
    } else if (url.pathname === "/auth") {
      const code = url.searchParams.get("code");
      console.log("[auth-server] code received:", !!code);

      // CORS headers so the web app (different origin) can call this
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(
        "<html><body><h2>Authenticated! ✓</h2><p>You can close this tab and return to the app.</p><script>window.close()</script></body></html>",
      );

      if (code) handleAuthCode(code);
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
  const configureSession = (sess: Electron.Session) => {
    sess.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };

      // Explicitly set COOP/COEP to unsafe-none instead of deleting to override defaults
      for (const key of Object.keys(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "cross-origin-opener-policy" || lowerKey === "cross-origin-embedder-policy") {
          delete headers[key];
        }
      }
      headers["Cross-Origin-Opener-Policy"] = ["unsafe-none"];
      headers["Cross-Origin-Embedder-Policy"] = ["unsafe-none"];

      // Add secure CSP to prevent the "unsafe-eval" warning and allow Firebase Auth to work properly
      const cspKey = Object.keys(headers).find(k => k.toLowerCase() === "content-security-policy") || "Content-Security-Policy";
      if (!headers[cspKey] || headers[cspKey].length === 0) {
        headers[cspKey] = ["default-src 'self' 'unsafe-inline' data: https: wss: ws:; script-src 'self' 'unsafe-inline' https: blob:; worker-src 'self' blob:; connect-src * 'unsafe-inline' ws: wss:;"];
      }

      callback({ responseHeaders: headers });
    });

    // Spoof Origin & Referer headers for outgoing backend API calls to bypass Railway CORS rejecting file://
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const { requestHeaders, url } = details;
      if (url.includes("plan-ai-backend") || url.includes("up.railway.app")) {
        requestHeaders["Origin"] = "https://plan-ai.blueberrybytes.com";
        requestHeaders["Referer"] = "https://plan-ai.blueberrybytes.com/";
      }
      callback({ requestHeaders });
    });

    // Required in Electron 31+ to allow getDisplayMedia to actually trigger the OS-level Screen Recording prompt
    sess.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
        // Automatically accept the first screen just to satisfy the API and trigger the macOS prompt
        callback({ video: sources[0] });
      }).catch((err) => {
        console.error("[setDisplayMediaRequestHandler] Failed to get sources:", err);
        callback(null as any); // Null rejects the prompt silently
      });
    });
  };

  // Strip from default session
  configureSession(session.defaultSession);
  // Strip from any newly created sessions
  app.on("session-created", configureSession);
}

function handleAuthCode(code: string): void {
  console.log("[auth] code received, sending to renderer, mainWindow:", !!mainWindow);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop-auth-code", code);
    mainWindow.show();
    mainWindow.focus();
  } else {
    // If the window isn't created yet (Cold Boot from Deep Link), buffer it
    pendingAuthCode = code;
  }
  if (authWindow) {
    authWindow.close();
    authWindow = null;
  }
}

function handleProtocolUrl(rawUrl: string) {
  // If we get "blueberrybytes-recorder://auth?code=XYZ" (or the dynamic protocol)
  // Try to parse it properly (URLSearchParams handles URL decoding perfectly!)
  try {
    // 1. We replace the custom scheme with a fake HTTP domain just so the JS `URL` parser accepts it natively
    const fakeUri = rawUrl.replace(`${PROTOCOL}://`, "http://localhost/");
    const url = new URL(fakeUri);

    // 2. Extract the short-lived OTP Auth Code via standard search parameters
    const code = url.searchParams.get("code");

    if (code) {
      console.log("[protocol] Successfully parsed OTP auth code:", code);
      pendingAuthCode = code;

      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("[protocol] Dispatching code to React AuthProvider...");
        mainWindow.webContents.send("desktop-auth-code", pendingAuthCode);
        pendingAuthCode = null; // Clear it to prevent multi-fires
      }

      // Close the internal auth window if it was used for Apple Login
      if (authWindow) {
        console.log("[protocol] Closing internal auth window...");
        authWindow.close();
      }
    } else {
      console.warn("[protocol] URL intercepted, but 'code' query parameter missing.", rawUrl);
    }
  } catch (err) {
    console.error("[protocol] Failed to parse custom Protocol URL:", rawUrl, err);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 800,
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

  // Once the React app is securely mounted, blast any pending deep-link payloads
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthCode && mainWindow && !mainWindow.isDestroyed()) {
      console.log("[main] Discharging buffered pendingAuthCode to renderer!");
      mainWindow.webContents.send("desktop-auth-code", pendingAuthCode);
      pendingAuthCode = null;
    }
  });

  // Intercept any new window creation natively (like window.open(url, "_blank")) and open it in Safari/Chrome.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupMenu(): void {
  const isMac = process.platform === "darwin";

  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Show Plan AI Recorder",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            } else {
              createWindow();
            }
          }
        },
        { type: "separator" },
        { role: "minimize" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" }
        ] : [
          { role: "close" }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
    setupMenu();
    startMicActivityPolling();
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

// ─── Native macOS Microphone Activity Detection ──────────────────────────────
let isMicCurrentlyActive = false;

function startMicActivityPolling() {
  if (process.platform !== "darwin") return;

  let micActivityBinaryPath = "";

  // In dev mode, use the local binary
  if (!app.isPackaged) {
    micActivityBinaryPath = path.join(process.cwd(), "macos", "MicActivity");
  } else {
    // In production, electron-builder extraFiles puts it in Contents/Resources/bin
    micActivityBinaryPath = path.join(process.resourcesPath, "bin", "MicActivity");
  }

  // Ensure binary exists before polling
  if (!existsSync(micActivityBinaryPath)) {
    console.warn(`[MicActivity] Binary not found at ${micActivityBinaryPath}`);
    return;
  }

  setInterval(() => {
    // If the app is already recording (system process is running), don't show the toast
    if (systemAudioProcess) {
      isMicCurrentlyActive = true;
      return;
    }

    execFile(micActivityBinaryPath, [], (error, stdout) => {
      if (error) {
        console.error("[MicActivity] ExecError:", error.message);
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        const isActive = result.isActive === true;

        if (isActive && !isMicCurrentlyActive) {
          const notification = new Notification({
            title: "Microphone Active",
            body: "Meeting started? Click here to record with Plan AI.",
            silent: false,
          });

          notification.on("click", () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            }
          });

          notification.show();
        }

        isMicCurrentlyActive = isActive;
      } catch (err) {
        console.error("[MicActivity] JSON Parsing Error:", err, "Raw Output:", stdout);
      }
    });
  }, 3000);
}

// macOS: protocol URL arrives via open-url (fires in the FIRST instance directly)
app.on("open-url", (event, url) => {
  console.log("[protocol] open-url fired:", url);
  event.preventDefault();
  handleProtocolUrl(url);
});

ipcMain.handle("clear-auth-session", async () => {
  console.log("[Desktop Auth] [SESSION WIPE] Erasing defaultSession cookies/storage to force fresh logins...");
  try {
    const cookiesBefore = await session.defaultSession.cookies.get({});
    console.log(`[Desktop Auth] [SESSION WIPE] Cookies present before wipe: ${cookiesBefore.length}`);

    // Aggressively target cookies and all Chromium storage to completely burn the Apple Session
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
    });
    console.log("[Desktop Auth] [SESSION WIPE] clearStorageData() succeeded!");

    // Also clear the HTTP Auth cache just in case Apple uses specialized WWW-Authenticate headers
    await session.defaultSession.clearAuthCache();
    console.log("[Desktop Auth] [SESSION WIPE] clearAuthCache() succeeded!");

    const cookiesAfter = await session.defaultSession.cookies.get({});
    console.log(`[Desktop Auth] [SESSION WIPE] Cookies present after wipe: ${cookiesAfter.length}`);

    // Explicitly flush storage to disk to guarantee persistence
    session.defaultSession.flushStorageData();

    return true;
  } catch (err) {
    console.error("[Desktop Auth] [SESSION WIPE FATAL] Failed to clear storage:", err);
    return false;
  }
});

ipcMain.handle("open-desktop-auth", (_event, _provider?: string) => {
  const webAppUrlEnv = import.meta.env.VITE_PLAN_AI_WEB_URL ?? "http://localhost:3000";
  const webAppUrl = webAppUrlEnv.replace(/\/+$/, "");
  let authUrl = `${webAppUrl}/login?desktop_auth=true`;

  if (!app.isPackaged) {
    authUrl += `&local_port=${AUTH_CALLBACK_PORT}`;
  }

  // APPLE REQUIREMENT (App Store Guideline 4):
  // "Sign in with Apple should always be completed without leaving the app"
  if (_provider === "apple") {
    if (authWindow) {
      authWindow.focus();
      return;
    }

    console.log("[Desktop Auth] Spawning internal BrowserWindow for Apple Auth compliance.");
    authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      modal: true,
      parent: mainWindow || undefined,
      show: false,
      backgroundColor: "#0b0d11",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Strip "Electron" from the User-Agent so Google/Apple login frames don't immediately reject the embedded browser.
    const customUserAgent = authWindow.webContents
      .getUserAgent()
      .replace(/Electron\/\S+\s?/, "")
      .replace(/plan-ai-recorder\/\S+\s?/, "");

    authWindow.webContents.setUserAgent(customUserAgent);

    authWindow.once("ready-to-show", () => {
      authWindow?.show();
    });

    // CRUCIAL FOR APPLE COMPLIANCE:
    // Firebase signInWithPopup() opens the popup with 'about:blank' initially before
    // navigating to the firebaseapp.com handler. Restricting by URL blocks it silently.
    // Allow ALL popups inside authWindow — this stays in-app and satisfies Guideline 4.
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      console.log("[Internal Auth Window] Popup requested for:", url);
      return { action: "allow" };
    });

    // When the child popup is created (the Firebase/Apple auth page):
    // 1. Spoof User-Agent so Google/Apple don't reject the embedded browser
    // 2. Intercept the callback redirect INSIDE the popup too —
    //    the blueberrybytes-recorder:// deep link fires inside the child, not the parent.
    authWindow.webContents.on("did-create-window", (childWindow) => {
      const childUserAgent = childWindow.webContents
        .getUserAgent()
        .replace(/Electron\/\S+\s?/, "")
        .replace(/plan-ai-recorder\/\S+\s?/, "");
      childWindow.webContents.setUserAgent(childUserAgent);

      // Catch redirect-based callbacks in the child popup
      const interceptChildUrl = (event: Electron.Event, url: string) => {
        if (
          url.startsWith(`${PROTOCOL}://`) ||
          url.includes(`localhost:${AUTH_CALLBACK_PORT}/auth`)
        ) {
          event.preventDefault();
          console.log("[Child Auth Window] Intercepted callback:", url);
          handleProtocolUrl(url);
          childWindow.destroy();
        }
      };

      childWindow.webContents.on("will-redirect", interceptChildUrl);
      childWindow.webContents.on("will-navigate", interceptChildUrl);
    });

    // Intercept redirects back to our custom Protocol or Localhost
    authWindow.webContents.on("will-redirect", (event, url) => {
      if (
        url.startsWith(`${PROTOCOL}://`) ||
        url.includes(`localhost:${AUTH_CALLBACK_PORT}/auth`)
      ) {
        event.preventDefault();
        console.log("[Internal Auth Window] Intercepted redirect:", url);
        handleProtocolUrl(url);
      }
    });

    authWindow.on("closed", () => {
      authWindow = null;
      // If the user closed the window themselves without finishing login, 
      // notify React to stop the spinning Apple button loader.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("desktop-auth-cancelled");
      }
    });

    // Pass the auto-trigger parameter specifically for the frontend
    authWindow.loadURL(`${authUrl}&auto_trigger=apple`);
  } else {
    // GOOGLE / MICROSOFT:
    // It is perfectly acceptable and explicitly allowed by Apple to bounce Google/MS to the external system browser.
    console.log("[Desktop Auth] Opening external system browser for OAuth Provider:", _provider);
    shell.openExternal(authUrl);
  }
});

// IPC: Open any generic URL in the native default browser
ipcMain.handle("open-external-url", (_event, url: string) => {
  if (url) shell.openExternal(url);
});

// IPC: Fetch deep system diagnostics for the Admin Debug Panel
ipcMain.handle("get-system-diagnostics", () => {
  return {
    arch: process.arch,
    platform: process.platform,
    osRelease: require("os").release(),
    totalMemMB: Math.round(require("os").totalmem() / 1024 / 1024),
    freeMemMB: Math.round(require("os").freemem() / 1024 / 1024),
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
  };
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

// IPC: Native File Save Dialog
ipcMain.handle("save-file", async (_event, content: string, defaultPath: string) => {
  if (!mainWindow) return false;
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      buttonLabel: "Save",
    });
    if (canceled || !filePath) return false;
    writeFileSync(filePath, content, "utf8");
    return true;
  } catch (err) {
    console.error("[IPC main] save-file failed:", err);
    return false;
  }
});

// IPC: Screen Recording Permissions (macOS)
ipcMain.handle("check-screen-recording-permission", async () => {
  console.log("[IPC main] Checking macOS screen recording permissions...");

  if (process.platform !== "darwin") {
    console.log("[IPC main] Not macOS, bypassing check.");
    return true;
  }

  // The Mac App Store build (`mas.plist`) strictly prohibits the `com.apple.security.device.screen-capture` entitlement. 
  // But because we compile a standard DMG for distribution, we MUST check `getMediaAccessStatus` natively.

  const status = systemPreferences.getMediaAccessStatus("screen");
  console.log("[IPC main] macOS systemPreferences returned status:", status);

  if (status === "granted") return true;

  // If not-determined, triggering natively bypasses the Chromium user-gesture requirement
  if (status === "not-determined") {
    console.log("[IPC main] Triggering macOS native screen recording prompt...");
    try {
      // @ts-expect-error TypeScript definitions in Electron 31 might be missing 'screen' literal, but it is fully supported natively!
      return await systemPreferences.askForMediaAccess("screen");
    } catch (err) {
      console.warn("[IPC main] Error executing askForMediaAccess:", err);
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

// IPC: Open System Preferences (macOS) / Settings (Windows)
ipcMain.handle("open-system-preferences", (_, pane: "microphone" | "screen") => {
  let url: string;
  if (process.platform === "darwin") {
    url =
      pane === "microphone"
        ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
  } else if (process.platform === "win32") {
    // Windows Settings deep links
    url =
      pane === "microphone"
        ? "ms-settings:privacy-microphone"
        : "ms-settings:privacy-broadFileSystemAccess";
  } else {
    return;
  }
  shell.openExternal(url);
});

// IPC: App version
ipcMain.handle("get-app-version", () => app.getVersion());

// ─── Native macOS System Audio Capture ───────────────────────────────────────
let currentChunkPromiseResolve: ((buf: Uint8Array | null) => void) | null = null;
let currentAudioPath: string | null = null;

ipcMain.handle("start-system-audio", async () => {
  if (systemAudioProcess) return "already_running";

  // On non-macOS (Windows/Linux) we have no native binary — tell the renderer
  // to capture system audio via the Web getDisplayMedia API instead.
  if (process.platform !== "darwin") {
    console.log("[IPC main] Non-macOS platform — system audio will use getDisplayMedia in renderer.");
    return "use_web_api";
  }

  const hasMic = await systemPreferences.askForMediaAccess("microphone");
  console.log(`[IPC main] macOS microphone permission status: ${hasMic ? "granted" : "denied"}`);
  if (!hasMic) {
    console.warn("[IPC main] macOS microphone permission denied.");
  }

  const basePath = path.join(app.getPath("temp"), `sys_audio_${Date.now()}`);
  console.log(`[IPC main] Starting macOS system audio capture with base path: ${basePath}`);

  let bundledBinaryPath = "";

  if (!app.isPackaged) {
    const localBinaryPath = path.join(process.cwd(), "macos", "AudioCapture");
    // Ensure we have a temp copy for dev
    bundledBinaryPath = path.join(app.getPath("userData"), "AudioCapture");
    if (existsSync(localBinaryPath)) {
      copyFileSync(localBinaryPath, bundledBinaryPath);
      chmodSync(bundledBinaryPath, "755");
    }
  } else {
    // Packaged DMG/APP extraFiles injects into Contents/Resources/bin
    bundledBinaryPath = path.join(process.resourcesPath, "bin", "AudioCapture");
  }

  systemAudioProcess = spawn(bundledBinaryPath, [basePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  console.log(`[IPC main] Spawning: ${bundledBinaryPath}`);
  systemAudioProcess.on("error", (err) => {
    Sentry.captureException(err, { extra: { context: "AudioCapture spawn" } });
    console.error(`[AudioCapture NEW] process SPAWN ERROR:`, err);
  });
  systemAudioProcess.stdout?.on("data", (d) => {
    const out = d.toString().trim();
    const lines = out.split("\n");
    for (const line of lines) {
      if (line.trim().startsWith("CHUNK_READY:")) {
        const finishedPath = line.replace("CHUNK_READY:", "").trim();
        if (existsSync(finishedPath)) {
          try {
            const buffer = readFileSync(finishedPath);
            unlinkSync(finishedPath);
            console.log(`[IPC main] Successfully read ${buffer.length} bytes from ${finishedPath}`);
            if (currentChunkPromiseResolve) {
              currentChunkPromiseResolve(new Uint8Array(buffer));
              currentChunkPromiseResolve = null;
            }
          } catch (err) {
            Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
              extra: { context: "Reading finished audio chunk" }
            });
            console.error(`[IPC main] Failed to read ${finishedPath}`, err);
            if (currentChunkPromiseResolve) {
              currentChunkPromiseResolve(null);
              currentChunkPromiseResolve = null;
            }
          }
        } else {
          console.warn(`[IPC main] System audio file did NOT exist: ${finishedPath}`);
          if (currentChunkPromiseResolve) {
            currentChunkPromiseResolve(null);
            currentChunkPromiseResolve = null;
          }
        }
      } else if (line.trim() !== "") {
        console.log(`[AudioCapture] ${line.trim()}`);
      }
    }
  });

  systemAudioProcess.stderr?.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) Sentry.captureMessage(`[AudioCapture ERR] ${msg}`, "error");
    console.error(`[AudioCapture ERR] ${msg}`);
  });
  systemAudioProcess.on("close", (code) => {
    console.log(`[AudioCapture NEW] process exited with code ${code}`);
    if (currentChunkPromiseResolve) {
      currentChunkPromiseResolve(null);
      currentChunkPromiseResolve = null;
    }
  });

  return "started";
});

ipcMain.handle("chunk-system-audio", async () => {
  if (!systemAudioProcess) return null;

  console.log("[IPC main] Requesting contiguous chunk (SIGUSR1)...");

  return new Promise((resolve) => {
    currentChunkPromiseResolve = resolve;
    systemAudioProcess?.kill("SIGUSR1");

    // Safety timeout just in case it hangs
    setTimeout(() => {
      if (currentChunkPromiseResolve === resolve) {
        console.warn("[IPC main] SIGUSR1 chunk timeout reached.");
        resolve(null);
        currentChunkPromiseResolve = null;
      }
    }, 3000);
  });
});

ipcMain.handle("stop-system-audio", async () => {
  if (!systemAudioProcess) return null;

  console.log("[IPC main] Stopping system audio capture (SIGTERM)...");

  return new Promise((resolve) => {
    currentChunkPromiseResolve = resolve;
    systemAudioProcess?.kill("SIGTERM");

    const proc = systemAudioProcess;
    systemAudioProcess = null;

    // Force kill if it hangs
    setTimeout(() => {
      try {
        proc?.kill("SIGKILL");
      } catch {
        /* ignored */
      }
      if (currentChunkPromiseResolve === resolve) {
        resolve(null);
        currentChunkPromiseResolve = null;
      }
    }, 1500);
  });
});

ipcMain.on("simulate-main-crash", () => {
  console.log("[IPC main] Received simulate-main-crash. Crashing process natively via process.crash()...");
  process.crash();
});

// ─── Dual-Track Auto Updater ──────────────────────────────────────────────────
function setupAutoUpdater() {
  if (process.mas) {
    const checkMasUpdate = async () => {
      try {
        const backendUrl = "https://app.planai.dev"; // Real prod domain for soft check
        const response = await fetch(`${backendUrl}/api/version/desktop/latest`);
        if (!response.ok) return;
        const result = await response.json();
        const latestVersion = result?.data?.version;
        const updateUrl = result?.data?.url;
        const currentVersion = app.getVersion();

        if (latestVersion && latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("mas-update-available", { version: latestVersion, url: updateUrl });
          }
        }
      } catch (err) {
        console.error("Failed to check MAS updates:", err);
      }
    };
    checkMasUpdate();
    setInterval(checkMasUpdate, 24 * 60 * 60 * 1000); // Check every 24 hours
  } else {
    autoUpdater.logger = console;

    autoUpdater.on("update-available", (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ota-update-available", info);
      }
    });

    autoUpdater.on("download-progress", (progressObj) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ota-download-progress", progressObj);
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ota-update-downloaded", info);
      }
    });

    try {
      autoUpdater.checkForUpdatesAndNotify();
      setInterval(() => {
        try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { }
      }, 24 * 60 * 60 * 1000);
    } catch (e) {
      console.error("Auto updater silent failure", e);
    }
  }
}
