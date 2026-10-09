import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  task: { findFirst: vi.fn() },
  transcript: { findFirst: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  comment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

const hiddenFromMember = vi.hoisted(() => vi.fn());
vi.mock("../projectAccess", () => ({ hiddenFromMember }));

const mail = vi.hoisted(() => ({ emailConfigured: vi.fn(), sendCommentMentionEmail: vi.fn() }));
vi.mock("../emailService", () => mail);

vi.mock("../../utils/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  COMMENT_MAX_LENGTH,
  createComment,
  deleteComment,
  listComments,
  parseMentionIds,
  plainCommentBody,
  rewriteMentions,
  updateComment,
} from "../commentService";

const ana = {
  userId: "ana",
  email: "ana@example.com",
  workspaceId: "ws1",
  role: "MEMBER" as const,
};
const bob = {
  userId: "bob",
  email: "bob@example.com",
  workspaceId: "ws1",
  role: "MEMBER" as const,
};
const admin = {
  userId: "adm",
  email: "adm@example.com",
  workspaceId: "ws1",
  role: "ADMIN" as const,
};

const author = { id: "ana", name: "Ana", email: "ana@example.com", avatarUrl: null };
const member = (userId: string, name: string, role = "MEMBER") => ({
  userId,
  role,
  user: { name, email: `${userId}@example.com` },
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  workspaceId: "ws1",
  authorId: "ana",
  taskId: "t1",
  transcriptId: null,
  body: "hello",
  mentions: [],
  atSeconds: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  deletedAt: null,
  author,
  ...over,
});

const NOTHING_HIDDEN = { projectIds: [], contextIds: [] };

beforeEach(() => {
  vi.resetAllMocks();
  db.task.findFirst.mockResolvedValue({ id: "t1", title: "Fix the invoice", projectId: "p1" });
  db.transcript.findFirst.mockResolvedValue({
    id: "m1",
    title: "Kickoff",
    projectId: "p1",
    contextIds: ["ctx1"],
    durationSeconds: 600,
  });
  db.workspaceMember.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  db.comment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row(data),
  );
  db.comment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row({ ...data, updatedAt: new Date("2026-10-01T11:00:00Z") }),
  );
  hiddenFromMember.mockResolvedValue(NOTHING_HIDDEN);
  mail.emailConfigured.mockReturnValue(true);
  mail.sendCommentMentionEmail.mockResolvedValue(undefined);
});

describe("mention parsing", () => {
  it("reads several mentions, each id once, in order", () => {
    const body = "@[Bob](user:bob) and @[Cleo P.](user:cleo), again @[Bobby](user:bob)";
    expect(parseMentionIds(body)).toEqual(["bob", "cleo"]);
  });

  it("ignores malformed mentions", () => {
    const body = [
      "@Bob",
      "@[Bob]",
      "@[Bob](bob)",
      "@[Bob](user:)",
      "@[](user:bob)",
      "@[Bob] (user:bob)",
      "@[Bo\nb](user:bob)",
      "@[Bob](user:b ob)",
      "[Bob](user:bob)",
    ].join(" ");
    expect(parseMentionIds(body)).toEqual([]);
  });

  it("gives an allowed mention the real name and turns the others into text", () => {
    const body = "@[The Boss](user:bob) @[Eve](user:eve)";
    expect(rewriteMentions(body, new Map([["bob", "Bob"]]))).toBe("@[Bob](user:bob) @Eve");
    expect(plainCommentBody("hi @[Bob](user:bob)!")).toBe("hi @Bob!");
  });
});

