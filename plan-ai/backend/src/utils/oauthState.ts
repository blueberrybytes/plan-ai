import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Signed OAuth `state` for the integrations that did not have one (Google
 * Drive, OneDrive). Their state was plain base64 JSON and the callback trusted
 * the workspaceId inside it, so anyone who knew a workspace id could link
 * their own Drive to that workspace and receive its exports. The signature
 * proves the server issued the state to an admin of that workspace, and the
 * state expires after 10 minutes.
 *
 * Each flow signs with its own `purpose`. Without it, a state issued for one
 * flow (say, a member connecting their calendar) would pass the check of
 * another (linking the workspace Drive) when both use the same key.
 */

export const OAUTH_STATE_MAX_AGE_MS = 10 * 60_000;

/** A path inside the web app, or undefined. Blocks redirects to other hosts. */
export const safeRedirectPath = (path: unknown): string | undefined => {
  if (typeof path !== "string" || !path || path.length > 500) return undefined;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return undefined;
  return path;
};

const sign = (secret: string, purpose: string, payload: string) =>
  createHmac("sha256", secret).update(`${purpose}\n${payload}`).digest("base64url");

export function createOAuthState(
  purpose: string,
  payload: Record<string, unknown>,
  secret: string,
): string {
  if (!secret) throw new Error("OAuth is not configured on this server");
  const serialized = JSON.stringify({ ...payload, nonce: randomUUID(), issuedAt: Date.now() });
  return `${Buffer.from(serialized).toString("base64url")}.${sign(secret, purpose, serialized)}`;
}

/** The state payload when the signature and age check out, else null. */
export function readOAuthState<T extends Record<string, unknown>>(
  purpose: string,
  token: string | undefined,
  secret: string,
  maxAgeMs = OAUTH_STATE_MAX_AGE_MS,
): (T & { issuedAt: number }) | null {
  if (!token || !secret) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const serialized = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(sign(secret, purpose, serialized));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const parsed = JSON.parse(serialized) as T & { issuedAt?: number };
    if (typeof parsed.issuedAt !== "number" || Date.now() - parsed.issuedAt > maxAgeMs) {
      return null;
    }
    return parsed as T & { issuedAt: number };
  } catch {
    return null;
  }
}
