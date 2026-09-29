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
  powerMonitor,
  protocol,
  safeStorage,
  webContents as allWebContents,
} from "electron";
import * as path from "path";
import { join } from "path";
import { fileURLToPath } from "url";
import {
  readFileSync,
  existsSync,
  unlinkSync,
  copyFileSync,
  chmodSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { promises as fsPromises } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess, execFile } from "child_process";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";
import { autoUpdater } from "electron-updater";
import * as Sentry from "@sentry/electron/main";

// Content-Security-Policy of the production renderer, built from the env in
// electron.vite.config.ts. Sent as a header on every app:// HTML response.
declare const __RENDERER_CSP__: string;

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

// ─── Renderer origin ─────────────────────────────────────────────────────────
// The packaged renderer is served from app://recorder instead of file://, so it
// has a real origin: CORS, storage and permissions all key off it. The backend
// CORS allowlist must contain APP_ORIGIN. In development the renderer comes
// from the electron-vite dev server instead.
const APP_SCHEME = "app";
const APP_HOST = "recorder";
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
// Ignored in packaged builds: an environment variable must not be able to
// load another page into the window that has the preload API.
const DEV_RENDERER_URL = app.isPackaged ? undefined : process.env["ELECTRON_RENDERER_URL"];
const DEV_RENDERER_ORIGIN = DEV_RENDERER_URL ? new URL(DEV_RENDERER_URL).origin : null;

// Same idea as the fuses in electron-builder.config.js: a release build must
// not be drivable from outside. A debugging port would give any local program
// the renderer and its preload API.
if (
  app.isPackaged &&
  (app.commandLine.hasSwitch("remote-debugging-port") ||
    app.commandLine.hasSwitch("remote-debugging-pipe"))
) {
  console.error("[main] Remote debugging is not allowed in a packaged build. Exiting.");
  app.exit(1);
}

// Must run before the app is ready. Sentry registers its own scheme first and
// merges it with this list.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/**
 * True when `value` (a URL or an origin) belongs to the renderer. Node's URL
 * gives "null" as the origin of custom schemes, so scheme and host are
 * compared directly.
 */
function isRendererUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST) return true;
  return DEV_RENDERER_ORIGIN !== null && url.origin === DEV_RENDERER_ORIGIN;
}

// What the renderer uses: microphone and system audio (media, display-capture),
// "copy" buttons, meeting notifications and fullscreen.
const RENDERER_PERMISSIONS = new Set<string>([
  "media",
  "display-capture",
  "clipboard-sanitized-write",
  "notifications",
  "fullscreen",
]);

// Only these schemes may be handed to the OS. Anything else (file:, smb:,
// custom app schemes) could launch a local program.
const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

