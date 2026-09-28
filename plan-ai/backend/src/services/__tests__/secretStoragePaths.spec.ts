import { randomBytes } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WorkspaceIntegration } from "@prisma/client";

/**
 * Customer secrets must never reach Postgres as plain text, and every path
 * that uses one must get the plain value back. These tests follow the paths
 * that write secrets on their own (token refresh, workspace settings) and a
 * few reads that hand a secret to a provider.
 */

const { db } = vi.hoisted(() => {
  // Read by the services when they are constructed.
  process.env.JIRA_CLIENT_ID ||= "jira-client";
  process.env.JIRA_CLIENT_SECRET ||= "jira-secret";
  process.env.FRONTEND_URL ||= "http://localhost:3000";
  process.env.LINEAR_CLIENT_ID ||= "linear-client";
  process.env.LINEAR_CLIENT_SECRET ||= "linear-secret";
  return {
    db: {
      workspaceIntegration: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
      workspace: { findUnique: vi.fn(), update: vi.fn() },
    },
  };
});

vi.mock("../../prisma/prismaClient", () => ({ default: db }));
// Some modules build their own PrismaClient; they get the same fake.
vi.mock("@prisma/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@prisma/client")>()),
  PrismaClient: class {
    workspace = db.workspace;
    workspaceIntegration = db.workspaceIntegration;
  },
}));
vi.mock("../../firebase/firebaseAdmin", () => ({ setUserRole: vi.fn(), firebaseAdmin: {} }));
vi.mock("../emailService", () => ({ sendWorkspaceInvitationEmail: vi.fn() }));
vi.mock("../keyValidationService", () => ({
  validateOpenRouterKey: vi.fn(async () => ({ checked: true, valid: true })),
  validateDeepgramKey: vi.fn(async () => ({ checked: true, valid: true })),
}));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { decryptSecret, encryptSecret, isEncryptedSecret } from "../../utils/secretCrypto";
import { jiraIntegrationService } from "../jiraIntegrationService";
import { linearIntegrationService } from "../linearIntegrationService";
import { WorkspaceController } from "../../controller/WorkspaceController";
import {
  resolveWorkspaceEmbeddingConfig,
  resolveWorkspaceOpenAIKey,
} from "../../utils/aiModelUtils";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";

const ORIGINAL_KEY = process.env.SECRETS_ENCRYPTION_KEY;
const fetchMock = vi.fn();

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

const storedIntegration = (over: Partial<WorkspaceIntegration> = {}): WorkspaceIntegration => ({
  id: "wi_1",
  workspaceId: "ws_1",
  provider: "JIRA",
  status: "CONNECTED",
  accessToken: encryptSecret("old-access"),
  refreshToken: encryptSecret("old-refresh"),
  expiresAt: new Date(Date.now() - 60_000),
  scope: null,
  accountId: "site_1",
  accountName: "Acme",
  metadata: { authType: "OAUTH" },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

/** The data object of the n-th prisma update call. */
const updateData = (n = 0) =>
  (db.workspaceIntegration.update.mock.calls[n] as [{ data: Record<string, unknown> }])[0].data;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  db.workspaceIntegration.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...storedIntegration(), ...data }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("Jira token refresh", () => {
  it("sends the plain refresh token and stores the new pair encrypted", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        scope: "read:jira-work",
        token_type: "Bearer",
      }),
    );

    const result = await jiraIntegrationService.refreshTokenIfExpired("ws_1", storedIntegration());

    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body);
    expect(sent.refresh_token).toBe("old-refresh");

    const data = updateData();
    expect(isEncryptedSecret(data.accessToken)).toBe(true);
    expect(isEncryptedSecret(data.refreshToken)).toBe(true);
    expect(decryptSecret(data.accessToken as string)).toBe("new-access");
    expect(decryptSecret(data.refreshToken as string)).toBe("new-refresh");
    expect(JSON.stringify(data)).not.toContain("new-");

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");
  });

  it("returns plain tokens when no refresh is needed", async () => {
    const fresh = storedIntegration({ expiresAt: new Date(Date.now() + 3_600_000) });
    const result = await jiraIntegrationService.refreshTokenIfExpired("ws_1", fresh);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.accessToken).toBe("old-access");
  });

  it("calls Jira with the decrypted access token", async () => {
    db.workspaceIntegration.findUnique.mockResolvedValue(
      storedIntegration({ expiresAt: new Date(Date.now() + 3_600_000) }),
    );
    fetchMock.mockResolvedValue(okResponse([]));

    await jiraIntegrationService.listJiraProjects("ws_1");

    const init = (fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }])[1];
    expect(init.headers.Authorization).toBe("Bearer old-access");
  });

  it("encrypts the tokens saved by the OAuth callback", async () => {
    db.workspaceIntegration.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => create,
    );

    const saved = await jiraIntegrationService.upsertIntegration({
      workspaceId: "ws_1",
      accessToken: "cb-access",
      refreshToken: "cb-refresh",
      expiresInSeconds: 3600,
      resource: { id: "site_1", name: "Acme" },
    });

    const call = db.workspaceIntegration.upsert.mock.calls[0] as [
      { create: Record<string, string>; update: Record<string, string> },
    ];
    for (const data of [call[0].create, call[0].update]) {
      expect(decryptSecret(data.accessToken)).toBe("cb-access");
      expect(decryptSecret(data.refreshToken)).toBe("cb-refresh");
      expect(data.accessToken).not.toBe("cb-access");
    }
    expect(saved.accessToken).toBe("cb-access");
  });
});

