/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db: any = {
    workspace: { findUnique: vi.fn(), update: vi.fn() },
    workspaceMember: { findUnique: vi.fn(), updateMany: vi.fn() },
    note: { findFirst: vi.fn(), updateMany: vi.fn() },
    task: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    taskUpdateProposal: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  };
  db.$transaction = vi.fn((arg: any) => (typeof arg === "function" ? arg(db) : Promise.all(arg)));
  return { db, generateText: vi.fn(), logUsage: vi.fn(), createContext: vi.fn() };
});
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("../../utils/aiModelUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/aiModelUtils")>()),
  getWorkspaceModel: vi.fn().mockResolvedValue("model"),
}));
vi.mock("../aiUsageService", () => ({ aiUsageService: { logUsage: mocks.logUsage } }));
vi.mock("../contextService", () => ({
  contextService: { createContextForProject: mocks.createContext },
}));

import {
  DAILY_REPORT_CONSENT_VERSION,
  extractFromDayNote,
  getStatus,
  reviewProposals,
  setConsent,
  toProposalRows,
  updateSettings,
} from "../dailyReportService";

const { db } = mocks;
const actor = { userId: "marta", workspaceId: "ws", role: "MEMBER" as const };
const day = new Date("2026-10-01T00:00:00Z");
const tasks = [
  {
    id: "t-iva",
    title: "Tancar l'IVA del trimestre",
    status: "IN_PROGRESS",
    dueDate: null,
    projectTitle: "Comptabilitat",
  },
  {
    id: "t-banc",
    title: "Conciliar el banc",
    status: "BACKLOG",
    dueDate: null,
    projectTitle: "Comptabilitat",
  },
];
const projects = [{ id: "p-compta", title: "Comptabilitat" }];

const enabledWorkspace = {
  kind: "TEAM",
  dailyReportEnabled: true,
  dailyReportReminderTime: null,
};
const consented = {
  dailyReportConsentAt: new Date(),
  dailyReportConsentVersion: DAILY_REPORT_CONSENT_VERSION,
};
const dayNote = {
  id: "n1",
  title: null,
  body: "He conciliat el banc. L'IVA està aturat perquè falten factures. Demà trucar a Obres Ebre.",
  version: 3,
  tasksExtractedVersion: null,
  periodType: "DAY",
  periodStart: day,
  updatedAt: new Date("2026-10-01T17:30:00Z"),
};

const active = () => {
  db.workspace.findUnique.mockResolvedValue(enabledWorkspace);
  db.workspaceMember.findUnique.mockResolvedValue(consented);
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((arg: any) =>
    typeof arg === "function" ? arg(db) : Promise.all(arg),
  );
});

