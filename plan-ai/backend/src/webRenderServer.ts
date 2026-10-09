import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { assertSafeUrl } from "./utils/ssrfGuard";
import { openWebRenderer } from "./services/webRenderService";

/**
 * The web render service: a headless Chromium behind one endpoint.
 *
 * It is the same image as the backend, started with another command
 * (`node dist/webRenderServer.js`) as a service of its own. The reason is
 * that Chromium's sandbox cannot start inside a container, so a page that
 * broke out of the renderer would run as this process. In the backend that
 * process holds the database, the storage and every key. Here it holds
 * nothing: this service is given a token and no other secret, so the
 * container is the sandbox.
 *
 * It still sits on the private network next to the database, so every request
 * a page makes goes through the SSRF guard, as it does inside the backend.
 *
 *   POST /render   { "url": "https://example.com" }   Authorization: Bearer <WEB_RENDER_TOKEN>
 *   GET  /health
 */

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.WEB_RENDER_TOKEN?.trim() ?? "";
const MAX_BODY_BYTES = 8 * 1024;

// Names of variables that mean this process could reach customer data.
const SECRETS = [
  "DATABASE_URL",
  "FIREBASE_SERVICE_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "STRIPE_SECRET_KEY",
  "SECRETS_ENCRYPTION_KEY",
  "REDIS_URL",
  "QDRANT_API_KEY",
];

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
};

const authorized = (header: string | undefined): boolean => {
  const given = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(TOKEN);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

async function handleRender(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let url: string;
  try {
    const body = JSON.parse(await readBody(req)) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("no url");
    url = assertSafeUrl(body.url).toString();
  } catch {
    send(res, 400, { error: "Send a JSON body with a public http or https url." });
    return;
  }

  // A fresh browser for each page, closed when the page is read. One at a
  // time: openWebRenderer queues the rest.
  const renderer = await openWebRenderer();
  if (!renderer) {
    send(res, 503, { error: "The browser could not start." });
    return;
  }
  try {
    const page = await renderer.render(url);
    send(res, 200, { page });
  } finally {
    await renderer.close();
  }
}

export function createWebRenderServer(): http.Server {
  return http.createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true });
      return;
    }
    if (req.method !== "POST" || path !== "/render") {
      send(res, 404, { error: "Not found" });
      return;
    }
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { error: "Unauthorized" });
      return;
    }
    handleRender(req, res).catch((err: unknown) => {
      console.error("[web-render] request failed:", (err as Error)?.message ?? err);
      if (!res.headersSent) send(res, 500, { error: "Render failed" });
    });
  });
}

if (require.main === module) {
  if (TOKEN.length < 24) {
    console.error(
      "[web-render] WEB_RENDER_TOKEN is missing or shorter than 24 characters. Not starting.",
    );
    process.exit(1);
  }
  const present = SECRETS.filter((name) => process.env[name]);
  if (present.length > 0) {
    // The whole point of this service is to hold nothing worth stealing.
    console.error(
      `[web-render] This service must not be given secrets. Remove: ${present.join(", ")}. Not starting.`,
    );
    process.exit(1);
  }
  // "::" also takes IPv4. Railway's private network is IPv6.
  createWebRenderServer().listen(PORT, "::", () => {
    console.log(`[web-render] listening on ${PORT}`);
  });
}
