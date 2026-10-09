import fs from "node:fs";
import type { Browser, HTTPRequest, Page } from "puppeteer-core";
import { safeAxios } from "../utils/ssrfGuard";
import { logger } from "../utils/logger";

/**
 * Reads a web page the way a visitor sees it, by running its JavaScript in a
 * headless Chromium. Used by the website import for sites whose HTML is an
 * empty shell that a script fills in (React, Vue and similar apps).
 *
 * The browser opens addresses that users type, so it is treated as hostile:
 *
 *  - It has no network of its own. Every request the page makes is answered
 *    by this process through the same SSRF guard as the rest of the scraper,
 *    so a page cannot reach the server's private network.
 *  - WebSockets, WebRTC, service workers and beacons are removed from the
 *    page, because they do not go through request interception.
 *  - Images, fonts, styles and media are not loaded: only the text matters.
 *  - Each import gets a fresh browser with an empty profile, started with an
 *    environment that holds none of the server's secrets, and closed at the end.
 *  - One browser at a time, with limits on time, requests and bytes.
 *
 * Chromium's own sandbox stays on. Some container hosts do not allow it; in
 * that case the browser does not start and the import falls back to what the
 * static HTML gives. `WEB_RENDER_ALLOW_NO_SANDBOX=true` lets it start without
 * the sandbox: a page that breaks out of the renderer then runs as this
 * service's user. Read the note in .env.template before turning it on.
 */

const NAVIGATION_TIMEOUT_MS = 20_000;
const SETTLE_MS = 800;
const MAX_REQUESTS_PER_PAGE = 150;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_PAGE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const BLOCKED_TYPES = new Set(["image", "media", "font", "stylesheet", "texttrack", "manifest"]);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CANDIDATE_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** The Chromium to run, or null when this machine has none. */
export function findChromium(): string | null {
  const configured = process.env.CHROMIUM_PATH?.trim();
  const paths = configured ? [configured] : CANDIDATE_PATHS;
  return paths.find((p) => fs.existsSync(p)) ?? null;
}

export interface RenderedPage {
  url: string;
  title: string;
  /** The page's HTML after its scripts ran. */
  html: string;
  /** The text a visitor reads. */
  text: string;
  /** Links to other pages of the same site. */
  links: string[];
}

export interface WebRenderer {
  render(url: string): Promise<RenderedPage | null>;
  close(): Promise<void>;
}

// One browser at a time for the whole process: Chromium takes a few hundred
// megabytes and an import is not urgent.
let queue: Promise<unknown> = Promise.resolve();

const LAUNCH_ARGS = [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-default-apps",
  "--no-first-run",
  "--mute-audio",
  "--hide-scrollbars",
  // No direct network path for anything interception does not see.
  "--disable-features=WebRtc,ServiceWorker,WebBluetooth,WebUSB",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
];

async function launch(executablePath: string): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  const options = {
    executablePath,
    headless: true,
    // The browser gets none of this service's environment: no keys, no tokens.
    env: { PATH: process.env.PATH ?? "", HOME: "/tmp", TMPDIR: "/tmp", LANG: "en_US.UTF-8" },
    timeout: 30_000,
  };
  try {
    return await puppeteer.launch({ ...options, args: LAUNCH_ARGS });
  } catch (err) {
    if (process.env.WEB_RENDER_ALLOW_NO_SANDBOX !== "true") throw err;
    logger.warn(
      `[WebRender] Chromium did not start with its sandbox (${(err as Error).message.split("\n")[0]}). Starting without it, as WEB_RENDER_ALLOW_NO_SANDBOX allows.`,
    );
    return puppeteer.launch({
      ...options,
      args: [...LAUNCH_ARGS, "--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

/** Answers one request of the page from this process, through the SSRF guard. */
async function answer(request: HTTPRequest, budget: { requests: number; bytes: number }) {
  const url = request.url();
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) {
    return request.continue();
  }
  if (!/^https?:\/\//i.test(url) || BLOCKED_TYPES.has(request.resourceType())) {
    return request.abort("blockedbyclient");
  }
  budget.requests += 1;
  if (budget.requests > MAX_REQUESTS_PER_PAGE || budget.bytes > MAX_PAGE_BYTES) {
    return request.abort("blockedbyclient");
  }
  try {
    const headers = { ...request.headers() };
    // Set by this process for the real connection.
    for (const name of ["host", "content-length", "connection", "accept-encoding"]) {
      delete headers[name];
    }
    const response = await safeAxios.request<ArrayBuffer>({
      url,
      method: request.method(),
      headers,
      data: request.postData(),
      responseType: "arraybuffer",
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      // The browser follows redirects itself, so each hop comes back through
      // here and is checked, and the page ends up at its real address.
      maxRedirects: 0,
      // The page decides what a 404 or a 500 means, not axios.
      validateStatus: () => true,
    });
    const body = Buffer.from(response.data);
    budget.bytes += body.length;
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(response.headers)) {
      // The body is already decoded and has a new length.
      if (["content-encoding", "content-length", "transfer-encoding"].includes(name)) continue;
      // A page may not be framed or may pin its scripts. Neither matters here.
      if (name === "content-security-policy" || name === "x-frame-options") continue;
      if (typeof value === "string") responseHeaders[name] = value;
      else if (Array.isArray(value)) responseHeaders[name] = value.join(", ");
    }
    return request.respond({ status: response.status, headers: responseHeaders, body });
  } catch {
    // Blocked by the guard, timed out or too large. The page goes on without it.
    return request.abort("failed");
  }
}

async function preparePage(page: Page): Promise<{ requests: number; bytes: number }> {
  const budget = { requests: 0, bytes: 0 };
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 900 });
  // These talk to the network without passing through request interception.
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const name of [
      "WebSocket",
      "EventSource",
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
      "WebTransport",
      "SharedWorker",
    ]) {
      try {
        delete w[name];
        Object.defineProperty(w, name, { value: undefined, configurable: false });
      } catch {
        /* already gone */
      }
    }
    try {
      Object.defineProperty(navigator, "sendBeacon", { value: () => false });
      Object.defineProperty(navigator, "serviceWorker", { value: undefined });
    } catch {
      /* not defined in this context */
    }
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void answer(request, budget).catch(() => undefined);
  });
  // A page that asks questions gets no answer and no chance to block.
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
  return budget;
}

