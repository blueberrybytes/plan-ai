/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";
import express from "express";

/**
 * The public API end to end: the real Express router, the real token check,
 * the real task service and the real request scope. Prisma is a small
 * in-memory stand-in that honours the filters the routes send, and hides the
 * restricted projects of the request scope the way the real client does.
 *
 * Two workspaces. ws_1 has Ana (owner) and Ben (member, not in the HR
 * project). ws_2 is another customer.
 */

const mocks = vi.hoisted(() => {
  const tables: Record<string, any[]> = {};
  const scope = { hidden: (): { projectIds: string[] } | null => null };

  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v);
  const OPERATORS = ["equals", "gte", "lt", "in", "notIn"];

  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([key, cond]: [string, any]) => {
      if (cond === undefined) return true;
      if (key === "AND") return cond.every((c: any) => matches(row, c));
      if (key === "OR") return cond.some((c: any) => matches(row, c));
      if (key === "workspaceId_userId") return matches(row, cond);
      const value = row[key];
      if (cond === null || typeof cond !== "object" || cond instanceof Date) {
        return same(value, cond);
      }
      if (Object.keys(cond).some((op) => OPERATORS.includes(op))) {
        const fold = cond.mode === "insensitive" ? lower : (v: unknown) => v;
        if ("equals" in cond && fold(value) !== fold(cond.equals)) return false;
        if ("gte" in cond && !(value >= cond.gte)) return false;
        if ("lt" in cond && !(value < cond.lt)) return false;
        if ("in" in cond && !cond.in.includes(value)) return false;
        if ("notIn" in cond && cond.notIn.includes(value)) return false;
        return true;
      }
      return value !== null && value !== undefined && matches(value, cond);
    });

  /** What the real client adds for the caller's hidden projects. */
  const visible = (model: string, row: any): boolean => {
    const hidden = scope.hidden()?.projectIds ?? [];
    if (model === "project") return !hidden.includes(row.id);
    if (model === "task" || model === "transcript") return !hidden.includes(row.projectId);
    return true;
  };

  const newestFirst = (a: any, b: any) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

  const copy = (row: any) => (row ? { ...row } : null);

  const model = (name: string) => {
    const rows = () => (tables[name] ?? []).filter((r) => visible(name, r));
    return {
      findMany: vi.fn(async ({ where, take }: any = {}) => {
        const found = rows()
          .filter((r) => matches(r, where))
          .sort(newestFirst);
        return take ? found.slice(0, take) : found;
      }),
      // Copies, like rows read from a database: a later update does not change them.
      findFirst: vi.fn(async ({ where }: any = {}) => copy(rows().find((r) => matches(r, where)))),
      findUnique: vi.fn(async ({ where }: any = {}) => copy(rows().find((r) => matches(r, where)))),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `${name}_${(tables[name] ?? []).length + 1}`,
          createdAt: new Date("2026-10-09T12:00:00.000Z"),
          updatedAt: new Date("2026-10-09T12:00:00.000Z"),
          ...data,
        };
        if (name === "task") {
          const project = tables.project.find((p) => p.id === data.projectId);
          const assignee = tables.user.find((u) => u.id === data.assigneeId) ?? null;
          Object.assign(row, { project, assignee, parentId: null, subtasks: [] });
          Object.assign(row, { transcriptLinks: [], dependants: [], dependencies: [] });
        }
        (tables[name] ??= []).push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = (tables[name] ?? []).find((r) => matches(r, where));
        if (!row) return null;
        Object.assign(row, data);
        if (name === "task" && "assigneeId" in data) {
          row.assignee = tables.user.find((u) => u.id === data.assigneeId) ?? null;
        }
        return row;
      }),
    };
  };

  const db: Record<string, ReturnType<typeof model>> = {};
  for (const name of [
    "user",
    "workspace",
    "workspaceMember",
    "mcpToken",
    "project",
    "transcript",
    "task",
  ]) {
    db[name] = model(name);
  }

  return {
    tables,
    scope,
    db,
    emitTaskCreated: vi.fn(async () => undefined),
    emitTaskUpdated: vi.fn(async () => undefined),
    recordMeetingAccess: vi.fn(async () => undefined),
  };
});

vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db, rawPrisma: mocks.db }));
// The rule itself has its own tests. Here: Ben does not see the HR project.
vi.mock("../../services/projectAccess", () => ({
  hiddenFromMember: async (_ws: string, userId: string, role: string) =>
    role !== "OWNER" && userId === "u_ben"
      ? { projectIds: ["p_hr"], contextIds: [] }
      : { projectIds: [], contextIds: [] },
  hiddenFromOutsiders: async () => ({ projectIds: ["p_hr"], contextIds: [] }),
}));
vi.mock("../../services/webhookService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/webhookService")>()),
  emitTaskCreated: mocks.emitTaskCreated,
  emitTaskUpdated: mocks.emitTaskUpdated,
}));
vi.mock("../../services/meetingAccessAudit", () => ({
  recordMeetingAccess: mocks.recordMeetingAccess,
}));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { accessScopeMiddleware, hiddenFromCaller } from "../../services/accessScope";
import { publicApiRouter, decodeCursor, encodeCursor } from "../publicApiRouter";
import { publicApiOpenApi } from "../../publicApi/openapi";

const { tables, db } = mocks;
mocks.scope.hidden = hiddenFromCaller;

const hash = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
const ANA = "PAI_sk_ana";
const BEN = "PAI_sk_ben";
const OTHER = "PAI_sk_other";
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 10));

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.user = [
    { id: "u_ana", email: "ana@example.com", name: "Ana" },
    { id: "u_ben", email: "ben@example.com", name: "Ben" },
    { id: "u_x", email: "boss@other.com", name: "Boss" },
  ];
  tables.workspace = [
    { id: "ws_1", name: "Acme", allowedEmailDomains: [] },
    { id: "ws_2", name: "Other", allowedEmailDomains: [] },
  ];
  const member = (workspaceId: string, userId: string, role: string) => ({
    workspaceId,
    userId,
    role,
    user: tables.user.find((u) => u.id === userId),
    workspace: tables.workspace.find((w) => w.id === workspaceId),
  });
  tables.workspaceMember = [
    member("ws_1", "u_ana", "OWNER"),
    member("ws_1", "u_ben", "MEMBER"),
    member("ws_2", "u_x", "OWNER"),
  ];
  tables.mcpToken = [
    { id: "tok_ana", tokenHash: hash(ANA), userId: "u_ana", workspaceId: "ws_1" },
    { id: "tok_ben", tokenHash: hash(BEN), userId: "u_ben", workspaceId: "ws_1" },
    { id: "tok_x", tokenHash: hash(OTHER), userId: "u_x", workspaceId: "ws_2" },
  ];
  const project = (
    id: string,
    workspaceId: string,
    title: string,
    n: number,
    visibility = "WORKSPACE",
  ) => ({
    id,
    workspaceId,
    title,
    description: null,
    status: "ACTIVE",
    visibility,
    createdAt: day(n),
    updatedAt: day(n),
    _count: { transcripts: 1, tasks: 1 },
  });
  tables.project = [
    project("p_open", "ws_1", "Website", 1),
    project("p_hr", "ws_1", "HR", 2, "RESTRICTED"),
    project("p_x", "ws_2", "Secret plan", 3),
  ];
  const ref = (id: string) => {
    const p = tables.project.find((row) => row.id === id);
    return { id: p.id, title: p.title, workspaceId: p.workspaceId };
  };
  const task = (id: string, projectId: string, n: number, over: Record<string, unknown> = {}) => ({
    id,
    projectId,
    title: `Task ${id}`,
    description: null,
    acceptanceCriteria: null,
    status: "BACKLOG",
    priority: "MEDIUM",
    type: "TASK",
    dueDate: null,
    completedAt: null,
    parentId: null,
    assigneeId: null,
    assignee: null,
    createdAt: day(n),
    updatedAt: day(n),
    project: ref(projectId),
    subtasks: [],
    transcriptLinks: [],
    dependants: [],
    dependencies: [],
    ...over,
  });
  tables.task = [
    task("t_1", "p_open", 1),
    task("t_2", "p_open", 2, {
      status: "IN_PROGRESS",
      assigneeId: "u_ben",
      assignee: { id: "u_ben", name: "Ben", email: "ben@example.com" },
    }),
    task("t_3", "p_open", 3, { updatedAt: day(8) }),
    task("t_hr", "p_hr", 4),
    task("t_x", "p_x", 5),
  ];
  const meeting = (id: string, workspaceId: string, projectId: string | null, n: number) => ({
    id,
    workspaceId,
    projectId,
    title: `Meeting ${id}`,
    summary: `Summary of ${id}`,
    language: "en",
    source: "RECORDING",
    durationSeconds: 600,
    speakerCount: 2,
    metadata: {
      processingStatus: "COMPLETED",
      speakers: [
        {
          label: "Speaker 0",
          identifiedName: "Ana",
          role: "PM",
          speakingTimeSeconds: 300,
          utteranceCount: 1,
        },
        { label: "Speaker 1", identifiedName: null, speakingTimeSeconds: 200, utteranceCount: 1 },
      ],
      speakerNameOverrides: { "Speaker 1": "Carl" },
    },
    recordedAt: day(n),
    createdAt: day(n),
    updatedAt: day(n),
    project: projectId ? ref(projectId) : null,
    transcript: `FULL TEXT OF ${id}`,
    utterances: [
      { speaker: "Speaker 0", transcript: "Hello", start: 0, end: 1.5, words: [{ word: "Hello" }] },
      { speaker: "Speaker 1", transcript: "Hi", start: 2, end: 2.5, words: [] },
    ],
    rawMicUrl: "gs://bucket/mic.webm",
    taskLinks: [
      {
        task: {
          id: "t_1",
          title: "Task t_1",
          status: "BACKLOG",
          priority: "MEDIUM",
          projectId: "p_open",
          assignee: null,
        },
      },
      {
        task: {
          id: "t_hr",
          title: "Task t_hr",
          status: "BACKLOG",
          priority: "MEDIUM",
          projectId: "p_hr",
          assignee: null,
        },
      },
    ],
  });
  tables.transcript = [
    meeting("m_1", "ws_1", "p_open", 1),
    meeting("m_2", "ws_1", null, 2),
    meeting("m_hr", "ws_1", "p_hr", 3),
    meeting("m_x", "ws_2", "p_x", 4),
  ];
}

