import * as Crypto from "expo-crypto";
import { Buffer } from "buffer";

const toBase64Url = (base64: string): string =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Random text in base64url, no padding. 32 bytes give 43 characters. */
export const randomBase64Url = (bytes: number): string =>
  toBase64Url(Buffer.from(Crypto.getRandomBytes(bytes)).toString("base64"));

/**
 * PKCE pair for the Microsoft sign-in. The verifier stays in memory; only the
 * challenge, base64url(SHA-256(verifier)), goes to the server at the start.
 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(32);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(digest) };
}

/** Query parameters of a URL, decoded. Ignores the fragment. */
export function queryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const start = url.indexOf("?");
  if (start < 0) return params;
  const end = url.indexOf("#", start);
  const query = url.slice(start + 1, end < 0 ? undefined : end);
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      params[decodeURIComponent(key.replace(/\+/g, " "))] = decodeURIComponent(
        value.replace(/\+/g, " "),
      );
    } catch {
      // A malformed escape: skip that pair.
    }
  }
  return params;
}
