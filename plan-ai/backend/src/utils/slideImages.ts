import {
  DISPLAY_URL_TTL_MS,
  objectPathOf,
  signedUrlForPath,
  storageUri,
} from "../firebase/privateStorage";

/**
 * Slide images are private files (presentations/...). The slides JSON stores
 * the gs:// reference; readers get a signed link, and whatever a client sends
 * back is turned into the reference again before it is saved, so a stored
 * deck never holds a link that expires.
 */

const SLIDE_IMAGE_PREFIX = "presentations/";

const mapStrings = async (
  value: unknown,
  fn: (s: string) => Promise<string> | string,
): Promise<unknown> => {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return Promise.all(value.map((v) => mapStrings(v, fn)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await mapStrings(v, fn);
    return out;
  }
  return value;
};

const slideImagePath = (s: string): string | null => {
  if (!s.startsWith("gs://") && !s.startsWith("https://")) return null;
  const path = objectPathOf(s);
  return path && path.startsWith(SLIDE_IMAGE_PREFIX) ? path : null;
};

/** Replaces stored slide image references with signed links for display. */
export async function signSlideImages<T>(slidesJson: T): Promise<T> {
  const cache = new Map<string, string>();
  return (await mapStrings(slidesJson, async (s) => {
    if (!s.startsWith("gs://")) return s;
    const path = slideImagePath(s);
    if (!path) return s;
    if (!cache.has(path)) cache.set(path, await signedUrlForPath(path, DISPLAY_URL_TTL_MS));
    return cache.get(path)!;
  })) as T;
}

/** Turns signed links to our slide images back into stored references. */
export async function unsignSlideImages<T>(slidesJson: T): Promise<T> {
  return (await mapStrings(slidesJson, (s) => {
    if (!s.startsWith("https://")) return s;
    const path = slideImagePath(s);
    // Old images were public; their plain URL stays as it was.
    return path && s.includes("X-Goog-Signature") ? storageUri(path) : s;
  })) as T;
}
