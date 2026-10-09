import { randomUUID } from "node:crypto";
import { safeAxios } from "../utils/ssrfGuard";
import { uploadWithDownloadUrl } from "../firebase/privateStorage";
import { logger } from "../utils/logger";

/**
 * Brand logos picked from a website ("Analyze website") arrive as the address
 * of an image on someone else's server. Kept like that, the logo breaks where
 * the browser needs the other site's permission to read it (the Word export,
 * the PowerPoint export) and disappears the day that site moves the file.
 * So the image is copied to our storage when the theme is saved.
 */

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};
const OUR_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

/** True for an http(s) address that is not already in our storage. */
export function isExternalLogo(logoUrl: string | null | undefined): logoUrl is string {
  if (!logoUrl) return false;
  try {
    const url = new URL(logoUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && !OUR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The logo's address after copying it to our storage. When the copy cannot be
 * made (not an image, too large, unreachable) the original address comes
 * back: a logo that works in some places is better than none.
 */
export async function adoptLogo(
  userId: string,
  logoUrl: string | null | undefined,
): Promise<string | null | undefined> {
  if (!isExternalLogo(logoUrl)) return logoUrl;
  try {
    const response = await safeAxios.get<ArrayBuffer>(logoUrl, {
      responseType: "arraybuffer",
      timeout: 10_000,
      maxContentLength: MAX_LOGO_BYTES,
      headers: { Accept: "image/*" },
    });
    const contentType = String(response.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = TYPES[contentType];
    const data = Buffer.from(response.data);
    if (!extension || data.length === 0 || data.length > MAX_LOGO_BYTES) {
      logger.warn(`[BrandLogo] Not copied: type "${contentType}", ${data.length} bytes`);
      return logoUrl;
    }
    return await uploadWithDownloadUrl(
      `themes/${userId}/logos/${randomUUID()}.${extension}`,
      data,
      contentType,
    );
  } catch (err) {
    logger.warn(`[BrandLogo] Not copied: ${(err as Error).message}`);
    return logoUrl;
  }
}
