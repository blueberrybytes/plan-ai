/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db: any = {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    note: { groupBy: vi.fn() },
    taskUpdateProposal: { findMany: vi.fn() },
  };
  return { db, generateText: vi.fn(), sendEmail: vi.fn(), emailConfigured: vi.fn(() => true) };
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
vi.mock("../aiUsageService", () => ({ aiUsageService: { logUsage: vi.fn() } }));
vi.mock("../emailService", () => ({
  emailConfigured: mocks.emailConfigured,
  sendTeamReportEmail: mocks.sendEmail,
}));

import { buildTeamReport, resolveWeekStart, runTeamWeeklyReport } from "../teamReportService";

const { db } = mocks;
const monday = new Date("2026-09-21T00:00:00Z");

const members = [
  {
    role: "MEMBER",
    dailyReportConsentAt: new Date(),
    dailyReportConsentVersion: 1,
    user: { id: "marta", name: "Marta Puig", email: "marta@example.com" },
  },
  {
    role: "MEMBER",
    dailyReportConsentAt: null,
    dailyReportConsentVersion: null,
    user: { id: "jordi", name: null, email: "jordi@example.com" },
  },
];

const task = (over: Record<string, unknown>) => ({
  id: "t",
  title: "Task",
  assigneeId: "marta",
  dueDate: null,
  completedAt: null,
  updatedAt: new Date("2026-09-23T10:00:00Z"),
  project: { title: "Comptabilitat" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.workspace.findUnique.mockResolvedValue({
    name: "Delta",
    dailyReportEnabled: true,
    kind: "TEAM",
  });
  db.workspaceMember.findMany.mockResolvedValue(members);
  db.note.groupBy.mockResolvedValue([{ userId: "marta", _count: { _all: 4 } }]);
  db.taskUpdateProposal.findMany.mockResolvedValue([
    { taskId: "t-iva", detail: "Falten factures" },
    { taskId: "t-iva", detail: "older reason" },
  ]);
});

describe("which week", () => {
  it("defaults to last week, Monday to Sunday", () => {
    expect(resolveWeekStart(undefined, new Date("2026-10-01T12:00:00Z")).toISOString()).toBe(
      "2026-09-21T00:00:00.000Z",
    );
  });

  it("takes any day of the week asked for", () => {
    expect(resolveWeekStart("2026-09-24").toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("refuses something that is not a date", () => {
    expect(() => resolveWeekStart("last week")).toThrow();
  });
});

describe("building the report", () => {
  it("counts per member what was closed, is stuck and is past due", async () => {
    db.task.findMany
      .mockResolvedValueOnce([
        task({ id: "t-banc", title: "Conciliar el banc", completedAt: new Date("2026-09-22") }),
        task({ id: "t-old", title: "Closed from the board" }),
      ])
      .mockResolvedValueOnce([
        task({ id: "t-iva", title: "Tancar l'IVA", status: "BLOCKED" }),
        task({
          id: "t-late",
          title: "Revisar contracte",
          status: "BACKLOG",
          dueDate: new Date("2026-09-20"),
        }),
        task({
          id: "t-later",
          title: "Next month",
          status: "IN_PROGRESS",
          dueDate: new Date("2026-11-01"),
        }),
      ]);

    const report = await buildTeamReport("ws", monday);

    expect(report).toMatchObject({ weekStart: "2026-09-21", weekEnd: "2026-09-27" });
    const [jordi, marta] = report.members; // sorted by name, jordi's email sorts first
    expect(marta).toMatchObject({
      name: "Marta Puig",
      usesDailyReport: true,
      completedCount: 2,
      inProgressCount: 1,
      overdueCount: 1,
      reportDays: 4,
    });
    expect(marta.blocked[0]).toMatchObject({ id: "t-iva", reason: "Falten factures" });
    expect(marta.overdue[0].id).toBe("t-late");
    expect(jordi).toMatchObject({ name: "jordi@example.com", reportDays: null, completedCount: 0 });
  });

  it("does not call a task late before its day, in the week still running", async () => {
    db.task.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        task({ id: "t-fri", status: "BACKLOG", dueDate: new Date("2026-09-25") }),
        task({ id: "t-mon", status: "BACKLOG", dueDate: new Date("2026-09-21") }),
      ]);
    const report = await buildTeamReport("ws", monday, new Date("2026-09-23T10:00:00Z"));
    const marta = report.members.find((m) => m.userId === "marta");
    expect(marta?.overdue.map((t) => t.id)).toEqual(["t-mon"]);
  });

  it("never reads the text of daily reports", async () => {
    db.task.findMany.mockResolvedValue([]);
    await buildTeamReport("ws", monday);
    const where = db.note.groupBy.mock.calls[0][0];
    expect(where.by).toEqual(["userId"]);
    expect(JSON.stringify(where)).not.toContain('"body":true');
  });
});

describe("the Monday run", () => {
  it("sends to owners and admins and skips a workspace with no activity", async () => {
    db.workspace.findMany.mockResolvedValue([
      {
        id: "ws-busy",
        members: [{ user: { id: "boss", email: "boss@example.com", name: "Boss" } }],
      },
      {
        id: "ws-quiet",
        members: [{ user: { id: "boss2", email: "boss2@example.com", name: null } }],
      },
    ]);
    db.task.findMany
      .mockResolvedValueOnce([task({ id: "t1" })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.generateText.mockRejectedValue(new Error("no key"));

    const result = await runTeamWeeklyReport(new Date("2026-09-28T08:15:00Z"));

    expect(result).toMatchObject({ workspaces: 2, sent: 1, skipped: 1, failed: 0 });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toBe("boss@example.com");
    const where = db.workspace.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ kind: "TEAM", dailyReportEnabled: true });
  });
});
