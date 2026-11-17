/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    workspace: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    workspaceMember: { findMany: vi.fn(), groupBy: vi.fn() },
  } as any,
}));
vi.mock("../../prisma/prismaClient", () => ({ rawPrisma: mocks.db, default: mocks.db }));

import {
  courtesyCountByOwner,
  createCourtesyWorkspace,
  listUserWorkspaces,
  setWorkspaceCourtesy,
} from "../adminCourtesyService";

const membership = (role: string, name: string, isCourtesy = false) => ({
  role,
  workspace: {
    id: `w_${name}`,
    name,
    kind: "TEAM",
    tier: "FREE",
    isCourtesy,
    _count: { members: 3 },
  },
});

beforeEach(() => vi.resetAllMocks());

describe("listUserWorkspaces", () => {
  it("answers 404 for a user that does not exist", async () => {
    mocks.db.user.findUnique.mockResolvedValue(null);
    await expect(listUserWorkspaces("nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("lists the user's workspaces, the ones they own first", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: "u1" });
    mocks.db.workspaceMember.findMany.mockResolvedValue([
      membership("MEMBER", "Zeta"),
      membership("OWNER", "Beta", true),
      membership("ADMIN", "Alfa"),
      membership("OWNER", "Acme"),
    ]);
    const list = await listUserWorkspaces("u1");
    expect(list.map((w) => `${w.role}:${w.name}`)).toEqual([
      "OWNER:Acme",
      "OWNER:Beta",
      "ADMIN:Alfa",
      "MEMBER:Zeta",
    ]);
    expect(list[1]).toMatchObject({ workspaceId: "w_Beta", isCourtesy: true, members: 3 });
  });
});

describe("setWorkspaceCourtesy", () => {
  it("turns courtesy on and reports the change", async () => {
    mocks.db.workspace.findUnique.mockResolvedValue({ id: "w1", name: "Acme", isCourtesy: false });
    expect(await setWorkspaceCourtesy("w1", true)).toEqual({
      workspaceId: "w1",
      name: "Acme",
      isCourtesy: true,
      changed: true,
    });
    expect(mocks.db.workspace.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { isCourtesy: true },
    });
  });

  it("writes nothing when the workspace already has that value", async () => {
    mocks.db.workspace.findUnique.mockResolvedValue({ id: "w1", name: "Acme", isCourtesy: true });
    expect((await setWorkspaceCourtesy("w1", true)).changed).toBe(false);
    expect(mocks.db.workspace.update).not.toHaveBeenCalled();
  });

  it("refuses a missing workspace and a value that is not a boolean", async () => {
    mocks.db.workspace.findUnique.mockResolvedValue(null);
    await expect(setWorkspaceCourtesy("nope", true)).rejects.toMatchObject({ status: 404 });
    await expect(setWorkspaceCourtesy("w1", "yes" as never)).rejects.toMatchObject({ status: 400 });
    expect(mocks.db.workspace.update).not.toHaveBeenCalled();
  });
});

describe("courtesyCountByOwner", () => {
  it("counts courtesy workspaces per owner", async () => {
    mocks.db.workspaceMember.groupBy.mockResolvedValue([
      { userId: "u1", _count: { _all: 2 } },
      { userId: "u2", _count: { _all: 1 } },
    ]);
    const counts = await courtesyCountByOwner();
    expect(counts.get("u1")).toBe(2);
    expect(counts.get("u3")).toBeUndefined();
    expect(mocks.db.workspaceMember.groupBy.mock.calls[0][0].where).toEqual({
      role: "OWNER",
      workspace: { isCourtesy: true },
    });
  });
});

describe("createCourtesyWorkspace", () => {
  it("answers 404 for a user that does not exist", async () => {
    mocks.db.user.findUnique.mockResolvedValue(null);
    await expect(createCourtesyWorkspace("nobody")).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.workspace.create).not.toHaveBeenCalled();
  });

  it("refuses with 409 when the user already has a workspace", async () => {
    mocks.db.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Ana",
      _count: { workspaceMembers: 1 },
    });
    await expect(createCourtesyWorkspace("u1")).rejects.toMatchObject({ status: 409 });
    expect(mocks.db.workspace.create).not.toHaveBeenCalled();
  });

  it("creates a courtesy workspace the user owns", async () => {
    mocks.db.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "M. D",
      _count: { workspaceMembers: 0 },
    });
    mocks.db.workspace.create.mockResolvedValue({ id: "w9", name: "M. D Workspace" });
    const created = await createCourtesyWorkspace("u1");
    expect(created).toEqual({ workspaceId: "w9", name: "M. D Workspace" });
    expect(mocks.db.workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "M. D Workspace",
          isCourtesy: true,
          members: { create: { userId: "u1", role: "OWNER" } },
        },
      }),
    );
  });

  it("names the workspace Personal when the user has no name", async () => {
    mocks.db.user.findUnique.mockResolvedValue({
      id: "u2",
      name: null,
      _count: { workspaceMembers: 0 },
    });
    mocks.db.workspace.create.mockResolvedValue({ id: "w10", name: "Personal Workspace" });
    await createCourtesyWorkspace("u2");
    expect(mocks.db.workspace.create.mock.calls[0][0].data.name).toBe("Personal Workspace");
  });
});
