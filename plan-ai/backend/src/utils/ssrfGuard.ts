import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import axios, { type AxiosInstance } from "axios";
import { Agent as UndiciAgent } from "undici";

/**
 * Every request to a URL a user can influence (website import, the image
 * proxy, the assistant's web tool, a self-hosted Jira or Twenty) goes through
 * here, so it can never reach the server's own network: localhost, the cloud
 * metadata address, the Railway private network or any private range.
 *
 * The address is checked when the socket connects, after DNS, so a name that
 * resolves to a private IP (or changes between two lookups) is refused too.
 * IP literals skip DNS, so URLs and every redirect are checked as well.
 *
 * Private installs that talk to an internal Jira or Twenty list those hosts
 * in SSRF_ALLOWED_HOSTS, or turn the check off with
 * SSRF_ALLOW_PRIVATE_NETWORKS=true.
 */

export class SsrfBlockedError extends Error {
  readonly status = 400;
  constructor(message = "That address is not reachable from Plan AI.") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const allowAllPrivate = (): boolean => process.env.SSRF_ALLOW_PRIVATE_NETWORKS === "true";

const allowedHosts = (): Set<string> =>
  new Set(
    (process.env.SSRF_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain", ".home.arpa"];

const ipv4ToInt = (ip: string): number =>
  ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

const inV4Range = (ip: string, base: string, bits: number): boolean => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
};

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, carrier NAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return PRIVATE_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  if (family !== 6) return true;

  const lower = ip.toLowerCase();
  // IPv4 inside IPv6 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d).
  const embedded = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) return isPrivateAddress(embedded[1]);
  if (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:")) return true;
  if (lower === "::" || lower === "::1") return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

const hostAllowed = (hostname: string): boolean =>
  allowAllPrivate() || allowedHosts().has(hostname.toLowerCase());

/** Checks scheme and host of a URL before any request. Throws SsrfBlockedError. */
export function assertSafeUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : raw;
  } catch {
    throw new SsrfBlockedError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Only http and https addresses are allowed.");
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("Addresses with a user name or password are not allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostAllowed(host)) return url;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfBlockedError();
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new SsrfBlockedError();
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** A dns.lookup that refuses private addresses. Used when sockets connect. */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions | number | LookupCallback,
  maybeCallback?: LookupCallback,
): void {
  const callback = (typeof options === "function" ? options : maybeCallback) as LookupCallback;
  const opts: dns.LookupOptions =
    typeof options === "object" ? options : typeof options === "number" ? { family: options } : {};

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err, opts.all ? [] : "");
    const list = addresses as dns.LookupAddress[];
    if (!hostAllowed(hostname) && list.some((a) => isPrivateAddress(a.address))) {
      return callback(new SsrfBlockedError() as NodeJS.ErrnoException, opts.all ? [] : "");
    }
    if (opts.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(new Error(`No address for ${hostname}`), "");
    callback(null, first.address, first.family);
  });
}

const httpAgent = new http.Agent({ lookup: guardedLookup as never, keepAlive: true });
const httpsAgent = new https.Agent({ lookup: guardedLookup as never, keepAlive: true });

/**
 * axios for user-supplied URLs. Redirects are followed (at most 3) and each
 * target is checked again.
 */
export const safeAxios: AxiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  proxy: false,
  maxRedirects: 3,
  beforeRedirect: (options: { hostname?: string; protocol?: string; href?: string }) => {
    assertSafeUrl(options.href ?? `${options.protocol}//${options.hostname}`);
  },
});
safeAxios.interceptors.request.use((config) => {
  assertSafeUrl(axios.getUri(config));
  return config;
});

const dispatcher = new UndiciAgent({ connect: { lookup: guardedLookup as never } });
const MAX_FETCH_REDIRECTS = 3;

/**
 * fetch for user-supplied URLs, with the same checks on every redirect.
 * Same signature as the global fetch, so it drops in where fetch was used.
 */
export async function safeFetch(
  input: string | URL,
  init: globalThis.RequestInit = {},
): Promise<globalThis.Response> {
  let url = assertSafeUrl(input);
  for (let hop = 0; ; hop++) {
    // The global fetch (not undici's own export) so tests that stub it keep
    // working; Node's fetch accepts the undici dispatcher.
    const res = await globalThis.fetch(url.toString(), {
      ...init,
      dispatcher,
      redirect: "manual",
    } as globalThis.RequestInit);
    const location = res.headers?.get?.("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (hop >= MAX_FETCH_REDIRECTS) throw new SsrfBlockedError("Too many redirects.");
    url = assertSafeUrl(new URL(location, url));
  }
}