function openExternalSafely(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    console.warn("[external] Refused to open a malformed URL");
    return;
  }
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
    console.warn(`[external] Refused to open a ${url.protocol} URL`);
    return;
  }
  shell.openExternal(url.toString()).catch((err) => {
    console.error("[external] openExternal failed:", err);
  });
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** Serves the built renderer (dist-electron/renderer) on app://recorder/. */
function registerAppProtocol(): void {
  const root = path.resolve(__dirname, "../renderer");
  protocol.handle(APP_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (url.host !== APP_HOST) return new Response(null, { status: 404 });

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (pathname.includes("\0")) return new Response(null, { status: 400 });
    if (pathname === "/" || pathname === "") pathname = "/index.html";

    // Refuse anything that resolves outside the renderer folder.
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) return new Response(null, { status: 404 });

    try {
      const body = await fsPromises.readFile(file);
      const ext = path.extname(file).toLowerCase();
      const headers: Record<string, string> = {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      };
      if (ext === ".html") headers["Content-Security-Policy"] = __RENDERER_CSP__;
      return new Response(new Uint8Array(body), { status: 200, headers });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

// ─── One-time move of renderer storage from file:// to app://recorder ────────
// Up to 4.4 the renderer ran from file://. Storage is kept per origin, so the
// move to app://recorder would sign every user out and hide the unsaved
// meetings kept for crash recovery. Before the first app:// load, this copies
// localStorage and the Firebase session (IndexedDB) to the new origin, then
// clears the old copy. It runs once; a failure is retried on the next launch.
const STORAGE_MIGRATION_MARKER = "storage-migrated-to-app-origin";
const STORAGE_MIGRATION_PAGE = "storage-migration.html";

// Runs in a file:// page. Reads localStorage and the rows Firebase Auth keeps
// in IndexedDB ({ fbase_key, value }).
const READ_LEGACY_STORAGE_JS = `(async () => {
  const local = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) local[key] = localStorage.getItem(key);
  }
  const auth = await new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open("firebaseLocalStorageDb");
    } catch (e) {
      resolve([]);
      return;
    }
    // The database does not exist: abort instead of creating it.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve([]);
    request.onblocked = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
        db.close();
        resolve([]);
        return;
      }
      const all = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
      all.onsuccess = () => { db.close(); resolve(all.result || []); };
      all.onerror = () => { db.close(); resolve([]); };
    };
  });
  return { local, auth };
})()`;

// Runs in an app:// page. Keys already present are left alone. The Firebase
// user goes into localStorage under its own key: on start, Firebase Auth finds
// it there and moves it into its IndexedDB store.
const writeStorageJs = (data: string) => `((data) => {
  let written = 0;
  for (const [key, value] of Object.entries(data.local || {})) {
    if (typeof value === "string" && localStorage.getItem(key) === null) {
      localStorage.setItem(key, value);
      written++;
    }
  }
  for (const row of data.auth || []) {
    if (row && typeof row.fbase_key === "string" && localStorage.getItem(row.fbase_key) === null) {
      localStorage.setItem(row.fbase_key, JSON.stringify(row.value));
      written++;
    }
  }
  return written;
})(${data})`;

const CLEAR_LEGACY_STORAGE_JS = `(async () => {
  localStorage.clear();
  await new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase("firebaseLocalStorageDb");
      request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return true;
})()`;

let storageMigrationRunning = false;

async function migrateFileOriginStorage(): Promise<void> {
  const marker = path.join(app.getPath("userData"), STORAGE_MIGRATION_MARKER);
  if (existsSync(marker)) return;
  storageMigrationRunning = true;

  const hiddenWindow = () =>
    new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
  let reader: BrowserWindow | null = null;
  let writer: BrowserWindow | null = null;
  try {
    reader = hiddenWindow();
    await reader.loadFile(join(__dirname, "../renderer", STORAGE_MIGRATION_PAGE));
    const legacy = (await reader.webContents.executeJavaScript(READ_LEGACY_STORAGE_JS)) as {
      local: Record<string, string>;
      auth: unknown[];
    };
    const entries = Object.keys(legacy.local ?? {}).length + (legacy.auth?.length ?? 0);

    if (entries > 0) {
      writer = hiddenWindow();
      await writer.loadURL(`${APP_ORIGIN}/${STORAGE_MIGRATION_PAGE}`);
      const written = await writer.webContents.executeJavaScript(
        writeStorageJs(JSON.stringify(legacy)),
      );
      // localStorage reaches disk with a delay. Flush before the old copy goes,
      // or a crash right now would lose both.
      session.defaultSession.flushStorageData();
      // The old copy goes only once the new one is in place.
      await reader.webContents.executeJavaScript(CLEAR_LEGACY_STORAGE_JS);
      console.log(`[storage-migration] Copied ${written} of ${entries} entries to ${APP_ORIGIN}`);
    }
    session.defaultSession.flushStorageData();
    writeFileSync(marker, new Date().toISOString(), { mode: 0o600 });
  } catch (err) {
    console.error("[storage-migration] Failed, will retry on next launch:", err);
  } finally {
    reader?.destroy();
    writer?.destroy();
    storageMigrationRunning = false;
  }
}

const AUTH_CALLBACK_PORT = 4321;

let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let pendingAuthCode: string | null = null;
let tray: Tray | null = null;
let systemAudioProcess: ChildProcess | null = null;

// ─── Desktop login state ─────────────────────────────────────────────────────
// Every login the recorder starts gets a random state. The web page sends it
// back with the one-time code, and a callback is accepted only when its state
// matches the pending one. Without it, any page could push its own code to the
// recorder and sign it into someone else's account (login CSRF).
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
let pendingAuthState: { value: string; createdAt: number } | null = null;
let pendingAuthUrl: string | null = null;

function isAuthStatePending(): boolean {
  return (
    pendingAuthState !== null && Date.now() - pendingAuthState.createdAt <= AUTH_STATE_TTL_MS
  );
}

function stateMatches(state: string | null): boolean {
  if (!state || !isAuthStatePending()) return false;
  const expected = Buffer.from(pendingAuthState!.value);
  const received = Buffer.from(state);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Checks the state and burns it on success, so a callback works once. */
function consumeAuthState(state: string | null): boolean {
  if (!stateMatches(state)) return false;
  pendingAuthState = null;
  pendingAuthUrl = null;
  return true;
}

/** Starts a login: new state, and the web URL that carries it. */
function beginDesktopAuth(): string {
  const state = randomBytes(32).toString("base64url");
  pendingAuthState = { value: state, createdAt: Date.now() };

  const webAppUrl = (import.meta.env.VITE_PLAN_AI_WEB_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  // /auth/desktop keeps the state in the tab's sessionStorage while the user
  // goes through /login, then sends it back with the code.
  const url = new URL(`${webAppUrl}/auth/desktop`);
  url.searchParams.set("desktop_auth", "true");
  url.searchParams.set("state", state);
  if (!app.isPackaged) {
    url.searchParams.set("local_port", String(AUTH_CALLBACK_PORT));
  }
  pendingAuthUrl = url.toString();
  return pendingAuthUrl;
}

/**
 * Development only. Receives the login code from the web page over
 * http://127.0.0.1:4321, because custom protocol dispatch is unreliable when
 * the app is not a real macOS bundle. Packaged builds use the deep link.
 *
 * Flow: DesktopCallback.tsx, then GET /auth?code=...&state=..., then renderer.
 */
function startAuthCallbackServer(): void {
  const allowedHosts = new Set([`127.0.0.1:${AUTH_CALLBACK_PORT}`, `localhost:${AUTH_CALLBACK_PORT}`]);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // A rebinding DNS name pointing at 127.0.0.1 would send another Host.
    if (!allowedHosts.has(req.headers.host ?? "")) {
      res.writeHead(421);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${AUTH_CALLBACK_PORT}`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (url.pathname === "/auth-cancel") {
      res.writeHead(204);
      res.end();
      // Only the page that holds the pending state can cancel the login.
      if (!stateMatches(url.searchParams.get("state"))) {
        console.warn("[auth-server] cancellation ignored: state does not match");
        return;
      }
      console.log("[auth-server] cancellation received");
      pendingAuthState = null;
      pendingAuthUrl = null;
      if (authWindow) {
        authWindow.close();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("desktop-auth-cancelled");
      }
    } else if (url.pathname === "/auth") {
      const code = url.searchParams.get("code");
      const accepted = !!code && handleAuthCallback(code, url.searchParams.get("state"));
      console.log("[auth-server] callback received, accepted:", accepted);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!accepted) {
        res.writeHead(400);
        res.end(
          "<html><body style=\"font-family: sans-serif; padding: 2rem\"><h2>Sign-in link not valid</h2><p>Start the sign-in again from Plan AI Recorder.</p></body></html>",
        );
        return;
      }
      res.writeHead(200);
      res.end(
        `<html>
<head><title>Plan AI — Authenticated</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f1117; color: #fff; }
  .card { text-align: center; padding: 2rem; }
  h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #aaa; margin-bottom: 1.5rem; }
  kbd { background: #222; border: 1px solid #444; border-radius: 4px; padding: 2px 8px; font-size: 0.9rem; }
  button { background: #6c63ff; color: #fff; border: none; border-radius: 8px; padding: 0.6rem 1.4rem; font-size: 1rem; cursor: pointer; }
</style>
</head>
<body>
  <div class="card">
    <h2>✅ Signed in successfully!</h2>
    <p>You can return to the Plan AI Recorder app.<br>Press <kbd>⌘ W</kbd> to close this tab.</p>
    <button onclick="window.close()">Close Tab</button>
  </div>
  <script>
    // Works if tab was opened via window.open(); silently fails if via external link
    setTimeout(() => { try { window.close(); } catch(e) {} }, 300);
  </script>
</body>
</html>`,
      );
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
    console.log(`[auth-server] Listening on http://127.0.0.1:${AUTH_CALLBACK_PORT}`);
  });
}

function setupProtocol(): void {
  console.log("[protocol] process.defaultApp:", process.defaultApp);
  console.log("[protocol] process.argv:", process.argv);
  console.log("[protocol] process.execPath:", process.execPath);
  console.log("[protocol] PROTOCOL:", PROTOCOL);
  console.log("[protocol] BASE_PROTOCOL:", BASE_PROTOCOL);

  // In dev mode, actively remove any stale registration of the PROD protocol
  // that may have been left by older dev builds (before the -dev suffix was added).
  // This prevents the dev Electron binary from intercepting production deep links.
  if (!app.isPackaged && PROTOCOL !== BASE_PROTOCOL) {
    const removed = app.removeAsDefaultProtocolClient(BASE_PROTOCOL);
    console.log(`[protocol] Removed stale prod protocol registration (${BASE_PROTOCOL}):`, removed);
  }

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

      // The renderer's Content-Security-Policy is sent by the app:// handler
      // (and a meta tag in index.html). Nothing is injected into other
      // responses: the auth window shows the web app and Apple pages with
      // their own policies.
      callback({ responseHeaders: headers });
    });

    // Permissions go to the renderer only. The auth window shows remote pages
    // in this same session and gets none of them.
    sess.setPermissionRequestHandler((_contents, permission, callback, details) => {
      const granted =
        RENDERER_PERMISSIONS.has(permission) && isRendererUrl(details.requestingUrl);
      if (!granted) {
        console.warn(`[permissions] Denied "${permission}" request`);
      }
      callback(granted);
    });
    sess.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      return RENDERER_PERMISSIONS.has(permission) && isRendererUrl(requestingOrigin);
    });

    // Required in Electron 31+ to allow getDisplayMedia to actually trigger the OS-level Screen Recording prompt
    sess.setDisplayMediaRequestHandler((request, callback) => {
      const requester = request.frame ? allWebContents.fromFrame(request.frame) : undefined;
      const fromMainWindow =
        !!requester &&
        !!mainWindow &&
        !mainWindow.isDestroyed() &&
        requester.id === mainWindow.webContents.id &&
        isRendererUrl(request.securityOrigin);
      if (!fromMainWindow) {
        console.warn("[setDisplayMediaRequestHandler] Denied a request from outside the main window");
        callback({});
        return;
      }
      desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
        // Automatically accept the first screen just to satisfy the API and trigger the macOS prompt
        callback({ video: sources[0] });
      }).catch((err) => {
        console.error("[setDisplayMediaRequestHandler] Failed to get sources:", err);
        callback({}); // No stream rejects the request
      });
    });
  };

  // Strip from default session
  configureSession(session.defaultSession);
  // Strip from any newly created sessions
  app.on("session-created", configureSession);
}

