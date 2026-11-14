/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { user: { findFirst: vi.fn() } },
  deleteUserData: vi.fn(),
  deleteFirebaseUser: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("../../middleware/authMiddleware", () => ({
  // Decorator metadata reads this interface name at runtime.
  AuthenticatedRequest: Object,
}));
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.prisma }));
vi.mock("../../firebase/firebaseAdmin", () => ({
  firebaseAdmin: { auth: () => ({ deleteUser: mocks.deleteFirebaseUser }) },
}));
vi.mock("../../services/auditLogService", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../../services/customThemeService", () => ({ customThemeService: {} }));
vi.mock("../../services/dataDeletionService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/dataDeletionService")>()),
  deleteUserData: mocks.deleteUserData,
}));

import { AccountController, SessionAccountController } from "../accountController";
import { AccountDeletionBlockedError } from "../../services/dataDeletionService";

const request = { user: { uid: "fb-1" } } as any;

describe("account self-deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mocks.deleteUserData.mockResolvedValue(undefined);
    mocks.deleteFirebaseUser.mockResolvedValue(undefined);
  });

  it("DELETE /api/session/me deletes the user and answers 200", async () => {
    const controller = new SessionAccountController();
    const result = await controller.deleteMe(request);

    expect(result).toMatchObject({ status: 200, data: true });
    expect(controller.getStatus()).toBe(200);
    expect(mocks.deleteUserData).toHaveBeenCalledWith("u1");
    expect(mocks.deleteFirebaseUser).toHaveBeenCalledWith("fb-1");
  });

  it("DELETE /api/session/me sends 409 as the HTTP status when a workspace blocks it", async () => {
    mocks.deleteUserData.mockRejectedValue(new AccountDeletionBlockedError(["Acme"]));
    const controller = new SessionAccountController();
    const result = await controller.deleteMe(request);

    expect(result.status).toBe(409);
    expect(result.data).toBe(false);
    expect(result.message).toContain("Acme");
    // The apps only read the HTTP status: a 200 here would sign them out.
    expect(controller.getStatus()).toBe(409);
    expect(mocks.deleteFirebaseUser).not.toHaveBeenCalled();
  });

  it("DELETE /api/session/me sends 404 when the user is not in the database", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    const controller = new SessionAccountController();
    await controller.deleteMe(request);

    expect(controller.getStatus()).toBe(404);
    expect(mocks.deleteUserData).not.toHaveBeenCalled();
  });

  it("account/self keeps answering HTTP 200 with the outcome in the body, as the web expects", async () => {
    mocks.deleteUserData.mockRejectedValue(new AccountDeletionBlockedError(["Acme"]));
    const controller = new AccountController();
    const result = await controller.deleteMyAccount(request);

    expect(result.status).toBe(409);
    expect(controller.getStatus()).toBeUndefined();
  });
});
