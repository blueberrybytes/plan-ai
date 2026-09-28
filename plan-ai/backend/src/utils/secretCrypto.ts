import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encryption at rest for the secrets we keep for customers: workspace API
 * keys (BYOK) and integration OAuth tokens. They used to sit in Postgres as
 * plain text, so anyone with a database dump could use them.
 *
 * AES-256-GCM with the key in SECRETS_ENCRYPTION_KEY (32 bytes, base64;
 * generate one with `openssl rand -base64 32`). Stored format:
 *
 *   enc:v1:<iv>:<auth tag>:<ciphertext>   (each part base64url)
 *
 * A value without the prefix is read as plain text, so rows written before
 * this existed keep working until `yarn secrets:encrypt` rewrites them.
 * Without SECRETS_ENCRYPTION_KEY, new values are stored as plain text and a
 * warning is logged once: a private install that has not set the key yet
 * keeps working instead of failing to save settings.
 */

const PREFIX = "enc:v1:";
let warnedMissingKey = false;

/**
 * A secret that cannot be encrypted or read: missing or wrong key, damaged
 * value. Callers must not treat it like "no key configured" and fall back to
 * the platform's own keys.
 */
export class SecretCryptoError extends Error {}

const parseKey = (raw: string | undefined, name: string): Buffer | null => {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new SecretCryptoError(`${name} must be 32 bytes, base64 encoded`);
  }
  return key;
};

const encryptionKey = (): Buffer | null =>
  parseKey(process.env.SECRETS_ENCRYPTION_KEY, "SECRETS_ENCRYPTION_KEY");

/**
 * The key used before a rotation. Values it sealed are still read, and
 * `yarn secrets:encrypt` rewrites them with the current key. Remove it once
 * the script reports nothing left to rotate.
 */
const previousKey = (): Buffer | null =>
  parseKey(process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS, "SECRETS_ENCRYPTION_KEY_PREVIOUS");

export const isEncryptedSecret = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PREFIX);

/** True when new secrets will be encrypted (the key is configured). */
export const secretEncryptionEnabled = (): boolean => encryptionKey() !== null;

export function encryptSecret(plain: string): string;
export function encryptSecret(plain: string | null | undefined): string | null | undefined;
export function encryptSecret(plain: string | null | undefined): string | null | undefined {
  if (plain === null || plain === undefined || plain === "" || isEncryptedSecret(plain)) {
    return plain;
  }
  const key = encryptionKey();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[secretCrypto] SECRETS_ENCRYPTION_KEY is not set: secrets are stored as plain text.",
      );
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(stored: string): string;
export function decryptSecret(stored: string | null | undefined): string | null | undefined;
export function decryptSecret(stored: string | null | undefined): string | null | undefined {
  if (stored === null || stored === undefined || !isEncryptedSecret(stored)) return stored;
  const keys = [encryptionKey(), previousKey()].filter((k): k is Buffer => k !== null);
  if (keys.length === 0) {
    throw new SecretCryptoError(
      "A stored secret is encrypted but SECRETS_ENCRYPTION_KEY is not set",
    );
  }
  for (const key of keys) {
    const plain = openWith(key, stored);
    if (plain !== null) return plain;
  }
  throw new SecretCryptoError(
    "A stored secret does not decrypt with SECRETS_ENCRYPTION_KEY" +
      (keys.length > 1 ? " or SECRETS_ENCRYPTION_KEY_PREVIOUS" : ""),
  );
}

/** True when a value was sealed with the previous key and should be rewritten. */
export function sealedWithPreviousKey(stored: string | null | undefined): boolean {
  if (!isEncryptedSecret(stored)) return false;
  const current = encryptionKey();
  const previous = previousKey();
  if (!previous) return false;
  if (current && openWith(current, stored) !== null) return false;
  return openWith(previous, stored) !== null;
}

/** The plain text, or null when this key does not open the value. */
function openWith(key: Buffer, stored: string): string | null {
  const [ivPart, tagPart, dataPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !tagPart || dataPart === undefined) {
    throw new SecretCryptoError("Malformed encrypted secret");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