/**
 * Delivers a login code to the renderer, but only when `state` matches the
 * login this app started. Returns whether the callback was accepted. The code
 * itself is never logged.
 */
function handleAuthCallback(code: string, state: string | null): boolean {
  if (!consumeAuthState(state)) {
    console.warn(
      `[auth] Rejected a login callback: ${state ? "state does not match" : "no state"} (pending login: ${isAuthStatePending()})`,
    );
    // Tell the login screen, so it does not wait forever. Only when a login was
    // started (still valid or expired but not cleared): a stray link must not
    // change the UI.
    if (pendingAuthState !== null && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop-auth-rejected");
    }
    return false;
  }

  console.log("[auth] Login callback accepted, sending the code to the renderer");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop-auth-code", code);
    mainWindow.show();
    mainWindow.focus();
  } else {
    // The window was closed (macOS keeps the app alive). Deliver on next load.
    pendingAuthCode = code;
  }
  if (authWindow) {
    authWindow.close();
  }
  return true;
}

/** Callback URLs: "<protocol>://auth?code=..&state=.." or the dev server's /auth. */
function isAuthCallbackUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith(`${PROTOCOL}://`)) return true;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === String(AUTH_CALLBACK_PORT) &&
      url.pathname === "/auth"
    );
  } catch {
    return false;
  }
}

