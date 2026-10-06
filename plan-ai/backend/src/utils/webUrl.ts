/**
 * A web address as people type it ("example.com", " www.example.com/docs ")
 * turned into a full URL. Returns null when it cannot be one.
 *
 * Only tidies the text. Whether the address may be fetched is decided by the
 * SSRF guard at fetch time.
 */
export function normalizeWebUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  // Another scheme (ftp:, mailto:, javascript:) is not a web page.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    // "localhost:8080" also looks like a scheme. Let the URL parser decide below.
    if (!/^[^/:]+:\d+(\/|$)/.test(trimmed)) return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}
