/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Read by the controller when it loads.
const mocks = vi.hoisted(() => {
  process.env.MICROSOFT_CLIENT_ID = "ms-client";
  process.env.MICROSOFT_CLIENT_SECRET = "ms-secret";
  process.env.OAUTH_STATE_SECRET = "state-secret-for-tests";
  return {
    prisma: {
      user: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
      desktopAuthCode: { create: vi.fn() },
    },
    createCustomToken: vi.fn(),
    getUserByEmail: vi.fn(),
  };
});

vi.mock("../../prisma/prismaClient", () => ({ default: mocks.prisma }));
vi.mock("../../firebase/firebaseAdmin", () => ({
  firebaseAdmin: {
    auth: () => ({
      createCustomToken: mocks.createCustomToken,
      getUserByEmail: mocks.getUserByEmail,
    }),
  },
  setUserRole: vi.fn(),
}));
vi.mock("../../firebase/privateStorage", () => ({
  DISPLAY_URL_TTL_MS: 0,
  readableUrl: vi.fn(),
}));

import { microsoftMobileCallback, microsoftMobileStart } from "../sessionController";

const APP = "planaimobile://auth/microsoft/callback";

const response = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/token")
        ? { ok: true, json: async () => ({ access_token: "ms-access", id_token: "x" }) }
        : {
            ok: true,
            json: async () => ({
              id: "ms-1",
              userPrincipalName: "ana@acme.com",
              displayName: "Ana",
            }),
          },
    ),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("mobile apps up to 4.4.0 (no PKCE)", () => {
  it("still start the Microsoft sign-in", async () => {
    const res = response();
    await microsoftMobileStart({ query: { redirect_uri: APP } } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.redirect.mock.calls[0][0]).toContain("login.microsoftonline.com");
  });

  it("get the token in the deep link, as before", async () => {
    const start = response();
    await microsoftMobileStart({ query: { redirect_uri: APP } } as any, start);
    const state = new URL(start.redirect.mock.calls[0][0]).searchParams.get("state");

    mocks.getUserByEmail.mockResolvedValue({ uid: "fb-ana" });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "u1", microsoftId: "ms-1" });
    mocks.createCustomToken.mockResolvedValue("custom-token");

    const res = response();
    await microsoftMobileCallback({ query: { code: "ms-code", state } } as any, res);

    const back = new URL(res.redirect.mock.calls[0][0]);
    expect(back.searchParams.get("token")).toBe("custom-token");
    expect(back.searchParams.has("code")).toBe(false);
    expect(mocks.createCustomToken).toHaveBeenCalledWith("fb-ana", { pa_sip: "microsoft.com" });
    expect(mocks.prisma.desktopAuthCode.create).not.toHaveBeenCalled();
  });
});

describe("current mobile apps (PKCE)", () => {
  it("are refused when they send only half of PKCE", async () => {
    const res = response();
    await microsoftMobileStart(
      { query: { redirect_uri: APP, code_challenge: "a".repeat(43) } } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("get a one-time code, never the token", async () => {
    const start = response();
    await microsoftMobileStart(
      {
        query: { redirect_uri: APP, code_challenge: "a".repeat(43), app_state: "b".repeat(20) },
      } as any,
      start,
    );
    const state = new URL(start.redirect.mock.calls[0][0]).searchParams.get("state");

    mocks.getUserByEmail.mockResolvedValue({ uid: "fb-ana" });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "u1", microsoftId: "ms-1" });
    mocks.prisma.user.findFirstOrThrow.mockResolvedValue({ id: "u1" });

    const res = response();
    await microsoftMobileCallback({ query: { code: "ms-code", state } } as any, res);

    const back = new URL(res.redirect.mock.calls[0][0]);
    expect(back.searchParams.has("token")).toBe(false);
    expect(back.searchParams.get("code")).toMatch(/^[a-f0-9]{64}$/);
    expect(back.searchParams.get("state")).toBe("b".repeat(20));
  });
});