function handleProtocolUrl(rawUrl: string) {
  // "blueberrybytes-recorder://auth?code=XYZ&state=ABC" (or the brand's
  // protocol), or the dev callback URL caught inside the Apple auth window.
  try {
    if (!isAuthCallbackUrl(rawUrl)) {
      console.warn("[protocol] Ignored a URL that is not a login callback");
      return;
    }
    const url = new URL(rawUrl);
    const code = url.searchParams.get("code");
    if (!code) {
      console.warn("[protocol] Login callback without a code");
      return;
    }
    handleAuthCallback(code, url.searchParams.get("state"));
  } catch (err) {
    console.error("[protocol] Failed to parse the login callback URL:", err);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0b0d11",
    icon: join(__dirname, "../../resources/icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  if (DEV_RENDERER_URL) {
    mainWindow.loadURL(DEV_RENDERER_URL);
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  // The window only ever shows the renderer. Links that try to navigate it
  // (a markdown link, a stray href) open in the system browser instead.
  mainWindow.webContents.on("will-navigate", (event) => {
    if (isRendererUrl(event.url)) return;
    event.preventDefault();
    openExternalSafely(event.url);
  });
  mainWindow.webContents.on("will-redirect", (event) => {
    if (isRendererUrl(event.url)) return;
    event.preventDefault();
    console.warn("[main] Blocked a redirect away from the renderer");
  });

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
    openExternalSafely(url);
    return { action: "deny" };
  });

  // Unsaved-meeting close guard, main-process side. The renderer arms a
  // `beforeunload` handler while a meeting is unsaved; when it blocks a close,
  // Electron fires this event. Without a handler the window just silently
  // refuses to close — which reads as "the app is frozen" and invites a
  // Force Quit (losing the meeting anyway). Show a real choice instead.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    if (!mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["Keep meeting", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      title: "Unsaved meeting",
      message: "You have an unsaved meeting.",
      detail:
        "If you close now, the transcript stays recoverable on next launch, but the audio files will be lost.",
    });
    if (choice === 1) {
      // User explicitly chose to close — bypass the beforeunload block.
      event.preventDefault();
    }
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
    // argv may hold a login callback with its one-time code: never log it.
    console.log("[lock] second-instance fired, args:", argv.length);
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupProtocol();
    registerAppProtocol();
    setupSession();
    prepareRecoveryRoot();
    if (!app.isPackaged) startAuthCallbackServer();
    if (!DEV_RENDERER_URL) await migrateFileOriginStorage();
    createWindow();
    setupMenu();
    startMicActivityPolling();
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    // The storage migration opens and closes hidden windows before the main
    // window exists. That must not quit the app.
    if (storageMigrationRunning || BrowserWindow.getAllWindows().length > 0) return;
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
  // The URL carries a one-time login code: log the scheme only.
  console.log("[protocol] open-url fired:", url.split(":")[0]);
  event.preventDefault();
  handleProtocolUrl(url);
});

