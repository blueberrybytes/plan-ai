/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    desktopAuthCode: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    customTheme: { findUnique: vi.fn() },
  },
  createCustomToken: vi.fn(),
  verifyToken: vi.fn(),
  acceptInvitations: vi.fn(),
}));

vi.mock("../../middleware/authMiddleware", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../middleware/authMiddleware")>()),
  // Decorator metadata reads this interface name at runtime.
  AuthenticatedRequest: Object,
  verifyFirebaseIdToken: mocks.verifyToken,
}));
vi.mock("../../services/invitationService", () => ({
  acceptPendingInvitations: mocks.acceptInvitations,
}));

vi.mock("../../prisma/prismaClient", () => ({ default: mocks.prisma }));
vi.mock("../../firebase/firebaseAdmin", () => ({
  firebaseAdmin: { auth: () => ({ createCustomToken: mocks.createCustomToken }) },
  setUserRole: vi.fn(),
}));
vi.mock("../../firebase/privateStorage", () => ({
  DISPLAY_URL_TTL_MS: 0,
  readableUrl: vi.fn(),
  uploadPrivateFile: vi.fn(),
}));

import { SessionController, pkceMatches, trustedMicrosoftEmail } from "../sessionController";

const verifier = "a".repeat(43);
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");

describe("trustedMicrosoftEmail", () => {
  it("uses the userPrincipalName and never the editable mail attribute", () => {
    expect(
      trustedMicrosoftEmail({ userPrincipalName: "Ana@Acme.com", mail: "ceo@victim.com" } as any),
    ).toBe("ana@acme.com");
  });

  it("refuses guest principal names", () => {
    expect(
      trustedMicrosoftEmail({ userPrincipalName: "ana_gmail.com#EXT#@acme.onmicrosoft.com" }),
    ).toBeNull();
  });

  it("refuses a missing or malformed name", () => {
    expect(trustedMicrosoftEmail({})).toBeNull();
    expect(trustedMicrosoftEmail({ userPrincipalName: "not-an-email" })).toBeNull();
  });
});

describe("pkceMatches", () => {
  it("accepts the verifier that produced the challenge", () => {
    expect(pkceMatches(verifier, challengeOf(verifier))).toBe(true);
  });

  it("refuses any other verifier", () => {
    expect(pkceMatches("b".repeat(43), challengeOf(verifier))).toBe(false);
    expect(pkceMatches("short", challengeOf("short"))).toBe(false);
  });
});

describe("one-time sign-in codes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createCustomToken.mockResolvedValue("custom-token");
  });

  const record = (codeChallenge: string | null, expiresInMs = 60_000) => ({
    id: "c1",
    code: "code",
    codeChallenge,
    expiresAt: new Date(Date.now() + expiresInMs),
    user: { firebaseUid: "f1" },
  });

  it("gives the token to the app that holds the verifier", async () => {
    mocks.prisma.desktopAuthCode.findUnique.mockResolvedValue(record(challengeOf(verifier)));

    const res = await new SessionController().exchangeMobileCode({
      code: "code",
      codeVerifier: verifier,
    });

    expect(res.data?.customToken).toBe("custom-token");
    expect(mocks.prisma.desktopAuthCode.delete).toHaveBeenCalled();
  });

  it("passes the original sign-in into the custom token", async () => {
    mocks.prisma.desktopAuthCode.findUnique.mockResolvedValue({
      ...record(challengeOf(verifier)),
      signInProvider: "microsoft.com",
      secondFactor: null,
    });

    await new SessionController().exchangeMobileCode({ code: "code", codeVerifier: verifier });

    expect(mocks.createCustomToken).toHaveBeenCalledWith("f1", { pa_sip: "microsoft.com" });
  });

  it("burns the code when the verifier is wrong", async () => {
    mocks.prisma.desktopAuthCode.findUnique.mockResolvedValue(record(challengeOf(verifier)));

    await expect(
      new SessionController().exchangeMobileCode({ code: "code", codeVerifier: "b".repeat(43) }),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.prisma.desktopAuthCode.delete).toHaveBeenCalled();
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it("does not let the desktop exchange skip the verifier of a mobile code", async () => {
    mocks.prisma.desktopAuthCode.findUnique.mockResolvedValue(record(challengeOf(verifier)));

    await expect(
      new SessionController().exchangeDesktopCode({ code: "code" }),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it("refuses expired mobile codes", async () => {
    mocks.prisma.desktopAuthCode.findUnique.mockResolvedValue(record(challengeOf(verifier), -1));

    await expect(
      new SessionController().exchangeMobileCode({ code: "code", codeVerifier: verifier }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("web login with an email that already has an account", () => {
  const existing = {
    id: "victim",
    firebaseUid: "victim-uid",
    email: "ana@acme.com",
    isGoogleAccount: false,
    isAppleAccount: false,
    isMicrosoftAccount: false,
  };
  const token = (extra: Record<string, unknown>) => ({
    uid: "new-uid",
    email: "ana@acme.com",
    firebase: { sign_in_provider: "password", identities: {} },
    ...extra,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.firebaseUid ? null : existing),
    );
    mocks.prisma.user.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...existing, ...data }),
    );
    mocks.prisma.customTheme.findUnique.mockResolvedValue(null);
  });

  it("refuses to take it over with an unverified email", async () => {
    mocks.verifyToken.mockResolvedValue(token({ email_verified: false }));

    await expect(new SessionController().login({ uuid: "x", token: "t" })).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.acceptInvitations).not.toHaveBeenCalled();
  });

  it("links it when the email is verified, and accepts invitations", async () => {
    mocks.verifyToken.mockResolvedValue(token({ email_verified: true }));

    const res = await new SessionController().login({ uuid: "x", token: "t" });

    expect(res.data?.firebaseUid).toBe("new-uid");
    expect(mocks.acceptInvitations).toHaveBeenCalled();
  });
});
