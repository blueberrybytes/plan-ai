/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db: any = {
    task: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    project: { findFirst: vi.fn() },
    workspaceMember: { findUnique: vi.fn() },
  };
  return { db };
});
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));

import { taskCrudService } from "../taskCrudService";

const { db } = mocks;
const stored = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  status: "IN_PROGRESS",
  completedAt: null,
  assigneeId: null,
  dependants: [],
  dependencies: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.task.findUnique.mockResolvedValue(stored());
  db.project.findFirst.mockResolvedValue({ id: "p1" });
});

describe("closing a task", () => {
  it("stamps the time when the status becomes COMPLETED", async () => {
    db.task.findFirst.mockResolvedValue(stored());
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { status: "COMPLETED" });
    expect(db.task.update.mock.calls[0][0].data).toEqual({
      status: "COMPLETED",
      completedAt: expect.any(Date),
    });
  });

  it("keeps the first time when a closed task is saved again", async () => {
    db.task.findFirst.mockResolvedValue(stored({ status: "COMPLETED", completedAt: new Date() }));
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { status: "COMPLETED", title: "x" });
    expect(db.task.update.mock.calls[0][0].data).toEqual({ status: "COMPLETED", title: "x" });
  });

  it("clears the time when a closed task is reopened", async () => {
    db.task.findFirst.mockResolvedValue(stored({ status: "COMPLETED", completedAt: new Date() }));
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { status: "IN_PROGRESS" });
    expect(db.task.update.mock.calls[0][0].data).toEqual({
      status: "IN_PROGRESS",
      completedAt: null,
    });
  });

  it("leaves the time alone when the status is not sent", async () => {
    db.task.findFirst.mockResolvedValue(stored());
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { title: "x" });
    expect(db.task.update.mock.calls[0][0].data).toEqual({ title: "x" });
  });
});

describe("assigning a task", () => {
  it("accepts a member of the workspace", async () => {
    db.task.findFirst.mockResolvedValue(stored());
    db.workspaceMember.findUnique.mockResolvedValue({ id: "m1" });
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { assigneeId: "marta" });
    expect(db.workspaceMember.findUnique.mock.calls[0][0].where).toEqual({
      workspaceId_userId: { workspaceId: "ws", userId: "marta" },
    });
    expect(db.task.update.mock.calls[0][0].data).toEqual({ assigneeId: "marta" });
  });

  it("refuses someone from another workspace", async () => {
    db.task.findFirst.mockResolvedValue(stored());
    db.workspaceMember.findUnique.mockResolvedValue(null);
    await expect(
      taskCrudService.updateTaskForWorkspace("ws", "t1", { assigneeId: "stranger" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("can leave the task with nobody", async () => {
    db.task.findFirst.mockResolvedValue(stored({ assigneeId: "marta" }));
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { assigneeId: null });
    expect(db.task.update.mock.calls[0][0].data).toEqual({ assigneeId: null });
    expect(db.workspaceMember.findUnique).not.toHaveBeenCalled();
  });

  it("stores the assignee and the closing time on a new task", async () => {
    db.workspaceMember.findUnique.mockResolvedValue({ id: "m1" });
    db.task.create.mockResolvedValue({ id: "t2" });
    await taskCrudService.createTaskForWorkspace("ws", {
      projectId: "p1",
      title: "Pagar nòmines",
      status: "COMPLETED",
      assigneeId: "marta",
    });
    expect(db.task.create.mock.calls[0][0].data).toMatchObject({
      assigneeId: "marta",
      status: "COMPLETED",
      completedAt: expect.any(Date),
    });
  });
});
