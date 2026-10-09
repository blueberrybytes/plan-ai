/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Outbound webhooks with Prisma, the queue and the network stubbed. The
 * tables are small in-memory stand-ins; signing, the URL rule, the
 * restricted-project rule and the delivery bookkeeping are the real code.
 */

const mocks = vi.hoisted(() => {
  const state = {
    endpoints: [] as any[],
    deliveries: [] as any[],
    audits: [] as any[],
    restrictedContextIds: [] as string[],
    restrictedProjectIds: [] as string[],
    task: null as any,
    meeting: null as any,
    doc: null as any,
    sourceMeetings: [] as any[],
  };
  const enqueue = vi.fn<(id: string, manual: boolean) => Promise<void>>(async () => undefined);
  const applyData = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as object)) {
        row[key] = (row[key] ?? 0) + (value as { increment: number }).increment;
      } else {
        row[key] = value;
      }
    }
    return row;
  };
  const pick = (row: any, select?: Record<string, unknown>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row;
  const db = {
    webhookEndpoint: {
      findMany: vi.fn(async ({ where, select }: any) =>
        state.endpoints
          .filter(
            (e) =>
              e.workspaceId === where.workspaceId &&
              (where.enabled === undefined || e.enabled === where.enabled),
          )
          .map((e) => pick(e, select)),
      ),
      findFirst: vi.fn(async ({ where, select }: any) => {
        const row = state.endpoints.find(
          (e) => e.id === where.id && e.workspaceId === where.workspaceId,
        );
        return row ? pick(row, select) : null;
      }),
      count: vi.fn(
        async ({ where }: any) =>
          state.endpoints.filter((e) => e.workspaceId === where.workspaceId).length,
      ),
      create: vi.fn(async ({ data, select }: any) => {
        const row = {
          id: `we_${state.endpoints.length + 1}`,
          enabled: true,
          failureCount: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.endpoints.push(row);
        return pick(row, select);
      }),
      update: vi.fn(async ({ where, data, select }: any) =>
        pick(
          applyData(
            state.endpoints.find((e) => e.id === where.id),
            data,
          ),
          select,
        ),
      ),
      delete: vi.fn(async ({ where }: any) => {
        state.endpoints = state.endpoints.filter((e) => e.id !== where.id);
      }),
    },
    webhookDelivery: {
      create: vi.fn(async ({ data }: any) => {
        const row = {
          status: "PENDING",
          attempts: 0,
          responseStatus: null,
          error: null,
          createdAt: new Date(),
          deliveredAt: null,
          ...data,
        };
        state.deliveries.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = state.deliveries.find((d) => d.id === where.id);
        if (!row) return null;
        return { ...row, endpoint: state.endpoints.find((e) => e.id === row.endpointId) };
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const row = state.deliveries.find((d) => d.id === where.id);
        const endpoint = row && state.endpoints.find((e) => e.id === row.endpointId);
        return row && endpoint?.workspaceId === where.endpoint.workspaceId ? row : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        state.deliveries.filter((d) => d.endpointId === where.endpointId),
      ),
      update: vi.fn(async ({ where, data }: any) =>
        applyData(
          state.deliveries.find((d) => d.id === where.id),
          data,
        ),
      ),
    },
    context: {
      count: vi.fn(
        async ({ where }: any) =>
          where.id.in.filter((id: string) => state.restrictedContextIds.includes(id)).length,
      ),
    },
    project: {
      findMany: vi.fn(async ({ where }: any) =>
        where.id.in
          .filter((id: string) => state.restrictedProjectIds.includes(id))
          .map((id: string) => ({ id })),
      ),
    },
    task: { findFirst: vi.fn(async () => state.task) },
    transcript: {
      findFirst: vi.fn(async () => state.meeting),
      findMany: vi.fn(async () => state.sourceMeetings),
    },
    docDocument: { findFirst: vi.fn(async () => state.doc) },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        state.audits.push(data);
      }),
    },
  };
  return { state, db, enqueue };
});

vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db, rawPrisma: mocks.db }));
vi.mock("../../queue/webhookDeliveryQueue", () => ({ enqueueWebhookDelivery: mocks.enqueue }));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  WEBHOOK_DISABLE_AFTER_FAILURES,
  WEBHOOK_EVENTS,
  buildSignedRequest,
  canManageWebhooks,
  createWebhookEndpoint,
  emitDocumentCreated,
  emitMeetingProcessed,
  emitTaskCreated,
  emitTaskDeleted,
  emitTaskUpdated,
  emitWebhookEvent,
  listWebhookDeliveries,
  listWebhookEndpoints,
  redeliverWebhook,
  rotateWebhookSecret,
  runDeliveryAttempt,
  sendWebhookTestEvent,
  signWebhookPayload,
  snapshotTaskForDelete,
  taskChanges,
  updateWebhookEndpoint,
  validateWebhookUrl,
  webhookMayCarry,
} from "../webhookService";
import {
  WEBHOOK_MAX_TRIES,
  WEBHOOK_RETRY_DELAYS_MS,
  webhookRetryDelay,
} from "../../queue/webhookRetrySchedule";
import { isEncryptedSecret } from "../../utils/secretCrypto";

const { state, db, enqueue } = mocks;
const OWNER = { userId: "u_owner", email: "owner@example.com", role: "OWNER" };
const MEMBER = { userId: "u_member", email: "member@example.com", role: "MEMBER" };
const fetchMock = vi.fn();

const endpoint = (over: Record<string, unknown> = {}) => {
  const row = {
    id: `we_${state.endpoints.length + 1}`,
    workspaceId: "ws_1",
    url: "https://hooks.example.com/plan",
    secret: "whsec_plain",
    events: [] as string[],
    description: null,
    enabled: true,
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
  state.endpoints.push(row);
  return row;
};

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Send the offer",
  status: "IN_PROGRESS",
  priority: "HIGH",
  type: "TASK",
  dueDate: new Date("2026-11-01T00:00:00.000Z"),
  completedAt: null,
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-02T10:00:00.000Z"),
  assignee: { email: "ana@example.com" },
  project: { id: "p1", title: "Acme", visibility: "WORKSPACE" },
  // Fields a careless select could let through.
  description: "SECRET DESCRIPTION",
  ...over,
});

const meetingRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  title: "Kickoff",
  summary: "We agreed on the scope.",
  language: "en",
  source: "RECORDING",
  durationSeconds: 1800,
  speakerCount: 3,
  recordedAt: new Date("2026-10-01T09:00:00.000Z"),
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  contextIds: [] as string[],
  project: { id: "p1", title: "Acme", visibility: "WORKSPACE" },
  taskLinks: [{ task: { id: "t1", title: "Send the offer", status: "BACKLOG", priority: "HIGH" } }],
  transcript: "SECRET TRANSCRIPT TEXT",
  utterances: [{ speaker: "A", transcript: "SECRET TRANSCRIPT TEXT" }],
  rawMicUrl: "gs://bucket/audio.webm",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.endpoints = [];
  state.deliveries = [];
  state.audits = [];
  state.restrictedContextIds = [];
  state.restrictedProjectIds = [];
  state.task = taskRow();
  state.meeting = meetingRow();
  state.doc = null;
  state.sourceMeetings = [];
  enqueue.mockImplementation(async () => undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FRONTEND_URL", "https://app.example.com/");
  vi.stubEnv("SECRETS_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signing", () => {
  it("matches a vector computed with openssl", () => {
    // printf '%s' '1700000000.{"hello":"world"}' | openssl dgst -sha256 -hmac 'whsec_test'
    expect(signWebhookPayload("whsec_test", 1700000000, '{"hello":"world"}')).toBe(
      "sha256=f592bbf3951cfc94e560eecfb5d9dd4da6b0fff2e626235f8ab4b54860925d0b",
    );
  });

  it("signs the exact body it sends, with the four headers", () => {
    const payload = { id: "whd_1", event: "ping", data: { a: 1 } };
    const request = buildSignedRequest(
      { id: "whd_1", event: "ping", payload },
      "s3",
      1700000000999,
    );
    expect(request.body).toBe(JSON.stringify(payload));
    expect(request.headers["X-PlanAI-Event"]).toBe("ping");
    expect(request.headers["X-PlanAI-Delivery"]).toBe("whd_1");
    expect(request.headers["X-PlanAI-Timestamp"]).toBe("1700000000");
    expect(request.headers["X-PlanAI-Signature"]).toBe(
      signWebhookPayload("s3", 1700000000, request.body),
    );
  });
});

describe("retry schedule", () => {
  it("waits about 1 min, 5 min, 30 min, 2 h and 6 h", () => {
    expect([...WEBHOOK_RETRY_DELAYS_MS]).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
    ]);
    expect([1, 2, 3, 4, 5].map(webhookRetryDelay)).toEqual([...WEBHOOK_RETRY_DELAYS_MS]);
  });

  it("tries once and then once per wait", () => {
    expect(WEBHOOK_MAX_TRIES).toBe(6);
  });

  it("stays inside the list for an unexpected count", () => {
    expect(webhookRetryDelay(0)).toBe(60_000);
    expect(webhookRetryDelay(99)).toBe(21_600_000);
  });
});