async function renderWith(browser: Browser, url: string): Promise<RenderedPage | null> {
  const page = await browser.newPage();
  try {
    await preparePage(page);
    await page.goto(url, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT_MS });
    // Let the framework paint what the last response brought.
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const snapshot = await page.evaluate(() => {
      const origin = location.origin;
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => {
          try {
            const u = new URL((a as HTMLAnchorElement).href, location.href);
            u.hash = "";
            return u.origin === origin ? u.toString() : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      return {
        title: document.title,
        html: document.documentElement.outerHTML,
        text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim(),
        links: Array.from(new Set(links)),
      };
    });
    return { url, ...snapshot };
  } catch (err) {
    logger.warn(`[WebRender] Could not render ${url}: ${(err as Error).message.split("\n")[0]}`);
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

const REMOTE_TIMEOUT_MS = 60_000;

/** A renderer that asks the web render service, when one is configured. */
function remoteRenderer(): WebRenderer | null {
  const base = process.env.WEB_RENDER_URL?.trim().replace(/\/$/, "");
  const token = process.env.WEB_RENDER_TOKEN?.trim();
  if (!base || !token) return null;
  return {
    render: async (url) => {
      try {
        // Our own service on the private network: plain fetch, not the guard,
        // which exists to refuse exactly that kind of address.
        const response = await fetch(`${base}/render`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
        });
        if (!response.ok) {
          logger.warn(`[WebRender] The render service answered ${response.status} for ${url}`);
          return null;
        }
        const body = (await response.json()) as { page?: RenderedPage | null };
        return body.page ?? null;
      } catch (err) {
        logger.warn(`[WebRender] The render service did not answer: ${(err as Error).message}`);
        return null;
      }
    },
    close: async () => undefined,
  };
}

/**
 * Opens a browser for one import. Returns null when this machine has no
 * Chromium or it cannot start, so the caller keeps what it already has.
 * Waits its turn when another import is rendering.
 */
export async function openWebRenderer(): Promise<WebRenderer | null> {
  // With a render service configured the browser runs there, in a container
  // that holds no secrets (see webRenderServer.ts), and never in this process.
  const remote = remoteRenderer();
  if (remote) return remote;

  const executablePath = findChromium();
  if (!executablePath) {
    logger.info("[WebRender] No Chromium on this machine. Pages are read from their HTML only.");
    return null;
  }
  let release: () => void = () => undefined;
  const turn = queue;
  queue = new Promise<void>((resolve) => (release = resolve));
  await turn;

  let browser: Browser;
  try {
    browser = await launch(executablePath);
  } catch (err) {
    release();
    logger.warn(`[WebRender] Chromium did not start: ${(err as Error).message.split("\n")[0]}`);
    return null;
  }
  let closed = false;
  return {
    render: (url) => renderWith(browser, url),
    close: async () => {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => undefined);
      release();
    },
  };
}
