import { decryptSecret, encryptSecret } from "./secretCrypto";

/**
 * The BYOK keys of a Workspace (openRouterKey, deepgramKey, openaiKey) are
 * stored encrypted (see secretCrypto.ts). Reads that use a key go through
 * withDecryptedWorkspaceKeys, writes through encryptWorkspaceKeys. A check
 * like "is a key set?" can stay on the stored value.
 */

export const WORKSPACE_SECRET_FIELDS = ["openRouterKey", "deepgramKey", "openaiKey"] as const;

type WorkspaceKeyFields = {
  openRouterKey?: unknown;
  deepgramKey?: unknown;
  openaiKey?: unknown;
};

/** Returns a copy of the workspace row with its BYOK keys decrypted. */
export function withDecryptedWorkspaceKeys<T extends WorkspaceKeyFields>(row: T): T;
export function withDecryptedWorkspaceKeys<T extends WorkspaceKeyFields>(row: T | null): T | null;
export function withDecryptedWorkspaceKeys<T extends WorkspaceKeyFields>(row: T | null): T | null {
  if (!row) return row;
  const copy: WorkspaceKeyFields = { ...row };
  for (const field of WORKSPACE_SECRET_FIELDS) {
    const value = copy[field];
    if (typeof value === "string") copy[field] = decryptSecret(value);
  }
  return copy as T;
}

/**
 * Returns a copy of a Prisma workspace write payload with the BYOK keys
 * encrypted, both as plain values and as `{ set: value }`. Null and
 * undefined are left as they are.
 */
export function encryptWorkspaceKeys<T extends WorkspaceKeyFields>(data: T): T {
  const copy: WorkspaceKeyFields = { ...data };
  for (const field of WORKSPACE_SECRET_FIELDS) {
    if (field in copy) copy[field] = encryptWriteValue(copy[field]);
  }
  return copy as T;
}

/** Encrypts a Prisma write value given as a string or as `{ set: string }`. */
export const encryptWriteValue = (value: unknown): unknown => {
  if (typeof value === "string") return encryptSecret(value);
  if (value && typeof value === "object" && "set" in value) {
    const set = (value as { set: unknown }).set;
    if (typeof set === "string") return { ...value, set: encryptSecret(set) };
  }
  return value;
};