let server: http.Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(accessScopeMiddleware);
  app.use(express.json());
  app.use("/api/v1", publicApiRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FRONTEND_URL", "https://app.example.com");
  seed();
});

async function call(path: string, token: string | null = ANA, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  return { status: res.status, body: (await res.json()) as any };
}
const send = (method: string, path: string, body: unknown, token = ANA) =>
  call(path, token, { method, body: JSON.stringify(body) });

const PROTECTED = [
  "/me",
  "/projects",
  "/projects/p_open",
  "/meetings",
  "/meetings/m_1",
  "/tasks",
  "/tasks/t_1",
];

describe("auth", () => {
  it.each(PROTECTED)("refuses %s without a token", async (path) => {
    const res = await call(path, null);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
  });

  it("refuses a wrong token, also one with the right prefix", async () => {
    expect((await call("/me", "nope")).status).toBe(401);
    expect((await call("/me", "PAI_sk_wrong")).status).toBe(401);
  });

  it("refuses a Firebase-looking token: only personal tokens work here", async () => {
    expect((await call("/me", "eyJhbGciOiJSUzI1NiJ9.e30.sig")).status).toBe(401);
  });

  it("refuses a revoked token", async () => {
    expect((await call("/me", BEN)).status).toBe(200);
    tables.mcpToken = tables.mcpToken.filter((t) => t.id !== "tok_ben");
    expect((await call("/me", BEN)).status).toBe(401);
  });

  it("refuses the token of someone removed from the workspace", async () => {
    tables.workspaceMember = tables.workspaceMember.filter((m) => m.userId !== "u_ben");
    expect((await call("/tasks", BEN)).status).toBe(401);
  });

  it("refuses writes without a token and writes nothing", async () => {
    const res = await call("/tasks", null, {
      method: "POST",
      body: JSON.stringify({ projectId: "p_open", title: "x" }),
    });
    expect(res.status).toBe(401);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("serves the description without a token", async () => {
    const res = await call("/openapi.json", null);
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
  });

  it("says who the token is", async () => {
    expect((await call("/me", BEN)).body).toEqual({
      user: { id: "u_ben", email: "ben@example.com", name: "Ben" },
      workspace: { id: "ws_1", name: "Acme" },
      role: "MEMBER",
    });
  });
});

describe("workspace scoping", () => {
  it("lists only the token's workspace", async () => {
    const ids = async (path: string, token = ANA) =>
      (await call(path, token)).body.data.map((r: any) => r.id).sort();
    expect(await ids("/projects")).toEqual(["p_hr", "p_open"]);
    expect(await ids("/meetings")).toEqual(["m_1", "m_2", "m_hr"]);
    expect(await ids("/tasks")).toEqual(["t_1", "t_2", "t_3", "t_hr"]);
    expect(await ids("/projects", OTHER)).toEqual(["p_x"]);
    expect(await ids("/meetings", OTHER)).toEqual(["m_x"]);
    expect(await ids("/tasks", OTHER)).toEqual(["t_x"]);
  });

  it.each(["/projects/p_x", "/meetings/m_x", "/tasks/t_x"])(
    "answers 404 for %s, a row of another workspace",
    async (path) => {
      const res = await call(path);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    },
  );

  it("does not filter a list by a project of another workspace into view", async () => {
    expect((await call("/tasks?projectId=p_x")).body.data).toEqual([]);
    expect((await call("/meetings?projectId=p_x")).body.data).toEqual([]);
  });

  it("does not change a task of another workspace", async () => {
    const res = await send("PATCH", "/tasks/t_x", { status: "COMPLETED" });
    expect(res.status).toBe(404);
    expect(tables.task.find((t) => t.id === "t_x").status).toBe("BACKLOG");
    expect(mocks.emitTaskUpdated).not.toHaveBeenCalled();
  });

  it("does not create a task in a project of another workspace", async () => {
    const res = await send("POST", "/tasks", { projectId: "p_x", title: "Mine now" });
    expect(res.status).toBe(404);
    expect(db.task.create).not.toHaveBeenCalled();
  });
});

describe("restricted projects", () => {
  it("shows a token what its user sees", async () => {
    const ids = async (path: string, token: string) =>
      (await call(path, token)).body.data.map((r: any) => r.id).sort();
    // Ana owns the workspace. Ben is not in the HR project.
    expect(await ids("/projects", BEN)).toEqual(["p_open"]);
    expect(await ids("/meetings", BEN)).toEqual(["m_1", "m_2"]);
    expect(await ids("/tasks", BEN)).toEqual(["t_1", "t_2", "t_3"]);
    expect(await ids("/tasks", ANA)).toContain("t_hr");
  });

  it.each(["/projects/p_hr", "/meetings/m_hr", "/tasks/t_hr"])(
    "answers 404 for %s to a member outside the project",
    async (path) => {
      expect((await call(path, BEN)).status).toBe(404);
      expect((await call(path, ANA)).status).toBe(200);
    },
  );

  it("leaves a restricted task out of a meeting the member does see", async () => {
    const tasks = async (token: string) =>
      (await call("/meetings/m_1", token)).body.tasks.map((t: any) => t.id);
    expect(await tasks(BEN)).toEqual(["t_1"]);
    expect(await tasks(ANA)).toEqual(["t_1", "t_hr"]);
  });

  it("does not let a member write to a restricted project", async () => {
    expect((await send("PATCH", "/tasks/t_hr", { title: "x" }, BEN)).status).toBe(404);
    expect((await send("POST", "/tasks", { projectId: "p_hr", title: "x" }, BEN)).status).toBe(404);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("does not carry one request's scope into the next", async () => {
    await call("/tasks", BEN);
    expect((await call("/tasks/t_hr", ANA)).status).toBe(200);
  });
});

describe("meetings", () => {
  it("lists meetings without transcript text or audio", async () => {
    const res = await call("/meetings");
    expect(res.body.data[0]).toEqual({
      id: "m_hr",
      title: "Meeting m_hr",
      status: "ready",
      summary: "Summary of m_hr",
      durationSeconds: 600,
      speakerCount: 2,
      language: "en",
      source: "RECORDING",
      project: { id: "p_hr", title: "HR" },
      url: "https://app.example.com/recordings/m_hr",
      recordedAt: day(3).toISOString(),
      createdAt: day(3).toISOString(),
      updatedAt: day(3).toISOString(),
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("FULL TEXT");
    expect(raw).not.toContain("gs://");
    expect(raw).not.toContain("workspaceId");
  });

  it("filters by project and by date", async () => {
    const ids = async (query: string) =>
      (await call(`/meetings?${query}`)).body.data.map((m: any) => m.id);
    expect(await ids("projectId=p_open")).toEqual(["m_1"]);
    expect(await ids(`since=${day(2).toISOString()}`)).toEqual(["m_hr", "m_2"]);
  });

  it("gives the detail with speakers, tasks and utterances, and no audio", async () => {
    const res = await call("/meetings/m_1");
    expect(res.status).toBe(200);
    expect(res.body.speakers).toEqual([
      { label: "Speaker 0", name: "Ana", role: "PM", speakingTimeSeconds: 300, utteranceCount: 1 },
      { label: "Speaker 1", name: "Carl", role: null, speakingTimeSeconds: 200, utteranceCount: 1 },
    ]);
    expect(res.body.transcript).toEqual({
      text: "FULL TEXT OF m_1",
      utterances: [
        { speaker: "Speaker 0", start: 0, end: 1.5, text: "Hello" },
        { speaker: "Speaker 1", start: 2, end: 2.5, text: "Hi" },
      ],
    });
    expect(res.body.tasks[0]).toEqual({
      id: "t_1",
      title: "Task t_1",
      status: "BACKLOG",
      priority: "MEDIUM",
      assigneeEmail: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("gs://");
  });

  it("writes each read of a meeting to the audit log, as channel api", async () => {
    await call("/meetings/m_1", BEN);
    expect(mocks.recordMeetingAccess).toHaveBeenCalledTimes(1);
    expect(mocks.recordMeetingAccess.mock.calls[0]).toEqual([
      expect.objectContaining({
        workspaceId: "ws_1",
        actor: { id: "u_ben" },
        transcriptId: "m_1",
        kind: "viewed",
        channel: "api",
      }),
    ]);
    await call("/meetings/m_x", BEN);
    await call("/meetings", BEN);
    expect(mocks.recordMeetingAccess).toHaveBeenCalledTimes(1);
  });

  it("maps the internal processing status", async () => {
    const status = async () => (await call("/meetings/m_1")).body.status;
    const meta = tables.transcript.find((m) => m.id === "m_1").metadata;
    meta.processingStatus = "PENDING";
    expect(await status()).toBe("processing");
    meta.processingStatus = "FAILED";
    expect(await status()).toBe("failed");
    meta.processingStatus = "DONE";
    expect(await status()).toBe("ready");
  });
});

describe("tasks", () => {
  it("filters by project, status, assignee and change date", async () => {
    const ids = async (query: string) =>
      (await call(`/tasks?${query}`)).body.data.map((t: any) => t.id);
    expect(await ids("status=IN_PROGRESS")).toEqual(["t_2"]);
    expect(await ids("assignee=BEN@example.com")).toEqual(["t_2"]);
    expect(await ids(`updatedSince=${day(5).toISOString()}`)).toEqual(["t_3"]);
    expect(await ids("projectId=p_hr")).toEqual(["t_hr"]);
  });

  it("gives one task with its project, assignee and link", async () => {
    const res = await call("/tasks/t_2");
    expect(res.body).toMatchObject({
      id: "t_2",
      status: "IN_PROGRESS",
      assignee: { id: "u_ben", name: "Ben", email: "ben@example.com" },
      project: { id: "p_open", title: "Website" },
      url: "https://app.example.com/projects/p_open?task=t_2",
      subtasks: [],
      meetingIds: [],
    });
    expect(JSON.stringify(res.body)).not.toContain("workspaceId");
  });

  it("creates a task through the task service, which emits the webhook", async () => {
    const res = await send("POST", "/tasks", {
      projectId: "p_open",
      title: "  Call the client  ",
      priority: "HIGH",
      dueDate: "2026-11-01T00:00:00.000Z",
      assigneeEmail: "Ben@Example.com",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Call the client",
      status: "BACKLOG",
      priority: "HIGH",
      dueDate: "2026-11-01T00:00:00.000Z",
      assignee: { email: "ben@example.com" },
      project: { id: "p_open" },
    });
    expect(mocks.emitTaskCreated).toHaveBeenCalledWith("ws_1", res.body.id);
  });

  it("sets completedAt when a task is closed, like the app", async () => {
    const res = await send("PATCH", "/tasks/t_1", { status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.completedAt).toEqual(expect.any(String));
    expect(mocks.emitTaskUpdated).toHaveBeenCalledWith("ws_1", "t_1", ["status"]);
  });

  it("clears the assignee and the due date with null", async () => {
    const res = await send("PATCH", "/tasks/t_2", { assigneeEmail: null, dueDate: null });
    expect(res.body.assignee).toBeNull();
    expect(mocks.emitTaskUpdated).toHaveBeenCalledWith("ws_1", "t_2", ["assignee"]);
  });

  it.each([
    [{ title: "x" }, "projectId"],
    [{ projectId: "p_open" }, "title"],
    [{ projectId: "p_open", title: "" }, "title"],
    [{ projectId: "p_open", title: "x", status: "DONE" }, "status"],
    [{ projectId: "p_open", title: "x", dueDate: "tomorrow" }, "dueDate"],
    [{ projectId: "p_open", title: "x", workspaceId: "ws_2" }, "workspaceId"],
  ])("refuses the body %j", async (body, field) => {
    const res = await send("POST", "/tasks", body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
    expect(res.body.error.message).toContain(field);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("refuses an assignee who is not in the workspace", async () => {
    const res = await send("POST", "/tasks", {
      projectId: "p_open",
      title: "x",
      assigneeEmail: "boss@other.com",
    });
    expect(res.status).toBe(400);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("refuses an empty change", async () => {
    expect((await send("PATCH", "/tasks/t_1", {})).status).toBe(400);
  });
});

describe("pagination", () => {
  it("walks the tasks newest first, page by page, without repeats", async () => {
    const first = await call("/tasks?limit=2");
    expect(first.body.data.map((t: any) => t.id)).toEqual(["t_hr", "t_3"]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await call(`/tasks?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.data.map((t: any) => t.id)).toEqual(["t_2", "t_1"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("orders rows created at the same moment by id", async () => {
    for (const t of tables.task) t.createdAt = day(1);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: any = await call(`/tasks?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...res.body.data.map((t: any) => t.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(["t_hr", "t_3", "t_2", "t_1"]);
  });

  it("keeps going when the row of the cursor was deleted", async () => {
    const first = await call("/tasks?limit=2");
    tables.task = tables.task.filter((t) => t.id !== "t_3");
    const second = await call(`/tasks?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.data.map((t: any) => t.id)).toEqual(["t_2", "t_1"]);
  });

  it("pages projects and meetings the same way", async () => {
    const projects = await call("/projects?limit=1");
    expect(projects.body.data.map((p: any) => p.id)).toEqual(["p_hr"]);
    expect(projects.body.nextCursor).not.toBeNull();
    const meetings = await call("/meetings?limit=100");
    expect(meetings.body.nextCursor).toBeNull();
  });

  it("defaults to 25 and allows up to 100", async () => {
    await call("/tasks");
    expect(db.task.findMany.mock.calls[0][0].take).toBe(26);
    await call("/tasks?limit=100");
    expect(db.task.findMany.mock.calls[1][0].take).toBe(101);
  });

  it.each(["limit=0", "limit=101", "limit=abc", "limit=1.5", "cursor=garbage", "since=yesterday"])(
    "refuses %s",
    async (query) => {
      const path = query.startsWith("since") ? "/meetings" : "/tasks";
      const res = await call(`${path}?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_request");
    },
  );

  it("refuses an unknown status", async () => {
    expect((await call("/tasks?status=DONE")).status).toBe(400);
  });

  it("round-trips a cursor", () => {
    const row = { createdAt: day(3), id: "abc" };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });
});

describe("errors", () => {
  it("answers an unknown path in the same shape", async () => {
    const res = await call("/nothing-here");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: expect.any(String) } });
  });

  it("hides the detail of an unexpected failure", async () => {
    db.project.findMany.mockRejectedValueOnce(new Error("connection string postgres://secret"));
    const res = await call("/projects");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
    expect(JSON.stringify(res.body)).not.toContain("postgres");
  });
});

describe("the OpenAPI description", () => {
  const routerRoutes = () =>
    (publicApiRouter.stack as any[])
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map(
          (method) => `${method} ${layer.route.path.replace(/:(\w+)/g, "{$1}")}`,
        ),
      )
      .sort();

  it("lists every route of the router, and no other", () => {
    const described = Object.entries(publicApiOpenApi.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`))
      .sort();
    expect(routerRoutes()).toHaveLength(10);
    expect(described).toEqual(routerRoutes());
  });

  it("is plain JSON with every reference defined", () => {
    const text = JSON.stringify(publicApiOpenApi);
    expect(JSON.parse(text)).toEqual(publicApiOpenApi);
    const refs = Array.from(text.matchAll(/"#\/components\/schemas\/(\w+)"/g)).map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const name of refs) expect(publicApiOpenApi.components.schemas).toHaveProperty(name);
  });

  it("asks for the token everywhere but on the description itself", () => {
    expect(publicApiOpenApi.security).toEqual([{ bearerToken: [] }]);
    const open = Object.entries(publicApiOpenApi.paths)
      .filter(([, methods]) => Object.values(methods).some((m: any) => m.security?.length === 0))
      .map(([path]) => path);
    expect(open).toEqual(["/openapi.json"]);
  });
});
