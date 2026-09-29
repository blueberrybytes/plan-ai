/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  note: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  project: { findFirst: vi.fn() },
  transcript: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

import {
  canDeleteNote,
  canReadNote,
  createNote,
  getNote,
  getOrCreatePeriodNote,
  listNotes,
  purgeOldTrash,
  trashNote,
  updateNote,
} from "../noteService";

const ana = { userId: "ana", workspaceId: "ws1", role: "MEMBER" as const };
const owner = { userId: "boss", workspaceId: "ws1", role: "OWNER" as const };

const note = (over: Record<string, unknown> = {}) => ({
  id: "note-1",
  workspaceId: "ws1",
  userId: "ana",
  title: "Idea",
  body: "text",
  visibility: "PRIVATE",
  pinned: false,
  projectId: null,
  transcriptId: null,
  periodType: null,
  periodStart: null,
  source: "WEB",
  version: 3,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("who can see and change a note", () => {
  it("keeps a private note to its author, owners included", () => {
    expect(canReadNote(note() as any, "ana")).toBe(true);
    expect(canReadNote(note() as any, "boss")).toBe(false);
    expect(canReadNote(note({ visibility: "WORKSPACE" }) as any, "boss")).toBe(true);
  });

  it("lets an owner delete a shared note but not a private one", () => {
    expect(canDeleteNote(note({ visibility: "WORKSPACE" }) as any, "boss", "OWNER")).toBe(true);
    expect(canDeleteNote(note() as any, "boss", "OWNER")).toBe(false);
    expect(canDeleteNote(note({ visibility: "WORKSPACE" }) as any, "bob", "MEMBER")).toBe(false);
  });

  it("answers 404 for someone else's private note, so the id is not confirmed", async () => {
    db.note.findFirst.mockResolvedValue(note());
    await expect(getNote(owner, "note-1")).rejects.toMatchObject({ status: 404 });
  });

  it("only lists notes the user may read", async () => {
    db.note.findMany.mockResolvedValue([]);
    await listNotes(ana, { scope: "all" });
    const where = db.note.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"OR":[{"userId":"ana"},{"visibility":"WORKSPACE"}]');
    expect(JSON.stringify(where)).toContain('"workspaceId":"ws1"');
  });

  it("shows only the user's own notes in the trash", async () => {
    db.note.findMany.mockResolvedValue([]);
    await listNotes(ana, { scope: "trash" });
    const where = JSON.stringify(db.note.findMany.mock.calls[0][0].where);
    expect(where).toContain('"userId":"ana"');
    expect(where).not.toContain("WORKSPACE");
  });
});

describe("creating notes", () => {
  it("returns the first note when the phone retries the same create", async () => {
    db.note.findUnique.mockResolvedValue(note({ id: "phone-note-000000001" }));

    const result = await createNote(ana, { id: "phone-note-000000001", body: "text" });

    expect(result.id).toBe("phone-note-000000001");
    expect(db.note.create).not.toHaveBeenCalled();
  });

  it("refuses an id that belongs to someone else's note", async () => {
    db.note.findUnique.mockResolvedValue(note({ id: "phone-note-000000001", userId: "bob" }));
    await expect(createNote(ana, { id: "phone-note-000000001" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("refuses a project from another workspace", async () => {
    db.project.findFirst.mockResolvedValue(null);
    await expect(createNote(ana, { projectId: "other-ws-project" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("writes an audit entry when a note is created already shared", async () => {
    db.note.create.mockResolvedValue(note({ visibility: "WORKSPACE" }));
    await createNote(ana, { body: "x", visibility: "WORKSPACE" });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("note.shared");
  });
});

describe("editing notes", () => {
  it("only lets the author edit", async () => {
    db.note.findFirst.mockResolvedValue(note({ visibility: "WORKSPACE" }));
    await expect(updateNote(owner, "note-1", { body: "mine now" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("refuses an edit made on an older version and sends the current note back", async () => {
    db.note.findFirst.mockResolvedValue(note());
    db.note.updateMany.mockResolvedValue({ count: 0 });
    db.note.findUnique.mockResolvedValue(note({ version: 4, body: "from the laptop" }));

    await expect(
      updateNote(ana, "note-1", { body: "from the phone", baseVersion: 3 }),
    ).rejects.toMatchObject({
      status: 409,
      code: "note_version_conflict",
      current: expect.objectContaining({ body: "from the laptop" }),
    });
  });

  it("bumps the version on a clean edit", async () => {
    db.note.findFirst.mockResolvedValue(note());
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.note.findUniqueOrThrow.mockResolvedValue(note({ version: 4 }));

    await updateNote(ana, "note-1", { body: "new", baseVersion: 3 });

    const call = db.note.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "note-1", version: 3 });
    expect(call.data.version).toEqual({ increment: 1 });
  });
});

describe("trash", () => {
  it("lets an owner delete a shared note and audits it", async () => {
    db.note.findFirst.mockResolvedValue(note({ visibility: "WORKSPACE" }));
    await trashNote(owner, "note-1");
    expect(db.note.update).toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("note.deleted");
  });

  it("empties notes older than 30 days", async () => {
    db.note.deleteMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-10-31T00:00:00Z");

    expect(await purgeOldTrash(now)).toBe(2);
    const before: Date = db.note.deleteMany.mock.calls[0][0].where.deletedAt.lt;
    expect(before.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("daily and weekly notes", () => {
  it("keys a weekly note on the Monday of that week", async () => {
    db.note.upsert.mockResolvedValue(note());
    await getOrCreatePeriodNote(ana, "WEEK", "2026-10-01"); // a Thursday

    const key = db.note.upsert.mock.calls[0][0].where.workspaceId_userId_periodType_periodStart;
    expect(key.periodStart.toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("refuses a malformed date", async () => {
    await expect(getOrCreatePeriodNote(ana, "DAY", "29/09/2026")).rejects.toMatchObject({
      status: 400,
    });
  });
});
