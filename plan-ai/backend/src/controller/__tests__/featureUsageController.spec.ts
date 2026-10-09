import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceAccess: vi.fn(),
  executeRaw: vi.fn().mockResolvedValue(1),
}));

vi.mock("../../services/workspaceAccess", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess,
  workspaceIdFromHeaders: (headers: Record<string, unknown>) => headers["x-workspace-id"],
}));
vi.mock("../../prisma/prismaClient", () => ({
  default: {},
  rawPrisma: { $executeRaw: mocks.executeRaw },
}));
vi.mock("../../services/subscriptionGuard", () => ({ requireActiveSubscription: vi.fn() }));
vi.mock("../../services/usageLimitGuard", () => ({ checkUsageLimit: vi.fn() }));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { flushFeatureUsage, resetFeatureUsageBuffer } from "../../services/featureUsageService";
import { FeatureUsageController, type TrackFeatureBody } from "../featureUsageController";

const request = {
  user: { uid: "firebase-1" },
  headers: { "x-workspace-id": "w1" },
} as unknown as AuthenticatedRequest;

/** The values of the rows written: [day, feature, client, workspaceId, userId, count]. */
const written = (): unknown[][] =>
  mocks.executeRaw.mock.calls.flatMap((call) => {
    const values = (call[1] as { values: unknown[] }).values;
    const rows: unknown[][] = [];
    for (let i = 0; i < values.length; i += 7) rows.push(values.slice(i + 1, i + 7));
    return rows;
  });

beforeEach(() => {
  resetFeatureUsageBuffer();
  mocks.executeRaw.mockClear();
  mocks.resolveWorkspaceAccess.mockReset().mockResolvedValue({
    user: { id: "u1", email: "ana@example.com" },
    workspaceId: "w1",
    role: "MEMBER",
  });
});

describe("POST /api/usage/feature", () => {
  it("counts a known name for the user of the token and the workspace of the header", async () => {
    const controller = new FeatureUsageController();
    await controller.trackFeatureUse(request, { feature: "nav.projects", client: "web" });
    await flushFeatureUsage();

    expect(controller.getStatus()).toBe(204);
    expect(written().map((row) => row.slice(1))).toEqual([["nav.projects", "web", "w1", "u1", 1]]);
  });

  it("ignores every other field of the body", async () => {
    const controller = new FeatureUsageController();
    const body = {
      feature: "doc.printed_pdf",
      client: "web",
      userId: "someone-else",
      workspaceId: "another-workspace",
      title: "Board meeting minutes",
      properties: { search: "salaries" },
      count: 500,
    } as unknown as TrackFeatureBody;
    await controller.trackFeatureUse(request, body);
    await flushFeatureUsage();

    expect(written().map((row) => row.slice(1))).toEqual([
      ["doc.printed_pdf", "web", "w1", "u1", 1],
    ]);
    const stored = JSON.stringify(mocks.executeRaw.mock.calls);
    for (const leaked of ["someone-else", "another-workspace", "Board", "salaries"]) {
      expect(stored).not.toContain(leaked);
    }
  });

  it("drops an unknown name without an error", async () => {
    const controller = new FeatureUsageController();
    await expect(
      controller.trackFeatureUse(request, { feature: "nav.payroll", client: "web" }),
    ).resolves.toBeUndefined();
    await controller.trackFeatureUse(request, { feature: "meeting.recorded", client: "web" });
    await controller.trackFeatureUse(request, { feature: "nav.projects", client: "mcp" });
    await controller.trackFeatureUse(request, {} as TrackFeatureBody);
    await flushFeatureUsage();

    expect(controller.getStatus()).toBe(204);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("counts nothing when the caller is not a member of the workspace", async () => {
    mocks.resolveWorkspaceAccess.mockRejectedValue({ status: 403, message: "Forbidden" });
    const controller = new FeatureUsageController();
    await expect(
      controller.trackFeatureUse(request, { feature: "nav.projects", client: "web" }),
    ).rejects.toMatchObject({ status: 403 });
    await flushFeatureUsage();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