describe("Linear token refresh", () => {
  const linearRow = () =>
    storedIntegration({ provider: "LINEAR", metadata: { authType: "OAUTH" } });

  it("stores the rotated pair encrypted", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ access_token: "lin-access", refresh_token: "lin-refresh", expires_in: 86400 }),
    );

    const result = await linearIntegrationService.refreshTokenIfExpired("ws_1", linearRow());

    const body = (fetchMock.mock.calls[0] as [string, { body: string }])[1].body;
    expect(new URLSearchParams(body).get("refresh_token")).toBe("old-refresh");
    const data = updateData();
    expect(decryptSecret(data.accessToken as string)).toBe("lin-access");
    expect(decryptSecret(data.refreshToken as string)).toBe("lin-refresh");
    expect(result.accessToken).toBe("lin-access");
  });

  it("keeps the old refresh token encrypted when Linear does not rotate it", async () => {
    fetchMock.mockResolvedValue(okResponse({ access_token: "lin-access", expires_in: 86400 }));

    await linearIntegrationService.refreshTokenIfExpired("ws_1", linearRow());

    const data = updateData();
    expect(isEncryptedSecret(data.refreshToken)).toBe(true);
    expect(decryptSecret(data.refreshToken as string)).toBe("old-refresh");
  });

  it("still refreshes a row saved as plain text before encryption", async () => {
    fetchMock.mockResolvedValue(okResponse({ access_token: "lin-access", expires_in: 86400 }));

    await linearIntegrationService.refreshTokenIfExpired("ws_1", {
      ...linearRow(),
      accessToken: "plain-a",
      refreshToken: "plain-r",
    });

    const body = (fetchMock.mock.calls[0] as [string, { body: string }])[1].body;
    expect(new URLSearchParams(body).get("refresh_token")).toBe("plain-r");
    expect(decryptSecret(updateData().refreshToken as string)).toBe("plain-r");
    expect(isEncryptedSecret(updateData().refreshToken)).toBe(true);
  });
});

describe("workspace BYOK keys", () => {
  const request = {} as AuthenticatedRequest;

  const settingsController = () => {
    const controller = new WorkspaceController();
    vi.spyOn(
      controller as unknown as { getAuthorizedWorkspaceAccess: () => Promise<unknown> },
      "getAuthorizedWorkspaceAccess",
    ).mockResolvedValue({ workspaceId: "ws_1", role: "OWNER", user: { id: "u_1" } });
    return controller;
  };

  it("encrypts keys saved from workspace settings", async () => {
    await settingsController().updateWorkspaceSettings(request, {
      openRouterKey: "sk-or-v1-new",
      deepgramKey: "a".repeat(40),
      openaiKey: null,
      monthlyTokenLimit: 1000,
    });

    const data = (db.workspace.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(isEncryptedSecret(data.openRouterKey)).toBe(true);
    expect(isEncryptedSecret(data.deepgramKey)).toBe(true);
    expect(decryptSecret(data.openRouterKey as string)).toBe("sk-or-v1-new");
    expect(decryptSecret(data.deepgramKey as string)).toBe("a".repeat(40));
    expect(data.openaiKey).toBeNull();
    expect(data.monthlyTokenLimit).toBe(1000);
  });

  it("leaves stored keys alone when the masked placeholder comes back", async () => {
    await settingsController().updateWorkspaceSettings(request, {
      openRouterKey: "••••••••••••••••",
      monthlyTokenLimit: 5,
    });

    const data = (db.workspace.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect("openRouterKey" in data).toBe(false);
  });

  it("hands the decrypted OpenAI key to the embeddings client", async () => {
    db.workspace.findUnique.mockResolvedValue({
      openaiKey: encryptSecret("sk-proj-abc"),
      isCourtesy: false,
    });
    await expect(resolveWorkspaceOpenAIKey("ws_1")).resolves.toEqual({
      apiKey: "sk-proj-abc",
      usedFallback: false,
    });
  });

  it("hands the decrypted OpenRouter key to the embeddings client", async () => {
    db.workspace.findUnique.mockResolvedValue({
      openRouterKey: encryptSecret("sk-or-v1-abc"),
      openaiKey: null,
      isCourtesy: false,
    });
    const config = await resolveWorkspaceEmbeddingConfig("ws_1");
    expect(config.apiKey).toBe("sk-or-v1-abc");
    expect(config.usedFallback).toBe(false);
  });
});
