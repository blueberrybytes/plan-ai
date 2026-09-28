import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import type { UserIntegration } from "@prisma/client";

/**
 * Token handling and the OAuth callback of the calendar integrations. Google
 * and Microsoft are mocked at the HTTP layer; what matters here is what ends
 * up in the database: tokens encrypted, ERROR only on invalid_grant, and no
 * exception ever reaching the caller.
 */

const { db, http } = vi.hoisted(() => ({
  db: {
    userIntegration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
  http: { post: vi.fn(), get: vi.fn() },
}));

vi.mock("../../prisma/prismaClient", () => ({ default: db }));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: { ...actual.default, post: http.post, get: http.get },
  };
});

import { AxiosError, type AxiosResponse } from "axios";
import { calendarService } from "../calendarService";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../../utils/secretCrypto";

const httpError = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
  } as AxiosResponse);

const integration = (overrides: Partial<UserIntegration> = {}): UserIntegration => ({
  id: "int-1",
  userId: "user-1",
  provider: "OUTLOOK_CALENDAR",
  status: "CONNECTED",
  accessToken: encryptSecret("old-access"),
  refreshToken: encryptSecret("old-refresh"),
  expiresAt: new Date(Date.now() - 1000),
  scope: "Calendars.Read User.Read",
  accountId: null,
  accountName: "me@example.com",
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.MICROSOFT_CLIENT_ID = "ms-client";
  process.env.MICROSOFT_CLIENT_SECRET = "ms-secret";
  process.env.MICROSOFT_TENANT_ID = "common";
  process.env.GOOGLE_CLIENT_ID = "g-client";
  process.env.GOOGLE_CLIENT_SECRET = "g-secret";
  process.env.APP_URL = "https://app.example.com";
  process.env.BACKEND_URL = "https://api.example.com";
  delete process.env.CALENDAR_STATE_SECRET;
  delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  delete process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
  db.userIntegration.updateMany.mockResolvedValue({ count: 1 });
});