// No window may embed a <webview>: it would get its own, unchecked preferences.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

ipcMain.handle("clear-auth-session", async () => {
  console.log("[Desktop Auth] [SESSION WIPE] Erasing defaultSession cookies/storage to force fresh logins...");
  try {
    const cookiesBefore = await session.defaultSession.cookies.get({});
    console.log(`[Desktop Auth] [SESSION WIPE] Cookies present before wipe: ${cookiesBefore.length}`);

    // Burn the third-party sign-in sessions (Apple, Google, Microsoft) but keep
    // the app's own storage: it holds unsaved meetings and settings. Firebase's
    // own session is cleared by signOut() in the renderer.
    await session.defaultSession.clearData({
      dataTypes: ["cookies", "localStorage", "indexedDB", "cache", "serviceWorkers"],
      excludeOrigins: [APP_ORIGIN],
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

/**
 * Hosts the Apple sign-in in the internal auth window may show: the web app,
 * the Firebase auth handler and Apple's pages. "about:blank" is how Firebase
 * opens its popup before navigating it.
 */
function isAppleAuthFlowUrl(rawUrl: string): boolean {
  if (rawUrl === "" || rawUrl === "about:blank") return true;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !app.isPackaged)) return false;
  const webAppHost = (() => {
    try {
      return new URL(import.meta.env.VITE_PLAN_AI_WEB_URL ?? "http://localhost:3000").host;
    } catch {
      return "";
    }
  })();
  const firebaseAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "";
  return (
    url.host === webAppHost ||
    (firebaseAuthDomain !== "" && url.hostname === firebaseAuthDomain) ||
    url.hostname === "apple.com" ||
    url.hostname.endsWith(".apple.com")
  );
}

// The web URL of the login in progress, for the "Copy Auth Link" button.
ipcMain.handle("get-desktop-auth-url", () => (isAuthStatePending() ? pendingAuthUrl : null));

ipcMain.handle("open-desktop-auth", (_event, _provider?: string) => {
  // APPLE REQUIREMENT (App Store Guideline 4):
  // "Sign in with Apple should always be completed without leaving the app"
  if (_provider === "apple") {
    if (authWindow) {
      authWindow.focus();
      return;
    }
    const authUrl = beginDesktopAuth();

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
        sandbox: true,
        webviewTag: false,
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
    // navigating to the firebaseapp.com handler, so about:blank must stay allowed.
    // Popups stay in-app (Guideline 4) but only for the hosts of the Apple flow.
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAppleAuthFlowUrl(url)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              webviewTag: false,
            },
          },
        };
      }
      console.warn("[Internal Auth Window] Popup outside the Apple sign-in flow sent to the browser");
      openExternalSafely(url);
      return { action: "deny" };
    });

    // Callback URLs end the flow. Other navigations must stay on the web app,
    // Firebase or Apple; anything else goes to the system browser.
    const guardAuthNavigation = (
      event: Electron.Event,
      url: string,
      onCallback: () => void,
    ) => {
      if (isAuthCallbackUrl(url)) {
        event.preventDefault();
        console.log("[Internal Auth Window] Intercepted the login callback");
        handleProtocolUrl(url);
        onCallback();
        return;
      }
      if (!isAppleAuthFlowUrl(url)) {
        event.preventDefault();
        console.warn("[Internal Auth Window] Blocked a navigation outside the Apple sign-in flow");
        openExternalSafely(url);
      }
    };

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

      // The popup never needs a popup of its own.
      childWindow.webContents.setWindowOpenHandler(({ url }) => {
        openExternalSafely(url);
        return { action: "deny" };
      });

      const destroyChild = () => {
        if (!childWindow.isDestroyed()) childWindow.destroy();
      };
      childWindow.webContents.on("will-redirect", (event) =>
        guardAuthNavigation(event, event.url, destroyChild),
      );
      childWindow.webContents.on("will-navigate", (event) =>
        guardAuthNavigation(event, event.url, destroyChild),
      );
    });

    // Intercept redirects back to our custom Protocol or Localhost
    authWindow.webContents.on("will-redirect", (event) =>
      guardAuthNavigation(event, event.url, () => undefined),
    );
    authWindow.webContents.on("will-navigate", (event) =>
      guardAuthNavigation(event, event.url, () => undefined),
    );

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
    openExternalSafely(beginDesktopAuth());
  }
});

