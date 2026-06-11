/**
 * Module-level in-memory cache for slide images loaded via the backend proxy.
 *
 * Why module-level? React component state is destroyed when a slide unmounts
 * (i.e. when you navigate to another slide). A Map at module scope survives
 * the entire browser session so navigating back to a slide with an image never
 * re-fetches the proxy endpoint.
 *
 * Shape: url → Promise<string>
 *   - The promise resolves to a data-URI string (or the original URL as fallback).
 *   - Storing the promise (not the resolved value) prevents parallel in-flight
 *     duplicate fetches: if two components request the same URL simultaneously,
 *     only one network call is made.
 */
const cache = new Map<string, Promise<string>>();

const backendUrl = (): string => (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/+$/, "");

/**
 * Returns a data-URI for the given image URL, routing through the backend proxy
 * when the URL is remote (http/https). Results are cached indefinitely in-memory.
 */
export const fetchProxiedSlideImage = (url: string): Promise<string> => {
  if (!url) return Promise.resolve("");

  // Non-remote URLs (data URIs, relative paths) — return as-is, still cache.
  if (!url.startsWith("http")) {
    if (!cache.has(url)) cache.set(url, Promise.resolve(url));
    return cache.get(url)!;
  }

  if (!cache.has(url)) {
    const promise = fetch(`${backendUrl()}/api/proxy/image?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Proxy responded ${res.status}`);
        return res.json();
      })
      .then((data: { mimeType: string; base64: string }) => {
        return `data:${data.mimeType};base64,${data.base64}`;
      })
      .catch((e) => {
        // Evict on failure so a future attempt can retry (e.g. transient network error).
        cache.delete(url);
        console.warn("[slideImageCache] proxy failed, falling back to direct URL", e);
        return url;
      });

    cache.set(url, promise);
  }

  return cache.get(url)!;
};