describe("URL rule", () => {
  it("accepts https", () => {
    expect(validateWebhookUrl(" https://hooks.example.com/a?b=1 ")).toBe(
      "https://hooks.example.com/a?b=1",
    );
  });

  it("refuses http to a public host everywhere", () => {
    expect(() => validateWebhookUrl("http://hooks.example.com/a")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("accepts http://localhost outside production only", () => {
    expect(validateWebhookUrl("http://localhost:4000/hook")).toBe("http://localhost:4000/hook");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateWebhookUrl("http://localhost:4000/hook")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => validateWebhookUrl("https://localhost:4000/hook")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it.each([
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://service.internal/hook",
    "https://user:pass@hooks.example.com/hook",
    "ftp://hooks.example.com/hook",
    "not a url",
    "",
  ])("refuses %s in production", (url) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateWebhookUrl(url)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("refuses private addresses outside production too", () => {
    expect(() => validateWebhookUrl("https://10.0.0.5/hook")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});

describe("restricted projects", () => {
  it("sends what has no project or an open project", async () => {
    expect(await webhookMayCarry({ project: null })).toBe(true);
    expect(await webhookMayCarry({})).toBe(true);
    expect(await webhookMayCarry({ project: { visibility: "WORKSPACE" } })).toBe(true);
  });

  it("does not send what belongs to a restricted project", async () => {
    expect(await webhookMayCarry({ project: { visibility: "RESTRICTED" } })).toBe(false);
  });

  it("does not send what is tied to the knowledge base of a restricted project", async () => {
    state.restrictedContextIds = ["ctx_hr"];
    expect(await webhookMayCarry({ project: null, contextIds: ["ctx_open"] })).toBe(true);
    expect(await webhookMayCarry({ project: null, contextIds: ["ctx_open", "ctx_hr"] })).toBe(
      false,
    );
  });

  it("emits nothing for a task of a restricted project", async () => {
    endpoint();
    state.task = taskRow({ project: { id: "p9", title: "HR", visibility: "RESTRICTED" } });
    await emitTaskCreated("ws_1", "t1");
    await emitTaskUpdated("ws_1", "t1", ["status"]);
    await emitTaskDeleted("ws_1", await snapshotTaskForDelete("ws_1", "t1"));
    expect(state.deliveries).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("emits nothing for a meeting of a restricted project", async () => {
    endpoint();
    state.meeting = meetingRow({ project: { id: "p9", title: "HR", visibility: "RESTRICTED" } });
    await emitMeetingProcessed("ws_1", "m1");
    expect(state.deliveries).toHaveLength(0);
  });

  it("emits nothing for a document written from a restricted meeting", async () => {
    endpoint();
    state.doc = {
      id: "d1",
      title: "Notes",
      status: "DRAFT",
      contextIds: [],
      transcriptIds: ["m9"],
      createdAt: new Date(),
      project: null,
    };
    state.sourceMeetings = [{ contextIds: [], project: { visibility: "RESTRICTED" } }];
    await emitDocumentCreated("ws_1", "d1");
    expect(state.deliveries).toHaveLength(0);

    state.sourceMeetings = [{ contextIds: [], project: { visibility: "WORKSPACE" } }];
    await emitDocumentCreated("ws_1", "d1");
    expect(state.deliveries).toHaveLength(1);
  });
});

describe("payloads", () => {
  it("wraps the data with the delivery id, the event, the date and the workspace", async () => {
    endpoint();
    await emitTaskCreated("ws_1", "t1");
    const [delivery] = state.deliveries;
    expect(delivery.payload).toEqual({
      id: delivery.id,
      event: "task.created",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      workspaceId: "ws_1",
      data: {
        id: "t1",
        title: "Send the offer",
        status: "IN_PROGRESS",
        priority: "HIGH",
        type: "TASK",
        dueDate: "2026-11-01T00:00:00.000Z",
        completedAt: null,
        assigneeEmail: "ana@example.com",
        project: { id: "p1", title: "Acme", url: "https://app.example.com/projects/p1" },
        url: "https://app.example.com/projects/p1?task=t1",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-02T10:00:00.000Z",
      },
    });
    expect(enqueue).toHaveBeenCalledWith(delivery.id, false);
  });

  it("says what changed in task.updated and sends nothing when nothing did", async () => {
    endpoint();
    await emitTaskUpdated("ws_1", "t1", []);
    expect(state.deliveries).toHaveLength(0);
    await emitTaskUpdated("ws_1", "t1", ["status", "assignee"]);
    expect(state.deliveries[0].payload.data.changed).toEqual(["status", "assignee"]);
  });

  it("compares the four fields a task.updated is about", () => {
    const before = { status: "BACKLOG", assigneeId: null, title: "A", dueDate: null };
    expect(taskChanges(before, { ...before })).toEqual([]);
    expect(
      taskChanges(before, {
        status: "COMPLETED",
        assigneeId: "u2",
        title: "B",
        dueDate: new Date("2026-11-01"),
      }),
    ).toEqual(["status", "assignee", "title", "dueDate"]);
    const due = { ...before, dueDate: new Date("2026-11-01") };
    expect(taskChanges(due, { ...before, dueDate: new Date("2026-11-01") })).toEqual([]);
  });

  it("sends a meeting with its summary and duration, without transcript text or audio", async () => {
    endpoint();
    await emitMeetingProcessed("ws_1", "m1");
    const { data } = state.deliveries[0].payload;
    expect(data).toEqual({
      id: "m1",
      title: "Kickoff",
      summary: "We agreed on the scope.",
      durationSeconds: 1800,
      speakerCount: 3,
      language: "en",
      source: "RECORDING",
      recordedAt: "2026-10-01T09:00:00.000Z",
      createdAt: "2026-10-01T10:00:00.000Z",
      project: { id: "p1", title: "Acme", url: "https://app.example.com/projects/p1" },
      tasks: [{ id: "t1", title: "Send the offer", status: "BACKLOG", priority: "HIGH" }],
      url: "https://app.example.com/recordings/m1",
    });
    const sent = JSON.stringify(state.deliveries[0].payload);
    expect(sent).not.toContain("SECRET TRANSCRIPT TEXT");
    expect(sent).not.toContain("gs://");
    // The query itself does not ask for them either.
    const select = db.transcript.findFirst.mock.calls[0][0].select;
    expect(Object.keys(select)).not.toEqual(
      expect.arrayContaining(["transcript", "utterances", "rawMicUrl", "rawSysUrl"]),
    );
  });

  it("keeps the task description out", async () => {
    endpoint();
    await emitTaskCreated("ws_1", "t1");
    expect(JSON.stringify(state.deliveries[0].payload)).not.toContain("SECRET DESCRIPTION");
  });

  it("sends only id, title and project for a deleted task", async () => {
    endpoint();
    await emitTaskDeleted("ws_1", await snapshotTaskForDelete("ws_1", "t1"));
    expect(state.deliveries[0].event).toBe("task.deleted");
    expect(Object.keys(state.deliveries[0].payload.data)).toEqual(["id", "title", "project"]);
  });
});

describe("emitting", () => {
  it("reaches the enabled endpoints that want the event", async () => {
    endpoint({ id: "all" });
    endpoint({ id: "tasks", events: ["task.created"] });
    endpoint({ id: "meetings", events: ["meeting.processed"] });
    endpoint({ id: "off", enabled: false });
    endpoint({ id: "other", workspaceId: "ws_2" });
    await emitWebhookEvent("ws_1", "task.created", { id: "t1" });
    expect(state.deliveries.map((d) => d.endpointId).sort()).toEqual(["all", "tasks"]);
  });

  it("loads nothing when no endpoint wants the event", async () => {
    endpoint({ events: ["meeting.processed"] });
    await emitTaskCreated("ws_1", "t1");
    expect(db.task.findFirst).not.toHaveBeenCalled();
  });

  it("never throws when Redis is down, and marks the delivery so it can be sent again", async () => {
    endpoint();
    enqueue.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6379"));
    await expect(emitTaskCreated("ws_1", "t1")).resolves.toBeUndefined();
    await expect(emitWebhookEvent("ws_1", "task.created", { id: "t1" })).resolves.toBeUndefined();
    expect(state.deliveries).toHaveLength(2);
    expect(state.deliveries.every((d) => d.status === "FAILED" && /queue/.test(d.error))).toBe(
      true,
    );
  });

  it("never throws when the database is down", async () => {
    db.webhookEndpoint.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(emitTaskCreated("ws_1", "t1")).resolves.toBeUndefined();
    db.webhookEndpoint.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(snapshotTaskForDelete("ws_1", "t1")).resolves.toBeNull();
  });

  it("lists the six events", () => {
    expect([...WEBHOOK_EVENTS]).toEqual([
      "meeting.processed",
      "meeting.deleted",
      "task.created",
      "task.updated",
      "task.deleted",
      "document.created",
    ]);
  });
});

describe("delivery", () => {
  const queued = async () => {
    await emitWebhookEvent("ws_1", "task.created", { id: "t1" });
    return state.deliveries[state.deliveries.length - 1];
  };
  const respond = (status: number, body = "") =>
    fetchMock.mockImplementation(async () => new Response(body, { status }));

  it("posts the signed JSON and records a 2xx as success", async () => {
    const ep = endpoint({ failureCount: 7 });
    const delivery = await queued();
    respond(202);
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
      "success",
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/plan");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers["X-PlanAI-Signature"]).toBe(
      signWebhookPayload("whsec_plain", Number(init.headers["X-PlanAI-Timestamp"]), init.body),
    );
    expect(JSON.parse(init.body).id).toBe(delivery.id);
    expect(delivery).toMatchObject({ status: "SUCCESS", attempts: 1, responseStatus: 202 });
    expect(delivery.deliveredAt).toBeInstanceOf(Date);
    // A success starts the count again.
    expect(ep.failureCount).toBe(0);
    expect(ep.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("records every failed try and asks for a retry until the last one", async () => {
    const ep = endpoint();
    const delivery = await queued();
    respond(500, "boom ".repeat(400));
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
      "retry",
    );
    expect(delivery).toMatchObject({ status: "PENDING", attempts: 1, responseStatus: 500 });
    expect(delivery.error.startsWith("HTTP 500: boom")).toBe(true);
    expect(delivery.error.length).toBeLessThanOrEqual(500);
    expect(ep.failureCount).toBe(0);
    expect(ep.lastFailureAt).toBeInstanceOf(Date);

    respond(503);
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: true, manual: false })).toBe(
      "failed",
    );
    expect(delivery).toMatchObject({ status: "FAILED", attempts: 2, responseStatus: 503 });
    expect(ep.failureCount).toBe(1);
  });

  it("treats a redirect that leads nowhere and a network error as failures", async () => {
    endpoint();
    const delivery = await queued();
    respond(302);
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
      "retry",
    );
    expect(delivery.responseStatus).toBe(302);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
      "retry",
    );
    expect(delivery).toMatchObject({ responseStatus: null, error: "fetch failed" });
  });

  it("does not call a private address, also when a redirect points to one", async () => {
    vi.stubEnv("NODE_ENV", "production");
    endpoint({ url: "https://10.0.0.5/hook" });
    const first = await queued();
    await runDeliveryAttempt(first.id, { lastAttempt: true, manual: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.status).toBe("FAILED");

    state.endpoints[0].url = "https://hooks.example.com/plan";
    const second = await queued();
    fetchMock.mockResolvedValue(
      new Response("", { status: 302, headers: { location: "http://169.254.169.254/" } }),
    );
    await runDeliveryAttempt(second.id, { lastAttempt: true, manual: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.status).toBe("FAILED");
  });

  it("turns the endpoint off after 20 failed deliveries in a row and logs it", async () => {
    const ep = endpoint();
    respond(500);
    for (let i = 1; i <= WEBHOOK_DISABLE_AFTER_FAILURES; i++) {
      const delivery = await queued();
      await runDeliveryAttempt(delivery.id, { lastAttempt: true, manual: false });
      expect(ep.enabled).toBe(i < WEBHOOK_DISABLE_AFTER_FAILURES);
    }
    expect(ep.failureCount).toBe(20);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "webhook.disabled",
      workspaceId: "ws_1",
      targetId: ep.id,
      actorUserId: null,
    });
  });

  it("starts the count again on a success, so 19 failures and one success do not turn it off", async () => {
    const ep = endpoint();
    respond(500);
    for (let i = 0; i < 19; i++) {
      await runDeliveryAttempt((await queued()).id, { lastAttempt: true, manual: false });
    }
    expect(ep.failureCount).toBe(19);
    respond(200);
    await runDeliveryAttempt((await queued()).id, { lastAttempt: true, manual: false });
    expect(ep.failureCount).toBe(0);
    respond(500);
    await runDeliveryAttempt((await queued()).id, { lastAttempt: true, manual: false });
    expect(ep).toMatchObject({ enabled: true, failureCount: 1 });
  });

  it("does not send to an endpoint that is off, unless a person asked", async () => {
    const ep = endpoint();
    const delivery = await queued();
    ep.enabled = false;
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
      "failed",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(delivery.status).toBe("FAILED");

    respond(200);
    expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: true })).toBe(
      "success",
    );
  });

  it("gives a manual delivery one try and does not count its failure", async () => {
    const ep = endpoint();
    const { deliveryId } = await sendWebhookTestEvent("ws_1", OWNER, ep.id);
    expect(enqueue).toHaveBeenCalledWith(deliveryId, true);
    const delivery = state.deliveries[0];
    expect(delivery.event).toBe("ping");
    respond(500);
    expect(await runDeliveryAttempt(deliveryId, { lastAttempt: false, manual: true })).toBe(
      "failed",
    );
    expect(delivery.status).toBe("FAILED");
    expect(ep.failureCount).toBe(0);
  });

  it("is a no-op for a delivery whose endpoint was deleted", async () => {
    expect(await runDeliveryAttempt("gone", { lastAttempt: false, manual: false })).toBe("failed");
  });
});

describe("managing endpoints", () => {
  it("is for owners and admins", async () => {
    expect(canManageWebhooks("OWNER")).toBe(true);
    expect(canManageWebhooks("ADMIN")).toBe(true);
    expect(canManageWebhooks("MEMBER")).toBe(false);
    expect(canManageWebhooks(null)).toBe(false);
    const ep = endpoint();
    const refused = expect.objectContaining({ status: 403 });
    await expect(listWebhookEndpoints("ws_1", MEMBER)).rejects.toEqual(refused);
    await expect(
      createWebhookEndpoint("ws_1", MEMBER, { url: "https://a.example.com" }),
    ).rejects.toEqual(refused);
    await expect(updateWebhookEndpoint("ws_1", MEMBER, ep.id, {})).rejects.toEqual(refused);
    await expect(rotateWebhookSecret("ws_1", MEMBER, ep.id)).rejects.toEqual(refused);
    await expect(listWebhookDeliveries("ws_1", MEMBER, ep.id)).rejects.toEqual(refused);
    await expect(sendWebhookTestEvent("ws_1", MEMBER, ep.id)).rejects.toEqual(refused);
    await expect(redeliverWebhook("ws_1", MEMBER, "whd_x")).rejects.toEqual(refused);
  });

  it("shows the secret once, stores it encrypted and never lists it", async () => {
    const { endpoint: created, secret } = await createWebhookEndpoint("ws_1", OWNER, {
      url: "https://hooks.example.com/plan",
      events: ["task.created"],
      description: "  CRM  ",
    });
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(created).not.toHaveProperty("secret");
    expect(created.description).toBe("CRM");
    const stored = state.endpoints[0];
    expect(isEncryptedSecret(stored.secret)).toBe(true);
    expect(stored.secret).not.toContain(secret);
    expect(stored.createdById).toBe("u_owner");

    const listed = await listWebhookEndpoints("ws_1", OWNER);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("secret");
    expect(JSON.stringify(listed)).not.toContain("whsec_");
    expect(state.audits.map((a) => a.action)).toEqual(["webhook.created"]);
  });

  it("signs with the stored secret, and with the new one after a rotation", async () => {
    const { endpoint: created, secret } = await createWebhookEndpoint("ws_1", OWNER, {
      url: "https://hooks.example.com/plan",
    });
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const signedWith = async (expected: string) => {
      await emitWebhookEvent("ws_1", "task.created", { id: "t1" });
      const delivery = state.deliveries[state.deliveries.length - 1];
      await runDeliveryAttempt(delivery.id, { lastAttempt: true, manual: false });
      const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
      return (
        init.headers["X-PlanAI-Signature"] ===
        signWebhookPayload(expected, Number(init.headers["X-PlanAI-Timestamp"]), init.body)
      );
    };
    expect(await signedWith(secret)).toBe(true);

    const rotated = await rotateWebhookSecret("ws_1", OWNER, created.id);
    expect(rotated.secret).not.toBe(secret);
    expect(rotated.endpoint).not.toHaveProperty("secret");
    expect(await signedWith(rotated.secret)).toBe(true);
    expect(await signedWith(secret)).toBe(false);
    expect(state.audits.map((a) => a.action)).toContain("webhook.secret_rotated");
  });

  it("refuses unknown events and a bad URL", async () => {
    await expect(
      createWebhookEndpoint("ws_1", OWNER, { url: "https://a.example.com", events: ["nope"] }),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    await expect(
      createWebhookEndpoint("ws_1", OWNER, { url: "http://a.example.com" }),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    expect(state.endpoints).toHaveLength(0);
  });

  it("does not reach an endpoint of another workspace", async () => {
    const other = endpoint({ workspaceId: "ws_2" });
    const missing = expect.objectContaining({ status: 404 });
    await expect(
      updateWebhookEndpoint("ws_1", OWNER, other.id, { enabled: false }),
    ).rejects.toEqual(missing);
    await expect(rotateWebhookSecret("ws_1", OWNER, other.id)).rejects.toEqual(missing);
    await expect(listWebhookDeliveries("ws_1", OWNER, other.id)).rejects.toEqual(missing);
    await expect(sendWebhookTestEvent("ws_1", OWNER, other.id)).rejects.toEqual(missing);
    expect(other.enabled).toBe(true);
  });

  it("starts the failure count again when an endpoint is turned back on", async () => {
    const ep = endpoint({ enabled: false, failureCount: 20 });
    const updated = await updateWebhookEndpoint("ws_1", OWNER, ep.id, { enabled: true });
    expect(updated).toMatchObject({ enabled: true, failureCount: 0 });
  });

  it("redelivers with the same id and payload, once", async () => {
    const ep = endpoint();
    await emitWebhookEvent("ws_1", "task.created", { id: "t1" });
    const delivery = state.deliveries[0];
    await expect(redeliverWebhook("ws_1", OWNER, delivery.id)).rejects.toEqual(
      expect.objectContaining({ status: 409 }),
    );
    delivery.status = "FAILED";
    const payloadBefore = JSON.stringify(delivery.payload);
    enqueue.mockClear();
    expect(await redeliverWebhook("ws_1", OWNER, delivery.id)).toEqual({ deliveryId: delivery.id });
    expect(enqueue).toHaveBeenCalledWith(delivery.id, true);
    expect(delivery.status).toBe("PENDING");
    expect(JSON.stringify(delivery.payload)).toBe(payloadBefore);
    expect(state.deliveries).toHaveLength(1);
    expect(ep.id).toBe(delivery.endpointId);
  });

  it("hides and does not resend a payload whose project became restricted", async () => {
    const ep = endpoint();
    await emitTaskCreated("ws_1", "t1");
    const delivery = state.deliveries[0];
    delivery.status = "SUCCESS";
    expect((await listWebhookDeliveries("ws_1", OWNER, ep.id))[0].payload).not.toBeNull();

    state.restrictedProjectIds = ["p1"];
    expect((await listWebhookDeliveries("ws_1", OWNER, ep.id))[0].payload).toBeNull();
    await expect(redeliverWebhook("ws_1", OWNER, delivery.id)).rejects.toEqual(
      expect.objectContaining({ status: 409 }),
    );
  });
});

describe("a real HTTP call", () => {
  it("reaches a local listener through the guarded fetch, signed, and reads its answer", async () => {
    const http = await import("http");
    const seen: { headers: Record<string, unknown>; body: string }[] = [];
    let answer = 200;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        seen.push({ headers: req.headers, body });
        res.statusCode = answer;
        res.end(answer === 200 ? "ok" : "the receiver is broken");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      // The real fetch, on the production path. The listener's address is
      // allowed the way a private install allows an internal host.
      vi.unstubAllGlobals();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SSRF_ALLOWED_HOSTS", "127.0.0.1");
      const ep = endpoint({ url: `http://127.0.0.1:${port}/hook` });
      await emitWebhookEvent("ws_1", "task.created", { id: "t1", title: "Señal añadida" });
      const delivery = state.deliveries[0];

      expect(await runDeliveryAttempt(delivery.id, { lastAttempt: false, manual: false })).toBe(
        "success",
      );
      expect(seen).toHaveLength(1);
      const { headers, body } = seen[0];
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-planai-event"]).toBe("task.created");
      expect(headers["x-planai-delivery"]).toBe(delivery.id);
      expect(headers["x-planai-signature"]).toBe(
        signWebhookPayload("whsec_plain", Number(headers["x-planai-timestamp"]), body),
      );
      expect(JSON.parse(body)).toEqual(delivery.payload);
      expect(delivery).toMatchObject({ status: "SUCCESS", responseStatus: 200 });

      answer = 500;
      await emitWebhookEvent("ws_1", "task.created", { id: "t2" });
      const second = state.deliveries[1];
      expect(await runDeliveryAttempt(second.id, { lastAttempt: true, manual: false })).toBe(
        "failed",
      );
      expect(second).toMatchObject({
        status: "FAILED",
        responseStatus: 500,
        error: "HTTP 500: the receiver is broken",
      });
      expect(ep.failureCount).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