// IPC: Open a URL in the default browser. Only https, http and mailto.
ipcMain.handle("open-external-url", (_event, url: unknown) => {
  if (typeof url === "string" && url) openExternalSafely(url);
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

  const proc = spawn(bundledBinaryPath, [basePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  systemAudioProcess = proc;

  console.log(`[IPC main] Spawning: ${bundledBinaryPath}`);
  systemAudioProcess.on("error", (err) => {
    Sentry.captureException(err, { extra: { context: "AudioCapture spawn" } });
    console.error(`[AudioCapture NEW] process SPAWN ERROR:`, err);
    if (systemAudioProcess === proc) systemAudioProcess = null;
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
    // A dead process must not stay registered: every later chunk request
    // would signal nothing and wait out its 3 s timeout, for the rest of the
    // recording.
    if (systemAudioProcess === proc) systemAudioProcess = null;
    if (currentChunkPromiseResolve) {
      currentChunkPromiseResolve(null);
      currentChunkPromiseResolve = null;
    }
  });

  return "started";
});

ipcMain.handle("chunk-system-audio", async () => {
  if (!systemAudioProcess) return null;
  // One rotation at a time. A second request used to overwrite the pending
  // resolver, so the first promise never settled (one leaked request per
  // overlap) and its chunk went to the wrong caller.
  if (currentChunkPromiseResolve) return null;

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

// ─── Encryption of local recovery data ───────────────────────────────────────
// Unsaved transcripts (renderer localStorage) and the recovery audio below are
// sealed with AES-256-GCM. The 32-byte key is random per install and is kept
// on disk wrapped by safeStorage (Keychain on macOS, DPAPI on Windows, the
// secret service on Linux). If safeStorage is not available, data is written
// in plain text as before, so crash recovery keeps working.
const LOCAL_DATA_KEY_FILE = "local-data.key";
const SEALED_TEXT_PREFIX = "plan-enc:v1:";
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
let localDataKeyCache: Buffer | null | undefined;

function localDataKey(): Buffer | null {
  if (localDataKeyCache !== undefined) return localDataKeyCache;
  if (!app.isReady()) return null;
  localDataKeyCache = null;
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[local-data] safeStorage is not available, recovery data stays unencrypted");
      return null;
    }
    const file = path.join(app.getPath("userData"), LOCAL_DATA_KEY_FILE);
    if (existsSync(file)) {
      // A key that cannot be unwrapped is left in place. The keychain may just
      // be locked, and a new key would make older data unreadable for good.
      const key = Buffer.from(safeStorage.decryptString(readFileSync(file)), "base64");
      if (key.length !== 32) throw new Error("stored key has the wrong length");
      localDataKeyCache = key;
      return key;
    }
    const key = randomBytes(32);
    writeFileSync(file, safeStorage.encryptString(key.toString("base64")), { mode: 0o600 });
    localDataKeyCache = key;
    return key;
  } catch (err) {
    console.error("[local-data] Could not load the encryption key:", err);
    return null;
  }
}

/** iv (12 bytes), then the GCM tag (16), then the ciphertext. */
function sealBytes(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function openBytes(key: Buffer, sealed: Buffer): Buffer | null {
  if (sealed.length < GCM_IV_BYTES + GCM_TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, GCM_IV_BYTES));
    decipher.setAuthTag(sealed.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES));
    return Buffer.concat([
      decipher.update(sealed.subarray(GCM_IV_BYTES + GCM_TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

// Synchronous on purpose: the renderer's crash-recovery store is localStorage,
// which is synchronous. A transcript is a few hundred KB at most.
ipcMain.on("local-data-seal", (event, text: unknown) => {
  const key =
    typeof text === "string" && isRendererUrl(event.senderFrame?.url) ? localDataKey() : null;
  event.returnValue = key
    ? SEALED_TEXT_PREFIX + sealBytes(key, Buffer.from(text as string, "utf8")).toString("base64")
    : null;
});

ipcMain.on("local-data-open", (event, sealed: unknown) => {
  if (
    typeof sealed !== "string" ||
    !sealed.startsWith(SEALED_TEXT_PREFIX) ||
    !isRendererUrl(event.senderFrame?.url)
  ) {
    event.returnValue = null;
    return;
  }
  const key = localDataKey();
  const plain = key
    ? openBytes(key, Buffer.from(sealed.slice(SEALED_TEXT_PREFIX.length), "base64"))
    : null;
  event.returnValue = plain ? plain.toString("utf8") : null;
});

// ─── Crash-safe copy of the recording's audio ────────────────────────────────
// The renderer keeps the recording in memory until it uploads it, so a crash
// used to leave only the live transcript text to recover. Each MediaRecorder
// chunk is also appended here, one folder per recording session, and deleted
// once the backend confirms the save (or the user discards the recovery).
//
// With a local data key, each chunk is sealed on its own and stored as a
// frame: a 4-byte big-endian length, then the sealed bytes. A crash can only
// tear the last frame, and reading stops there. "<track>.webm" files are the
// plain-text copies written by older versions or without a key.
const RECOVERY_SESSION_ID = /^[a-zA-Z0-9-]{8,64}$/;
const RECOVERY_TRACKS = new Set(["mic", "sys"]);
const recoveryAppendChains = new Map<string, Promise<void>>();

function recoveryRoot(): string {
  return path.join(app.getPath("userData"), "recording-recovery");
}

function recoveryDir(sessionId: string): string | null {
  return RECOVERY_SESSION_ID.test(sessionId) ? path.join(recoveryRoot(), sessionId) : null;
}

function recoveryFiles(
  sessionId: string,
  track: string,
): { plain: string; sealed: string } | null {
  const dir = recoveryDir(sessionId);
  if (!dir || !RECOVERY_TRACKS.has(track)) return null;
  return { plain: path.join(dir, `${track}.webm`), sealed: path.join(dir, `${track}.enc`) };
}

/**
 * Owner-only access for the recovery folder, including folders and files
 * written by older versions with the default modes. Best effort.
 */
function prepareRecoveryRoot(): void {
  if (process.platform === "win32") return;
  try {
    const root = recoveryRoot();
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) {
      const dir = path.join(root, name);
      try {
        chmodSync(dir, 0o700);
        for (const file of readdirSync(dir)) {
          chmodSync(path.join(dir, file), 0o600);
        }
      } catch {
        /* not a session folder, or gone meanwhile */
      }
    }
  } catch (err) {
    console.warn("[recovery] Could not restrict the recovery folder:", err);
  }
}

async function fileSize(file: string): Promise<number> {
  try {
    return (await fsPromises.stat(file)).size;
  } catch {
    return 0;
  }
}

async function readRecoveryTrack(files: { plain: string; sealed: string }): Promise<Uint8Array | null> {
  const sealed = await fsPromises.readFile(files.sealed).catch(() => null);
  if (sealed) {
    const key = localDataKey();
    if (!key) return null;
    const parts: Buffer[] = [];
    let offset = 0;
    while (offset + 4 <= sealed.length) {
      const length = sealed.readUInt32BE(offset);
      const end = offset + 4 + length;
      if (end > sealed.length) break; // torn last write
      const plain = openBytes(key, sealed.subarray(offset + 4, end));
      if (!plain) break;
      parts.push(plain);
      offset = end;
    }
    return parts.length > 0 ? new Uint8Array(Buffer.concat(parts)) : null;
  }
  try {
    return new Uint8Array(await fsPromises.readFile(files.plain));
  } catch {
    return null;
  }
}

ipcMain.handle(
  "recovery-audio-append",
  async (event, sessionId: string, track: string, data: Uint8Array) => {
    const files = recoveryFiles(sessionId, track);
    if (!files || !(data instanceof Uint8Array) || !isRendererUrl(event.senderFrame?.url)) {
      return false;
    }
    // Appends for one file run in order: IPC handlers run concurrently and a
    // reordered chunk would corrupt the WebM stream.
    const previous = recoveryAppendChains.get(files.plain) ?? Promise.resolve();
    const next = previous.then(async () => {
      await fsPromises.mkdir(path.dirname(files.plain), { recursive: true, mode: 0o700 });
      const key = localDataKey();
      // A track keeps the format it started with, so one file never mixes both.
      if (key && !existsSync(files.plain)) {
        const frame = sealBytes(key, Buffer.from(data));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(frame.length);
        await fsPromises.appendFile(files.sealed, Buffer.concat([length, frame]), { mode: 0o600 });
      } else {
        await fsPromises.appendFile(files.plain, Buffer.from(data), { mode: 0o600 });
      }
    });
    const settled = next.catch((err) => {
      console.error(`[recovery] append failed for ${files.plain}:`, err);
    });
    recoveryAppendChains.set(files.plain, settled);
    void settled.then(() => {
      if (recoveryAppendChains.get(files.plain) === settled) {
        recoveryAppendChains.delete(files.plain);
      }
    });
    try {
      await next;
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle("recovery-audio-info", async (_event, sessionId: string) => {
  const mic = recoveryFiles(sessionId, "mic");
  const sys = recoveryFiles(sessionId, "sys");
  if (!mic || !sys) return { micBytes: 0, sysBytes: 0 };
  // Sealed sizes include 32 bytes per chunk; close enough for the size checks.
  const size = async (files: { plain: string; sealed: string }) =>
    (await fileSize(files.sealed)) || (await fileSize(files.plain));
  return { micBytes: await size(mic), sysBytes: await size(sys) };
});

ipcMain.handle("recovery-audio-read", async (event, sessionId: string) => {
  if (!isRendererUrl(event.senderFrame?.url)) return { mic: null, sys: null };
  const read = async (track: string): Promise<Uint8Array | null> => {
    const files = recoveryFiles(sessionId, track);
    return files ? readRecoveryTrack(files) : null;
  };
  return { mic: await read("mic"), sys: await read("sys") };
});

ipcMain.handle("recovery-audio-delete", async (_event, sessionId: string) => {
  const dir = recoveryDir(sessionId);
  if (!dir) return false;
  await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  return true;
});

// Deletes every session folder except the ones still listed as recoverable
// (orphans from saves whose cleanup failed, or recoveries the user discarded).
ipcMain.handle("recovery-audio-prune", async (_event, keepSessionIds: string[]) => {
  // A key file that cannot be opened now (keychain locked or denied) means the
  // renderer could not read every record: deleting audio would lose meetings.
  if (existsSync(path.join(app.getPath("userData"), LOCAL_DATA_KEY_FILE)) && !localDataKey()) {
    console.warn("[recovery] Local data key unavailable, skipping the audio prune");
    return 0;
  }
  const keep = new Set(Array.isArray(keepSessionIds) ? keepSessionIds : []);
  let entries: string[] = [];
  try {
    entries = await fsPromises.readdir(recoveryRoot());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (keep.has(name) || !RECOVERY_SESSION_ID.test(name)) continue;
    await fsPromises
      .rm(path.join(recoveryRoot(), name), { recursive: true, force: true })
      .then(() => {
        removed += 1;
      })
      .catch(() => undefined);
  }
  return removed;
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
  // Development only: in a release build any page script could kill the app.
  if (app.isPackaged) {
    console.warn("[IPC main] simulate-main-crash ignored in a packaged build");
    return;
  }
  console.log("[IPC main] Received simulate-main-crash. Crashing process natively via process.crash()...");
  process.crash();
});

ipcMain.handle("quit-and-install", () => {
  console.log("[IPC main] Received quit-and-install. Restarting app...");
  autoUpdater.quitAndInstall();
});

// ─── Dual-Track Auto Updater ──────────────────────────────────────────────────
// Many users never quit or restart for weeks, so checking only at launch means
// they sit on stale builds. We poll on an interval AND re-check on wake from
// sleep — crucially, setInterval does NOT fire reliably while the machine is
// asleep (the laptop-lid-closed-for-the-night case), so powerMonitor's "resume"
// is what actually catches those long-idle sessions. A throttle keeps frequent
// sleep/wake cycles from hammering the update server.
const UPDATE_POLL_INTERVAL_MS = 3 * 60 * 60 * 1000; // poll every 3 hours
const UPDATE_MIN_GAP_MS = 30 * 60 * 1000; // never check more than ~twice an hour

function setupAutoUpdater() {
  let lastCheckAt = 0;

  // Wraps a check with throttling + logging so every trigger (startup, interval,
  // resume) shares one rate limit and we can see in logs why a check ran.
  const guardedCheck = (run: () => void, reason: string) => {
    const now = Date.now();
    if (now - lastCheckAt < UPDATE_MIN_GAP_MS) {
      console.log(`[AutoUpdater] skip check (${reason}) — throttled`);
      return;
    }
    lastCheckAt = now;
    console.log(`[AutoUpdater] checking for updates (${reason})`);
    try {
      run();
    } catch (e) {
      console.error(`[AutoUpdater] check failed (${reason})`, e);
    }
  };

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

    const trigger = (reason: string) => guardedCheck(() => void checkMasUpdate(), reason);
    trigger("startup");
    setInterval(() => trigger("interval"), UPDATE_POLL_INTERVAL_MS);
    powerMonitor.on("resume", () => trigger("resume-from-sleep"));
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

    const trigger = (reason: string) =>
      guardedCheck(() => autoUpdater.checkForUpdatesAndNotify(), reason);
    trigger("startup");
    setInterval(() => trigger("interval"), UPDATE_POLL_INTERVAL_MS);
    powerMonitor.on("resume", () => trigger("resume-from-sleep"));
  }
}
