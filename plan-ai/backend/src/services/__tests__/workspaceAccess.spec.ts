/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  workspaceMember: { findUnique: vi.fn() },
  workspace: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));
// Restricted projects are worked out with the unfiltered client. Not under test here.
vi.mock("../projectAccess", () => ({
  hiddenFromMember: async () => ({ projectIds: [], contextIds: [] }),
  hiddenFromOutsiders: async () => ({ projectIds: [], contextIds: [] }),
}));
vi.mock("../../prisma/prismaClient", () => ({ default: prismaMock }));

import { checkWorkspacePolicy, resolveWorkspaceAccess } from "../workspaceAccess";
import { requireWorkspaceMember } from "../../middleware/workspaceMiddleware";

const noPolicy = { allowedEmailDomains: [], requireMfa: false, requiredSignInProvider: null };
const member = (role = "MEMBER", policy: Partial<typeof noPolicy> = {}) => ({
  role,
  workspace: { ...noPolicy, ...policy },
});

describe("resolveWorkspaceAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "ana@acme.com",
      role: "CLIENT",
    });
  });
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_SUPPORT_ACCESS;
  });

  it("lets a member in with their role", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(member("ADMIN"));

    const access = await resolveWorkspaceAccess({ firebaseUid: "f1", workspaceId: "ws1" });

    expect(access.role).toBe("ADMIN");
    expect(access.workspaceId).toBe("ws1");
  });

  it("refuses someone who is not a member, whatever header they send", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      resolveWorkspaceAccess({ firebaseUid: "f1", workspaceId: "someone-elses-ws" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a missing workspace header", async () => {
    await expect(
      resolveWorkspaceAccess({ firebaseUid: "f1", workspaceId: undefined }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("gives platform admins no access by default", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "a1", email: "staff@x.com", role: "ADMIN" });
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      resolveWorkspaceAccess({ firebaseUid: "f-admin", workspaceId: "ws1" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("logs platform admin access when support access is on", async () => {
    process.env.PLATFORM_ADMIN_SUPPORT_ACCESS = "true";
    prismaMock.user.findUnique.mockResolvedValue({ id: "a2", email: "staff@x.com", role: "ADMIN" });
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws1" });

    const access = await resolveWorkspaceAccess({ firebaseUid: "f-admin", workspaceId: "ws1" });

    expect(access.role).toBe("OWNER");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "ws1", action: "platform_admin.access" }),
      }),
    );
  });

  it("applies the workspace sign-in rules to members", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(member("OWNER", { requireMfa: true }));

    await expect(
      resolveWorkspaceAccess({
        firebaseUid: "f1",
        workspaceId: "ws1",
        signIn: { signInProvider: "password" },
      }),
    ).rejects.toMatchObject({ status: 403, code: "mfa_required" });

    await expect(
      resolveWorkspaceAccess({
        firebaseUid: "f1",
        workspaceId: "ws1",
        signIn: { signInProvider: "password", secondFactor: "totp" },
      }),
    ).resolves.toMatchObject({ role: "OWNER" });
  });
});

describe("checkWorkspacePolicy", () => {
  it("allows everything when there are no rules", () => {
    expect(checkWorkspacePolicy(noPolicy, "a@b.com", undefined)).toBeNull();
  });

  it("checks the email domain, ignoring case", () => {
    const policy = { ...noPolicy, allowedEmailDomains: ["Acme.com"] };
    expect(checkWorkspacePolicy(policy, "ana@ACME.com", undefined)).toBeNull();
    expect(checkWorkspacePolicy(policy, "ana@gmail.com", undefined)).toMatchObject({
      code: "email_domain_not_allowed",
    });
    expect(checkWorkspacePolicy(policy, "ana@evil-acme.com", undefined)).not.toBeNull();
  });

  it("requires the configured sign-in provider", () => {
    const policy = { ...noPolicy, requiredSignInProvider: "saml.acme" };
    expect(
      checkWorkspacePolicy(policy, "a@acme.com", { signInProvider: "google.com" }),
    ).toMatchObject({
      code: "sso_required",
    });
    expect(checkWorkspacePolicy(policy, "a@acme.com", { signInProvider: "saml.acme" })).toBeNull();
  });
});

describe("requireWorkspaceMember", () => {
  beforeEach(() => vi.resetAllMocks());

  const run = async (req: any) => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireWorkspaceMember(req, res, next);
    return { res, next };
  };

  it("blocks a non-member before the handler runs", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", role: "CLIENT" });
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    const { res, next } = await run({
      user: { uid: "f1", email: "a@b.com" },
      headers: { "x-workspace-id": "victim-ws" },
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("passes a member through with the resolved access", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", role: "CLIENT" });
    prismaMock.workspaceMember.findUnique.mockResolvedValue(member());
    const req: any = {
      user: { uid: "f1", email: "a@b.com" },
      headers: { "x-workspace-id": "ws1" },
    };

    const { next } = await run(req);

    expect(next).toHaveBeenCalled();
    expect(req.workspaceAccess).toMatchObject({ workspaceId: "ws1", role: "MEMBER" });
  });
});
