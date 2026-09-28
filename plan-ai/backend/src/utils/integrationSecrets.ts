import { decryptSecret } from "./secretCrypto";
import { encryptWriteValue } from "./workspaceSecrets";

/**
 * OAuth tokens and API keys of WorkspaceIntegration and UserIntegration rows
 * are stored encrypted (see secretCrypto.ts). Every read that uses a token
 * goes through withDecryptedTokens, and every write through encryptTokens.
 * Both only touch the token fields that are present, so they also work on
 * rows loaded with a `select`.
 */

type TokenFields = {
  accessToken?: string | null;
  refreshToken?: string | null;
};

/** Returns a copy of the row with accessToken and refreshToken decrypted. */
export function withDecryptedTokens<T extends TokenFields>(row: T): T;
export function withDecryptedTokens<T extends TokenFields>(row: T | null): T | null;
export function withDecryptedTokens<T extends TokenFields>(row: T | null): T | null {
  if (!row) return row;
  const copy: TokenFields = { ...row };
  if (typeof copy.accessToken === "string") copy.accessToken = decryptSecret(copy.accessToken);
  if (typeof copy.refreshToken === "string") copy.refreshToken = decryptSecret(copy.refreshToken);
  return copy as T;
}

/**
 * Returns a copy of a Prisma write payload with accessToken and refreshToken
 * encrypted, both as plain values and as `{ set: value }`. Null and undefined
 * are left as they are.
 */
export function encryptTokens<T extends { accessToken?: unknown; refreshToken?: unknown }>(
  data: T,
): T {
  const copy: { accessToken?: unknown; refreshToken?: unknown } = { ...data };
  if ("accessToken" in copy) copy.accessToken = encryptWriteValue(copy.accessToken);
  if ("refreshToken" in copy) copy.refreshToken = encryptWriteValue(copy.refreshToken);
  return copy as T;
}