describe("getAccessToken", () => {
  it("returns the stored token while it is still valid", async () => {
    const token = await calendarService.getAccessToken(
      integration({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) }),
    );
    expect(token).toBe("old-access");
    expect(http.post).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and stores the new ones encrypted", async () => {
    http.post.mockResolvedValue({
      data: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 },
    });

    const token = await calendarService.getAccessToken(integration());

    expect(token).toBe("new-access");
    const { where, data } = db.userIntegration.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "int-1" });
    expect(isEncryptedSecret(data.accessToken)).toBe(true);
    expect(isEncryptedSecret(data.refreshToken)).toBe(true);
    expect(decryptSecret(data.accessToken)).toBe("new-access");
    expect(decryptSecret(data.refreshToken)).toBe("new-refresh");
    expect(data.status).toBe("CONNECTED");
    // The refresh token sent to Microsoft is the decrypted one.
    expect((http.post.mock.calls[0][1] as URLSearchParams).get("refresh_token")).toBe(
      "old-refresh",
    );
  });

  it("keeps the old refresh token when Google does not send a new one", async () => {
    http.post.mockResolvedValue({ data: { access_token: "new-access", expires_in: 3600 } });

    await calendarService.getAccessToken(integration({ provider: "GOOGLE_CALENDAR" }));

    const { data } = db.userIntegration.updateMany.mock.calls[0][0];
    expect(decryptSecret(data.refreshToken)).toBe("old-refresh");
    expect(http.post.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
  });

  it("marks the integration ERROR when the refresh token is rejected", async () => {
    http.post.mockRejectedValue(httpError(400, { error: "invalid_grant" }));

    const token = await calendarService.getAccessToken(integration());

    expect(token).toBeNull();
    expect(db.userIntegration.updateMany).toHaveBeenCalledWith({
      where: { id: "int-1" },
      data: { status: "ERROR" },
    });
  });

  it("returns null without marking ERROR on a network failure", async () => {
    http.post.mockRejectedValue(new AxiosError("timeout of 5000ms exceeded", "ECONNABORTED"));

    const token = await calendarService.getAccessToken(integration());

    expect(token).toBeNull();
    expect(db.userIntegration.updateMany).not.toHaveBeenCalled();
  });

  it("shares one refresh between parallel calls", async () => {
    http.post.mockResolvedValue({ data: { access_token: "new-access", expires_in: 3600 } });
    const row = integration();

    const [a, b] = await Promise.all([
      calendarService.getAccessToken(row),
      calendarService.getAccessToken(row),
    ]);

    expect(a).toBe("new-access");
    expect(b).toBe("new-access");
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});

describe("OAuth state", () => {
  const input = {
    userId: "user-1",
    workspaceId: "ws-1",
    provider: "GOOGLE_CALENDAR" as const,
    redirectPath: "/integrations/google-calendar",
  };

  it("round trips a signed state", () => {
    const token = calendarService.createStateToken(input);
    expect(calendarService.parseStateToken(token, "GOOGLE_CALENDAR")).toMatchObject(input);
  });

  it("rejects a state edited to point at another user", () => {
    const token = calendarService.createStateToken(input);
    const [encoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...payload, userId: "victim" })).toString(
      "base64url",
    );
    expect(calendarService.parseStateToken(`${forged}.${signature}`, "GOOGLE_CALENDAR")).toBeNull();
  });

  it("rejects a state made for the other provider", () => {
    const token = calendarService.createStateToken(input);
    expect(calendarService.parseStateToken(token, "OUTLOOK_CALENDAR")).toBeNull();
  });

  it("rejects a state older than 10 minutes", () => {
    vi.useFakeTimers();
    try {
      const token = calendarService.createStateToken(input);
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(calendarService.parseStateToken(token, "GOOGLE_CALENDAR")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a redirect path that leaves the web app", () => {
    const token = calendarService.createStateToken({ ...input, redirectPath: "//evil.example" });
    expect(calendarService.parseStateToken(token, "GOOGLE_CALENDAR")?.redirectPath).toBeUndefined();
  });
});

describe("revokeGoogleAccess", () => {
  it("revokes the refresh token at Google", async () => {
    db.userIntegration.findFirst.mockResolvedValue({
      accessToken: encryptSecret("g-access"),
      refreshToken: encryptSecret("g-refresh"),
    });
    http.post.mockResolvedValue({ data: {} });
    await calendarService.revokeGoogleAccess("user-1");
    expect(http.post.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
    expect((http.post.mock.calls[0][1] as URLSearchParams).get("token")).toBe("g-refresh");
  });

  it("never blocks the disconnect when Google fails", async () => {
    db.userIntegration.findFirst.mockResolvedValue({ accessToken: "a", refreshToken: null });
    http.post.mockRejectedValue(httpError(400, { error: "invalid_token" }));
    await expect(calendarService.revokeGoogleAccess("user-1")).resolves.toBeUndefined();
  });
});

describe("return address", () => {
  const frontendUrl = process.env.FRONTEND_URL;
  beforeEach(() => {
    process.env.FRONTEND_URL = "https://app.example.com";
  });
  afterEach(() => {
    delete process.env.CORS_ORIGINS;
    if (frontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = frontendUrl;
  });

  it("sends the user back to the web domain they started from, if it is ours", () => {
    process.env.CORS_ORIGINS = "https://app.example.com, https://white.example.org";
    expect(calendarService.buildRedirectUri("GOOGLE_CALENDAR", "https://white.example.org")).toBe(
      "https://white.example.org/integrations/google-calendar",
    );
    expect(calendarService.buildRedirectUri("GOOGLE_CALENDAR", "https://evil.example")).toBe(
      "https://app.example.com/integrations/google-calendar",
    );
    expect(
      calendarService.buildRedirectUri("GOOGLE_CALENDAR", "https://white.example.org/x?y"),
    ).toBe("https://app.example.com/integrations/google-calendar");
    expect(calendarService.buildRedirectUri("OUTLOOK_CALENDAR", "http://localhost:3000")).toBe(
      "https://app.example.com/integrations/outlook-calendar",
    );
  });

  it("accepts any localhost port in local development", () => {
    expect(calendarService.buildRedirectUri("GOOGLE_CALENDAR", "http://localhost:3001")).toBe(
      "http://localhost:3001/integrations/google-calendar",
    );
  });

  it("exchanges the code with the return address signed in the state", async () => {
    http.post.mockResolvedValue({
      data: { access_token: "a", expires_in: 3600, scope: "Calendars.Read" },
    });
    http.get.mockResolvedValue({ data: { id: "ms-id", mail: "me@example.com" } });
    const state = calendarService.createStateToken({
      userId: "user-1",
      workspaceId: "ws-1",
      provider: "OUTLOOK_CALENDAR",
      redirectUri: "https://white.example.org/integrations/outlook-calendar",
    });
    await calendarService.completeOAuth("OUTLOOK_CALENDAR", "user-1", { code: "c", state });
    expect((http.post.mock.calls[0][1] as URLSearchParams).get("redirect_uri")).toBe(
      "https://white.example.org/integrations/outlook-calendar",
    );
  });
});

describe("completeOAuth", () => {
  it("refuses a bad state", async () => {
    const result = await calendarService.completeOAuth("OUTLOOK_CALENDAR", "user-1", {
      code: "code",
      state: "bad.state",
    });
    expect(result).toEqual({ connected: false, errorReason: "InvalidState" });
    expect(db.userIntegration.upsert).not.toHaveBeenCalled();
  });

  it("refuses a connect link finished by another user", async () => {
    // user-1 sends their consent link to user-2. user-2's calendar must not
    // end up in user-1's account.
    const state = calendarService.createStateToken({
      userId: "user-1",
      workspaceId: "ws-1",
      provider: "OUTLOOK_CALENDAR",
    });
    const result = await calendarService.completeOAuth("OUTLOOK_CALENDAR", "user-2", {
      code: "code",
      state,
    });
    expect(result).toEqual({ connected: false, errorReason: "InvalidState" });
    expect(http.post).not.toHaveBeenCalled();
    expect(db.userIntegration.upsert).not.toHaveBeenCalled();
  });

  it("stores an Outlook connection with encrypted tokens", async () => {
    http.post.mockResolvedValue({
      data: {
        access_token: "ms-access",
        refresh_token: "ms-refresh",
        expires_in: 3600,
        scope: "https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read",
      },
    });
    http.get.mockResolvedValue({ data: { id: "ms-id", mail: "me@example.com" } });
    const state = calendarService.createStateToken({
      userId: "user-1",
      workspaceId: "ws-1",
      provider: "OUTLOOK_CALENDAR",
    });

    const result = await calendarService.completeOAuth("OUTLOOK_CALENDAR", "user-1", {
      code: "code",
      state,
    });

    expect(result.connected).toBe(true);
    const call = db.userIntegration.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_provider: { userId: "user-1", provider: "OUTLOOK_CALENDAR" },
    });
    expect(decryptSecret(call.create.accessToken)).toBe("ms-access");
    expect(decryptSecret(call.create.refreshToken)).toBe("ms-refresh");
    expect(isEncryptedSecret(call.update.accessToken)).toBe(true);
    expect(call.create.accountName).toBe("me@example.com");
    expect((http.post.mock.calls[0][1] as URLSearchParams).get("redirect_uri")).toBe(
      "https://app.example.com/integrations/outlook-calendar",
    );
  });

  it("refuses a grant without calendar access", async () => {
    http.post.mockResolvedValue({
      data: { access_token: "ms-access", expires_in: 3600, scope: "User.Read" },
    });
    const state = calendarService.createStateToken({
      userId: "user-1",
      workspaceId: "ws-1",
      provider: "OUTLOOK_CALENDAR",
    });

    const result = await calendarService.completeOAuth("OUTLOOK_CALENDAR", "user-1", {
      code: "code",
      state,
    });

    expect(result).toMatchObject({ connected: false, errorReason: "MissingScope" });
    expect(db.userIntegration.upsert).not.toHaveBeenCalled();
  });
});

describe("getCurrentMeeting", () => {
  it("returns null when the user has no calendar", async () => {
    db.userIntegration.findMany.mockResolvedValue([]);
    expect(await calendarService.getCurrentMeeting("user-1", "ws-1")).toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });

  it("returns the meeting in progress from Outlook", async () => {
    const now = new Date("2026-09-27T10:00:00Z");
    db.userIntegration.findMany.mockResolvedValue([
      integration({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) }),
    ]);
    http.get.mockResolvedValue({
      data: {
        value: [
          {
            subject: "Kickoff",
            start: { dateTime: "2026-09-27T09:45:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-09-27T10:30:00.0000000", timeZone: "UTC" },
            attendees: [{ type: "required", emailAddress: { address: "omar@client.ae" } }],
          },
        ],
      },
    });

    const meeting = await calendarService.getCurrentMeeting("user-1", "ws-1", now);

    expect(meeting).toMatchObject({ title: "Kickoff", provider: "OUTLOOK_CALENDAR" });
    expect(http.get.mock.calls[0][1].headers.Authorization).toBe("Bearer old-access");
  });

  it("returns null instead of throwing when the provider is down", async () => {
    db.userIntegration.findMany.mockResolvedValue([
      integration({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) }),
    ]);
    http.get.mockRejectedValue(new AxiosError("getaddrinfo ENOTFOUND", "ENOTFOUND"));

    expect(await calendarService.getCurrentMeeting("user-1", "ws-1")).toBeNull();
  });

  it("returns null instead of throwing when the database fails", async () => {
    db.userIntegration.findMany.mockRejectedValue(new Error("connection refused"));
    expect(await calendarService.getCurrentMeeting("user-1", "ws-1")).toBeNull();
  });

  it("refreshes once after a 401 and retries", async () => {
    db.userIntegration.findMany.mockResolvedValue([
      integration({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) }),
    ]);
    http.get
      .mockRejectedValueOnce(httpError(401, { error: { code: "InvalidAuthenticationToken" } }))
      .mockResolvedValueOnce({ data: { value: [] } });
    http.post.mockResolvedValue({ data: { access_token: "new-access", expires_in: 3600 } });

    expect(await calendarService.getCurrentMeeting("user-1", "ws-1")).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[1][1].headers.Authorization).toBe("Bearer new-access");
  });
});
