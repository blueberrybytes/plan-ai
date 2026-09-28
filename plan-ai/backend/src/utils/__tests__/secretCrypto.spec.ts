import { randomBytes } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  sealedWithPreviousKey,
  SecretCryptoError,
  secretEncryptionEnabled,
} from "../secretCrypto";
import { encryptTokens, withDecryptedTokens } from "../integrationSecrets";
import { encryptWorkspaceKeys, withDecryptedWorkspaceKeys } from "../workspaceSecrets";

/**
 * Customer API keys and OAuth tokens are encrypted at rest with
 * SECRETS_ENCRYPTION_KEY. These tests pin the stored format, that old plain
 * text rows keep working, and that a damaged value or the wrong key fails
 * loudly instead of handing garbage to a provider.
 */

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const ORIGINAL_KEY = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = KEY_A;
});

afterEach(() => {
  delete process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS;
  if (ORIGINAL_KEY === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

/** Replaces one character of a base64url part of an encrypted value. */
const tamper = (stored: string, part: "iv" | "tag" | "data"): string => {
  const [enc, v1, iv, tag, data] = stored.split(":");
  const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  const parts = { iv, tag, data, [part]: flip({ iv, tag, data }[part]) };
  return [enc, v1, parts.iv, parts.tag, parts.data].join(":");
};

describe("encryptSecret and decryptSecret", () => {
  it("round trips a value through the enc:v1 format", () => {
    const plain = "sk-or-v1-abcdef0123456789";
    const stored = encryptSecret(plain);

    expect(stored).toMatch(/^enc:v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain(plain);
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(decryptSecret(stored)).toBe(plain);
  });

  it("round trips unicode and long values", () => {
    const plain = "clé-🔑-".repeat(200);
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("uses a fresh IV, so the same value never gives the same ciphertext", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("does not encrypt a value twice", () => {
    const once = encryptSecret("token");
    expect(encryptSecret(once)).toBe(once);
  });

  it("passes null, undefined and empty strings through", () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret(undefined)).toBeUndefined();
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeUndefined();
    expect(decryptSecret("")).toBe("");
  });

  it("reads plain text rows written before encryption existed", () => {
    expect(decryptSecret("sk-or-v1-legacy")).toBe("sk-or-v1-legacy");
    expect(decryptSecret("apikey:token")).toBe("apikey:token");
  });

  it.each(["iv", "tag", "data"] as const)("rejects a value whose %s was changed", (part) => {
    const stored = encryptSecret("jira-access-token");
    expect(() => decryptSecret(tamper(stored, part))).toThrow();
  });

  it("rejects a malformed value", () => {
    expect(() => decryptSecret("enc:v1:only-one-part")).toThrow(/Malformed/);
  });

  it("rejects a value encrypted with another key", () => {
    const stored = encryptSecret("deepgram-key");
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("refuses a key that is not 32 bytes", () => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    expect(() => secretEncryptionEnabled()).toThrow(/32 bytes/);
  });
});

describe("without SECRETS_ENCRYPTION_KEY", () => {
  it("stores new values as plain text and warns once", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    vi.resetModules();
    const fresh = await import("../secretCrypto");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(fresh.secretEncryptionEnabled()).toBe(false);
    expect(fresh.encryptSecret("sk-or-v1-plain")).toBe("sk-or-v1-plain");
    expect(fresh.encryptSecret("second")).toBe("second");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fresh.decryptSecret("sk-or-v1-plain")).toBe("sk-or-v1-plain");
  });

  it("fails on an encrypted value instead of returning ciphertext", () => {
    const stored = encryptSecret("linear-token");
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(secretEncryptionEnabled()).toBe(false);
    expect(() => decryptSecret(stored)).toThrow(/SECRETS_ENCRYPTION_KEY is not set/);
  });

  it("treats an empty variable as not set", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "  ";
    expect(secretEncryptionEnabled()).toBe(false);
  });
});

describe("key rotation", () => {
  it("reads values sealed with the previous key and flags them for rewriting", () => {
    const old = encryptSecret("deepgram-key");
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B;
    process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    expect(decryptSecret(old)).toBe("deepgram-key");
    expect(sealedWithPreviousKey(old)).toBe(true);

    const fresh = encryptSecret("deepgram-key");
    expect(sealedWithPreviousKey(fresh)).toBe(false);
    delete process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS;
    expect(decryptSecret(fresh)).toBe("deepgram-key");
  });

  it("fails with a typed error when no key opens the value", () => {
    const stored = encryptSecret("x");
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(stored)).toThrow(SecretCryptoError);
  });
});

describe("row helpers", () => {
  it("encrypts integration tokens for a write and decrypts them on read", () => {
    const data = encryptTokens({ accessToken: "at", refreshToken: "rt", expiresAt: null });
    expect(isEncryptedSecret(data.accessToken)).toBe(true);
    expect(isEncryptedSecret(data.refreshToken)).toBe(true);
    expect(data.expiresAt).toBeNull();

    const row = withDecryptedTokens({ id: "i1", ...data });
    expect(row).toEqual({ id: "i1", accessToken: "at", refreshToken: "rt", expiresAt: null });
  });

  it("leaves missing and null tokens alone", () => {
    const statusOnly: { status: string; accessToken?: string } = { status: "ERROR" };
    expect(encryptTokens(statusOnly)).toEqual({ status: "ERROR" });
    expect(encryptTokens({ accessToken: "a", refreshToken: null }).refreshToken).toBeNull();
    expect(withDecryptedTokens(null)).toBeNull();
  });

  it("encrypts workspace keys, including Prisma's { set } form, and decrypts them", () => {
    const data = encryptWorkspaceKeys({
      openRouterKey: "sk-or-v1-x",
      deepgramKey: { set: "dg" },
      openaiKey: null,
      monthlyTokenLimit: 5,
    });
    expect(isEncryptedSecret(data.openRouterKey)).toBe(true);
    expect(isEncryptedSecret((data.deepgramKey as { set: string }).set)).toBe(true);
    expect(data.openaiKey).toBeNull();
    expect(data.monthlyTokenLimit).toBe(5);
    const courtesyOnly: { isCourtesy: boolean; openRouterKey?: string } = { isCourtesy: true };
    expect("isCourtesy" in encryptWorkspaceKeys(courtesyOnly)).toBe(true);
    expect("openRouterKey" in encryptWorkspaceKeys(courtesyOnly)).toBe(false);

    const row = withDecryptedWorkspaceKeys({
      openRouterKey: data.openRouterKey,
      deepgramKey: "plain-legacy",
      openaiKey: null,
    });
    expect(row).toEqual({
      openRouterKey: "sk-or-v1-x",
      deepgramKey: "plain-legacy",
      openaiKey: null,
    });
  });
});
