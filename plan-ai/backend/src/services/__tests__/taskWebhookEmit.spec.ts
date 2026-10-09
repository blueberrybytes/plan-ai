/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Where the task service announces a change to the webhooks. */

const mocks = vi.hoisted(() => ({
  db: {
    task: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  } as any,
  order: [] as string[],
  emitTaskUpdated: vi.fn(async () => undefined),
  emitTaskDeleted: vi.fn(async () => undefined),
  snapshotTaskForDelete: vi.fn(),
}));
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));
vi.mock("../webhookService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../webhookService")>()),
  emitTaskUpdated: mocks.emitTaskUpdated,
  emitTaskDeleted: mocks.emitTaskDeleted,
  snapshotTaskForDelete: mocks.snapshotTaskForDelete,
}));

import { taskCrudService } from "../taskCrudService";

const { db } = mocks;
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "A",
  status: "BACKLOG",
  assigneeId: null,
  dueDate: null,
  completedAt: null,
  dependants: [],
  dependencies: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  db.task.findFirst.mockResolvedValue(row());
  db.task.findUnique.mockResolvedValue(row());
});

describe("task webhooks", () => {
  it("takes the snapshot before the delete and emits after it", async () => {
    const snapshot = { data: { id: "t1" } };
    mocks.snapshotTaskForDelete.mockImplementation(async () => {
      mocks.order.push("snapshot");
      return snapshot;
    });
    db.task.delete.mockImplementation(async () => {
      mocks.order.push("delete");
    });
    mocks.emitTaskDeleted.mockImplementation(async () => {
      mocks.order.push("emit");
    });
    await taskCrudService.deleteTaskForWorkspace("ws", "t1");
    expect(mocks.order).toEqual(["snapshot", "delete", "emit"]);
    expect(mocks.emitTaskDeleted).toHaveBeenCalledWith("ws", snapshot);
  });

  it("emits nothing when the delete fails", async () => {
    mocks.snapshotTaskForDelete.mockResolvedValue({ data: {} });
    db.task.delete.mockRejectedValue(new Error("db"));
    await expect(taskCrudService.deleteTaskForWorkspace("ws", "t1")).rejects.toThrow("db");
    expect(mocks.emitTaskDeleted).not.toHaveBeenCalled();
  });

  it("says which fields changed, and passes an empty list for a change webhooks ignore", async () => {
    db.task.update.mockResolvedValue(row({ title: "B", status: "COMPLETED" }));
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { title: "B", status: "COMPLETED" });
    expect(mocks.emitTaskUpdated).toHaveBeenLastCalledWith("ws", "t1", ["status", "title"]);

    db.task.update.mockResolvedValue(row());
    await taskCrudService.updateTaskForWorkspace("ws", "t1", { description: "more detail" });
    expect(mocks.emitTaskUpdated).toHaveBeenLastCalledWith("ws", "t1", []);
  });
});
