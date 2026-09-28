import { describe, it, expect, vi, afterEach } from "vitest";
import { createOAuthState, readOAuthState, safeRedirectPath } from "../oauthState";

const SECRET = "test-secret";
const P = "google-drive";

afterEach(() => {
  vi.useRealTimers();
});

describe("signed OAuth state", () => {
  it("round-trips what the server issued", () => {
    const token = createOAuthState(P, { uid: "u1", workspaceId: "w1" }, SECRET);
    expect(readOAuthState<{ workspaceId: string }>(P, token, SECRET)?.workspaceId).toBe("w1");
  });

  it("rejects the old unsigned base64 state (the Drive/OneDrive hijack)", () => {
    const forged = Buffer.from(JSON.stringify({ uid: "x", workspaceId: "victim" })).toString(
      "base64",
    );
    expect(readOAuthState(P, forged, SECRET)).toBeNull();
  });

  it("rejects a state whose payload was changed", () => {
    const token = createOAuthState(P, { uid: "u1", workspaceId: "w1" }, SECRET);
    const [, sig] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ uid: "u1", workspaceId: "victim", nonce: "n", issuedAt: Date.now() }),
    ).toString("base64url");
    expect(readOAuthState(P, `${tampered}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a state issued for another flow with the same key", () => {
    // A member's calendar state must not open the admin-only Drive link.
    const token = createOAuthState("calendar", { uid: "u1", workspaceId: "w1" }, SECRET);
    expect(readOAuthState(P, token, SECRET)).toBeNull();
  });

  it("rejects another server's key and expired states", () => {
    const token = createOAuthState(P, { workspaceId: "w1" }, SECRET);
    expect(readOAuthState(P, token, "other-secret")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(readOAuthState(P, token, SECRET)).toBeNull();
  });
});

describe("redirect path", () => {
  it("keeps paths inside the app only", () => {
    expect(safeRedirectPath("/integrations/google")).toBe("/integrations/google");
    expect(safeRedirectPath("@evil.com")).toBeUndefined();
    expect(safeRedirectPath("//evil.com")).toBeUndefined();
    expect(safeRedirectPath("/\\evil.com")).toBeUndefined();
    expect(safeRedirectPath("https://evil.com")).toBeUndefined();
    expect(safeRedirectPath(undefined)).toBeUndefined();
  });
});