describe("creating a comment", () => {
  it("needs exactly one target", async () => {
    await expect(createComment(ana, { body: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(
      createComment(ana, { taskId: "t1", transcriptId: "m1", body: "x" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(listComments(ana, {})).rejects.toMatchObject({ status: 400 });
    expect(db.comment.create).not.toHaveBeenCalled();
  });

  it("trims the body and enforces 1 to 5000 characters", async () => {
    await expect(createComment(ana, { taskId: "t1", body: "   " })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      createComment(ana, { taskId: "t1", body: "x".repeat(COMMENT_MAX_LENGTH + 1) }),
    ).rejects.toMatchObject({ status: 400 });

    const created = await createComment(ana, {
      taskId: "t1",
      body: `  ${"x".repeat(COMMENT_MAX_LENGTH)}  `,
    });
    expect(created.body).toHaveLength(COMMENT_MAX_LENGTH);
  });

  it("answers 404 for a task or meeting the caller cannot see", async () => {
    db.task.findFirst.mockResolvedValue(null);
    db.transcript.findFirst.mockResolvedValue(null);
    await expect(createComment(ana, { taskId: "t1", body: "x" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(createComment(ana, { transcriptId: "m1", body: "x" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(listComments(ana, { taskId: "t1" })).rejects.toMatchObject({ status: 404 });
    expect(db.comment.create).not.toHaveBeenCalled();
    expect(db.comment.findMany).not.toHaveBeenCalled();
    // The lookup is tied to the caller's workspace.
    expect(db.task.findFirst.mock.calls[0][0].where).toEqual({
      id: "t1",
      project: { workspaceId: "ws1" },
    });
    expect(db.transcript.findFirst.mock.calls[0][0].where).toEqual({
      id: "m1",
      workspaceId: "ws1",
    });
  });

  it("only takes a moment on a meeting, inside its duration", async () => {
    await expect(
      createComment(ana, { taskId: "t1", body: "x", atSeconds: 5 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createComment(ana, { transcriptId: "m1", body: "x", atSeconds: -1 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createComment(ana, { transcriptId: "m1", body: "x", atSeconds: 700 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createComment(ana, { transcriptId: "m1", body: "x", atSeconds: Number.NaN }),
    ).rejects.toMatchObject({ status: 400 });

    const created = await createComment(ana, { transcriptId: "m1", body: "x", atSeconds: 42.5 });
    expect(created).toMatchObject({ transcriptId: "m1", taskId: null, atSeconds: 42.5 });

    // A meeting with no known duration takes any moment.
    db.transcript.findFirst.mockResolvedValue({
      id: "m1",
      title: null,
      projectId: null,
      contextIds: [],
      durationSeconds: null,
    });
    await expect(
      createComment(ana, { transcriptId: "m1", body: "x", atSeconds: 9000 }),
    ).resolves.toMatchObject({ atSeconds: 9000 });
  });

  it("stores only mentioned ids that are members of the workspace", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("bob", "Bob")]);
    const created = await createComment(ana, {
      taskId: "t1",
      body: "@[Robert](user:bob) @[Stranger](user:eve) @[Robert](user:bob)",
    });

    expect(db.workspaceMember.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: "ws1",
      userId: { in: ["bob", "eve"] },
    });
    const data = db.comment.create.mock.calls[0][0].data;
    expect(data.mentions).toEqual(["bob"]);
    expect(data.body).toBe("@[Bob](user:bob) @Stranger @[Bob](user:bob)");
    expect(data).toMatchObject({ workspaceId: "ws1", authorId: "ana", taskId: "t1" });
    expect(created.mentions).toEqual([{ userId: "bob", name: "Bob" }]);
  });

  it("drops members who cannot see the restricted project", async () => {
    db.workspaceMember.findMany.mockResolvedValue([
      member("bob", "Bob"),
      member("cleo", "Cleo", "ADMIN"),
    ]);
    hiddenFromMember.mockImplementation(async (_ws: string, userId: string) =>
      userId === "bob" ? { projectIds: ["p1"], contextIds: [] } : NOTHING_HIDDEN,
    );
    await createComment(ana, { taskId: "t1", body: "@[Bob](user:bob) @[Cleo](user:cleo)" });

    expect(hiddenFromMember).toHaveBeenCalledWith("ws1", "bob", "MEMBER");
    expect(hiddenFromMember).toHaveBeenCalledWith("ws1", "cleo", "ADMIN");
    const data = db.comment.create.mock.calls[0][0].data;
    expect(data.mentions).toEqual(["cleo"]);
    expect(data.body).toBe("@Bob @[Cleo](user:cleo)");
    await vi.waitFor(() => expect(mail.sendCommentMentionEmail).toHaveBeenCalledTimes(1));
    expect(mail.sendCommentMentionEmail.mock.calls[0][0]).toBe("cleo@example.com");
  });

  it("drops members who cannot see a meeting that uses a restricted project's files", async () => {
    db.transcript.findFirst.mockResolvedValue({
      id: "m1",
      title: "Loose",
      projectId: null,
      contextIds: ["ctx-secret"],
      durationSeconds: null,
    });
    db.workspaceMember.findMany.mockResolvedValue([member("bob", "Bob")]);
    hiddenFromMember.mockResolvedValue({ projectIds: ["p9"], contextIds: ["ctx-secret"] });
    await createComment(ana, { transcriptId: "m1", body: "@[Bob](user:bob)" });
    expect(db.comment.create.mock.calls[0][0].data.mentions).toEqual([]);
  });
});

describe("mention emails", () => {
  it("emails each mentioned person once and never the author", async () => {
    db.workspaceMember.findMany.mockResolvedValue([
      member("bob", "Bob"),
      member("ana", "Ana"),
      member("cleo", "Cleo"),
    ]);
    await createComment(ana, {
      transcriptId: "m1",
      body: "@[Bob](user:bob) @[Ana](user:ana) @[Cleo](user:cleo) @[Bob](user:bob) <b>hi</b>",
    });

    await vi.waitFor(() => expect(mail.sendCommentMentionEmail).toHaveBeenCalledTimes(2));
    expect(mail.sendCommentMentionEmail.mock.calls.map((c) => c[0])).toEqual([
      "bob@example.com",
      "cleo@example.com",
    ]);
    expect(mail.sendCommentMentionEmail.mock.calls[0][1]).toMatchObject({
      authorName: "Ana",
      targetKind: "meeting",
      targetTitle: "Kickoff",
      text: "@Bob @Ana @Cleo @Bob <b>hi</b>",
    });
    expect(mail.sendCommentMentionEmail.mock.calls[0][1].url).toMatch(/\/recordings\/m1$/);
  });

  it("does not fail the request when the email fails", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("bob", "Bob"), member("cleo", "Cleo")]);
    mail.sendCommentMentionEmail.mockRejectedValue(new Error("mail down"));
    await expect(
      createComment(ana, { taskId: "t1", body: "@[Bob](user:bob) @[Cleo](user:cleo)" }),
    ).resolves.toMatchObject({ id: "c1" });
    // The second person is still tried after the first one failed.
    await vi.waitFor(() => expect(mail.sendCommentMentionEmail).toHaveBeenCalledTimes(2));
  });

  it("sends nothing when email is not configured", async () => {
    mail.emailConfigured.mockReturnValue(false);
    db.workspaceMember.findMany.mockResolvedValue([member("bob", "Bob")]);
    await createComment(ana, { taskId: "t1", body: "@[Bob](user:bob)" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(mail.sendCommentMentionEmail).not.toHaveBeenCalled();
  });

  it("does not email anybody about an edit", async () => {
    db.comment.findFirst.mockResolvedValue(row());
    db.workspaceMember.findMany.mockResolvedValue([member("bob", "Bob")]);
    const updated = await updateComment(ana, "c1", { body: " now with @[B](user:bob) " });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mail.sendCommentMentionEmail).not.toHaveBeenCalled();
    expect(db.comment.update.mock.calls[0][0].data).toEqual({
      body: "now with @[Bob](user:bob)",
      mentions: ["bob"],
    });
    expect(updated.mentions).toEqual([{ userId: "bob", name: "Bob" }]);
    expect(updated.edited).toBe(true);
  });
});

describe("who may edit and delete", () => {
  it("lets only the author edit", async () => {
    db.comment.findFirst.mockResolvedValue(row());
    await expect(updateComment(bob, "c1", { body: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(updateComment(admin, "c1", { body: "x" })).rejects.toMatchObject({ status: 403 });
    expect(db.comment.update).not.toHaveBeenCalled();
    await expect(updateComment(ana, "c1", { body: "" })).rejects.toMatchObject({ status: 400 });
    await expect(updateComment(ana, "c1", { body: "x" })).resolves.toMatchObject({ body: "x" });
  });

  it("answers 404 for a comment that is gone or out of sight", async () => {
    db.comment.findFirst.mockResolvedValue(null);
    await expect(updateComment(ana, "c1", { body: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteComment(ana, "c1")).rejects.toMatchObject({ status: 404 });
    expect(db.comment.findFirst.mock.calls[0][0].where).toEqual({
      id: "c1",
      workspaceId: "ws1",
      deletedAt: null,
    });
  });

  it("lets the author delete without an audit entry", async () => {
    db.comment.findFirst.mockResolvedValue(row());
    await deleteComment(ana, "c1");
    const update = db.comment.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "c1" });
    expect(update.data.deletedAt).toBeInstanceOf(Date);
    // Soft delete: the text is not touched.
    expect(update.data).not.toHaveProperty("body");
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses another member and lets an admin delete, with an audit entry", async () => {
    db.comment.findFirst.mockResolvedValue(row());
    await expect(deleteComment(bob, "c1")).rejects.toMatchObject({ status: 403 });
    expect(db.comment.update).not.toHaveBeenCalled();

    await deleteComment(admin, "c1");
    expect(db.comment.update).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: "ws1",
      actorUserId: "adm",
      action: "comment.deleted_by_admin",
      targetType: "comment",
      targetId: "c1",
      metadata: { authorId: "ana", taskId: "t1" },
    });
  });
});

describe("reading a thread", () => {
  it("returns the thread oldest first, without the text of deleted comments", async () => {
    // The query asks for newest first, the service turns it round.
    db.comment.findMany.mockResolvedValue([
      row({
        id: "c2",
        authorId: "bob",
        author: { id: "bob", name: "Bob", email: "bob@example.com", avatarUrl: "a.png" },
        body: "secret @[Ana](user:ana)",
        mentions: ["ana"],
        atSeconds: 12,
        deletedAt: new Date(),
      }),
      row({ id: "c1", body: "hi @[Bob](user:bob)", mentions: ["bob", "left"] }),
    ]);
    db.user.findMany.mockResolvedValue([{ id: "bob", name: "Bob", email: "bob@example.com" }]);

    const thread = await listComments(ana, { taskId: "t1" });

    expect(db.comment.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: "ws1",
      taskId: "t1",
    });
    expect(thread.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(thread[0]).toMatchObject({
      body: "hi @[Bob](user:bob)",
      deleted: false,
      edited: false,
      mentions: [{ userId: "bob", name: "Bob" }],
      canEdit: true,
      canDelete: true,
    });
    expect(thread[1]).toMatchObject({
      body: "",
      deleted: true,
      mentions: [],
      atSeconds: null,
      canEdit: false,
      canDelete: false,
      author: { id: "bob", name: "Bob", avatarUrl: "a.png" },
    });
    expect(JSON.stringify(thread)).not.toContain("secret");
    // Names are only looked up for comments that are still there.
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["bob", "left"] } });
  });

  it("marks what each caller may do", async () => {
    db.comment.findMany.mockResolvedValue([row()]);
    const asBob = (await listComments(bob, { taskId: "t1" }))[0];
    const asAdmin = (await listComments(admin, { taskId: "t1" }))[0];
    expect([asBob.canEdit, asBob.canDelete]).toEqual([false, false]);
    expect([asAdmin.canEdit, asAdmin.canDelete]).toEqual([false, true]);
  });

  it("caps the thread for tools at the newest comments", async () => {
    db.comment.findMany.mockResolvedValue([]);
    await listComments(ana, { transcriptId: "m1" }, { newest: 30 });
    expect(db.comment.findMany.mock.calls[0][0]).toMatchObject({
      where: { workspaceId: "ws1", transcriptId: "m1" },
      take: 30,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });
});