describe("status and consent", () => {
  it("asks for consent when the workspace turned it on and the member has not accepted", async () => {
    db.workspace.findUnique.mockResolvedValue(enabledWorkspace);
    db.workspaceMember.findUnique.mockResolvedValue(null);
    const status = await getStatus(actor);
    expect(status).toMatchObject({ enabled: true, needsConsent: true, reminderTime: "17:30" });
  });

  it("is never on in a personal workspace", async () => {
    db.workspace.findUnique.mockResolvedValue({ ...enabledWorkspace, kind: "PERSONAL" });
    db.workspaceMember.findUnique.mockResolvedValue(consented);
    const status = await getStatus(actor);
    expect(status).toMatchObject({ enabled: false, available: false, needsConsent: false });
  });

  it("asks again when the consent text has a new version", async () => {
    db.workspace.findUnique.mockResolvedValue(enabledWorkspace);
    db.workspaceMember.findUnique.mockResolvedValue({
      dailyReportConsentAt: new Date(),
      dailyReportConsentVersion: DAILY_REPORT_CONSENT_VERSION - 1,
    });
    expect((await getStatus(actor)).needsConsent).toBe(true);
  });

  it("drops the waiting proposals when the member withdraws", async () => {
    db.workspaceMember.updateMany.mockResolvedValue({ count: 1 });
    await setConsent(actor, false);
    expect(db.taskUpdateProposal.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws", userId: "marta", status: "PROPOSED" },
    });
  });

  it("answers 404 to someone who is not a member, such as staff on support access", async () => {
    db.workspaceMember.updateMany.mockResolvedValue({ count: 0 });
    await expect(setConsent(actor, false)).rejects.toMatchObject({ status: 404 });
  });

  it("lets only owners and admins change the settings", async () => {
    await expect(updateSettings(actor, { enabled: true })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a reminder time that is not HH:mm", async () => {
    await expect(
      updateSettings({ ...actor, role: "OWNER" }, { reminderTime: "5pm" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("checking the AI answer", () => {
  it("keeps updates of the member's own tasks and uses the stored title", () => {
    const rows = toProposalRows(
      actor,
      [
        { kind: "COMPLETED", taskId: "t-banc", projectId: null, title: "whatever", detail: "x" },
        {
          kind: "BLOCKED",
          taskId: "t-iva",
          projectId: null,
          title: "IVA",
          detail: "Falten factures",
        },
      ],
      tasks,
      projects,
      day,
      "n1",
      new Set(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "COMPLETED", title: "Conciliar el banc", detail: null });
    expect(rows[1]).toMatchObject({ kind: "BLOCKED", taskId: "t-iva", detail: "Falten factures" });
  });

  it("drops ids the member does not have, repeats and tasks already reviewed", () => {
    const rows = toProposalRows(
      actor,
      [
        { kind: "COMPLETED", taskId: "t-someone-else", projectId: null, title: "x", detail: null },
        { kind: "PROGRESS", taskId: "t-iva", projectId: null, title: "x", detail: null },
        { kind: "COMPLETED", taskId: "t-iva", projectId: null, title: "x", detail: null },
        { kind: "COMPLETED", taskId: "t-banc", projectId: null, title: "x", detail: null },
      ],
      tasks,
      projects,
      day,
      "n1",
      new Set(["t-banc"]),
    );
    expect(rows.map((r) => [r.kind, r.taskId])).toEqual([["PROGRESS", "t-iva"]]);
  });

  it("keeps a new task and forgets a project id the workspace does not have", () => {
    const rows = toProposalRows(
      actor,
      [
        {
          kind: "NEW",
          taskId: null,
          projectId: "p-invented",
          title: "  Trucar a Obres Ebre  ",
          detail: null,
        },
        { kind: "DONE", taskId: null, projectId: "p-compta", title: "Pagar nòmines", detail: null },
        { kind: "NEW", taskId: null, projectId: null, title: "trucar a obres ebre", detail: null },
        { kind: "NEW", taskId: null, projectId: null, title: "   ", detail: null },
      ],
      tasks,
      projects,
      day,
      "n1",
      new Set(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "NEW", title: "Trucar a Obres Ebre", projectId: null });
    expect(rows[1]).toMatchObject({ kind: "DONE", projectId: "p-compta" });
  });
});

describe("reading a day note", () => {
  it("refuses while the member has not accepted the text", async () => {
    db.workspace.findUnique.mockResolvedValue(enabledWorkspace);
    db.workspaceMember.findUnique.mockResolvedValue(null);
    await expect(extractFromDayNote(actor, "n1")).rejects.toMatchObject({
      status: 403,
      code: "daily_report_consent_required",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("only reads day notes", async () => {
    active();
    db.note.findFirst.mockResolvedValue({ ...dayNote, periodType: null, periodStart: null });
    await expect(extractFromDayNote(actor, "n1")).rejects.toMatchObject({ status: 400 });
  });

  it("does not pay twice for the same version", async () => {
    active();
    db.note.findFirst.mockResolvedValue(dayNote);
    db.note.updateMany.mockResolvedValue({ count: 0 });
    db.taskUpdateProposal.findMany.mockResolvedValue([]);
    const result = await extractFromDayNote(actor, "n1");
    expect(result.skipped).toBe("unchanged");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("sends the member's open tasks and stores the proposals", async () => {
    active();
    db.note.findFirst.mockResolvedValue(dayNote);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.task.findMany
      .mockResolvedValueOnce([{ ...tasks[0], project: { title: tasks[0].projectTitle } }])
      .mockResolvedValueOnce([{ ...tasks[1], project: { title: tasks[1].projectTitle } }]);
    db.project.findMany.mockResolvedValue(projects);
    db.taskUpdateProposal.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "p1" }]);
    mocks.generateText.mockResolvedValue({
      output: {
        updates: [
          { kind: "COMPLETED", taskId: "t-banc", projectId: null, title: "", detail: null },
          {
            kind: "NEW",
            taskId: null,
            projectId: null,
            title: "Trucar a Obres Ebre",
            detail: null,
          },
        ],
      },
      totalUsage: { inputTokens: 400, outputTokens: 60 },
    });

    const result = await extractFromDayNote(actor, "n1");

    expect(result.skipped).toBeNull();
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("id=t-iva");
    expect(prompt).toContain("Demà trucar a Obres Ebre");
    // Her tasks and the ones nobody owns. Never those of another member.
    expect(db.task.findMany.mock.calls.map((c: any) => c[0].where.assigneeId)).toEqual([
      "marta",
      null,
    ]);
    expect(prompt).toContain("id=t-banc");
    const created = db.taskUpdateProposal.createMany.mock.calls[0][0].data;
    expect(created.map((r: any) => r.kind)).toEqual(["COMPLETED", "NEW"]);
    expect(mocks.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "DAILY_REPORT" }),
    );
  });

  it("frees the version again when the AI fails, so the next call retries", async () => {
    active();
    db.note.findFirst.mockResolvedValue(dayNote);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.task.findMany.mockResolvedValue([]);
    db.project.findMany.mockResolvedValue([]);
    db.taskUpdateProposal.findMany.mockResolvedValue([]);
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("secret report text"), { statusCode: 500 }),
    );
    await expect(extractFromDayNote(actor, "n1")).rejects.toThrow("Daily report AI call failed");
    expect(db.note.updateMany).toHaveBeenLastCalledWith({
      where: { id: "n1", tasksExtractedVersion: 3 },
      data: { tasksExtractedVersion: null, updatedAt: dayNote.updatedAt },
    });
  });
});

describe("reviewing proposals", () => {
  const proposal = (over: Record<string, unknown>) => ({
    id: "p1",
    workspaceId: "ws",
    userId: "marta",
    noteId: "n1",
    taskId: null,
    projectId: null,
    kind: "NEW",
    title: "Trucar a Obres Ebre",
    detail: null,
    status: "PROPOSED",
    day,
    reviewedAt: null,
    createdAt: new Date(),
    ...over,
  });

  it("marks an existing task done with the time it was closed", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([
      proposal({ kind: "COMPLETED", taskId: "t-banc" }),
    ]);
    db.task.findFirst.mockResolvedValue({ id: "t-banc", status: "BACKLOG", assigneeId: "marta" });
    const result = await reviewProposals(actor, [{ id: "p1", status: "ACCEPTED" }]);
    expect(result).toEqual({ updated: 1, failed: [] });
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: "t-banc" },
      data: { status: "COMPLETED", completedAt: expect.any(Date) },
    });
  });

  it("gives the member a task nobody owned when they report on it", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([
      proposal({ kind: "PROGRESS", taskId: "t-free" }),
    ]);
    db.task.findFirst.mockResolvedValue({ id: "t-free", status: "IN_PROGRESS", assigneeId: null });
    await reviewProposals(actor, [{ id: "p1", status: "ACCEPTED" }]);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: "t-free" },
      data: { assigneeId: "marta" },
    });
  });

  it("does not touch a task that someone else took in the meantime", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([
      proposal({ kind: "COMPLETED", taskId: "t-free" }),
    ]);
    db.task.findFirst.mockResolvedValue({ id: "t-free", status: "BACKLOG", assigneeId: "jordi" });
    const result = await reviewProposals(actor, [{ id: "p1", status: "ACCEPTED" }]);
    expect(result.updated).toBe(0);
    expect(result.failed[0].message).toContain("someone else");
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("creates a new task in the Daily report project when no project fits", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([proposal({})]);
    db.project.findFirst.mockResolvedValue(null);
    db.project.create.mockResolvedValue({ id: "p-daily", title: "Daily report" });
    db.task.create.mockResolvedValue({ id: "t-new" });
    await reviewProposals(actor, [
      { id: "p1", status: "ACCEPTED", title: "Trucar a Obres Ebre dilluns" },
    ]);
    expect(db.task.create.mock.calls[0][0].data).toMatchObject({
      projectId: "p-daily",
      title: "Trucar a Obres Ebre dilluns",
      status: "BACKLOG",
      assigneeId: "marta",
    });
    expect(mocks.createContext).toHaveBeenCalled();
    expect(db.taskUpdateProposal.update.mock.calls[0][0].data).toMatchObject({
      status: "ACCEPTED",
      taskId: "t-new",
      projectId: "p-daily",
    });
  });

  it("creates work already done as a completed task", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([
      proposal({ kind: "DONE", projectId: "p-compta" }),
    ]);
    db.project.findFirst.mockResolvedValue({ id: "p-compta" });
    db.task.create.mockResolvedValue({ id: "t-done" });
    await reviewProposals(actor, [{ id: "p1", status: "ACCEPTED" }]);
    expect(db.task.create.mock.calls[0][0].data).toMatchObject({
      status: "COMPLETED",
      completedAt: expect.any(Date),
    });
  });

  it("reports a task deleted in the meantime and goes on with the rest", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([
      proposal({ id: "p1", kind: "COMPLETED", taskId: "t-gone" }),
      proposal({ id: "p2", kind: "BLOCKED", taskId: "t-iva" }),
    ]);
    db.task.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "t-iva",
      status: "IN_PROGRESS",
      assigneeId: "marta",
    });
    const result = await reviewProposals(actor, [
      { id: "p1", status: "ACCEPTED" },
      { id: "p2", status: "ACCEPTED" },
    ]);
    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([{ id: "p1", message: expect.stringContaining("no longer") }]);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: "t-iva" },
      data: { status: "BLOCKED" },
    });
  });

  it("refuses a proposal of another member", async () => {
    active();
    db.taskUpdateProposal.findMany.mockResolvedValue([]);
    const result = await reviewProposals(actor, [{ id: "p-other", status: "ACCEPTED" }]);
    expect(result).toEqual({
      updated: 0,
      failed: [{ id: "p-other", message: expect.any(String) }],
    });
    expect(db.taskUpdateProposal.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "marta",
      workspaceId: "ws",
    });
  });
});
