import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("../../prisma/prismaClient", () => ({
  rawPrisma: {
    $executeRaw: db.executeRaw,
    $queryRaw: db.queryRaw,
    featureUsageDaily: { groupBy: db.groupBy },
  },
}));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { accessScopeMiddleware } from "../accessScope";
import {
  FEATURE_CATALOGUE,
  MAX_BUFFERED_KEYS,
  MCP_TOOL_NAMES,
  bufferedFeatureKeys,
  chatMessageFeature,
  clientFromRequest,
  countFeature,
  countMcpToolCalls,
  flushFeatureUsage,
  getFeatureUsageReport,
  meetingCreatedFeature,
  recordingClient,
  rememberRequester,
  resetFeatureUsageBuffer,
  trackClientFeature,
  trackFeature,
  trackIntegrationConnected,
  trackMeetingAccess,
  utcDay,
} from "../featureUsageService";

/** The rows of every INSERT sent so far: [day, feature, client, workspaceId, userId, count]. */
const writtenRows = (): Array<[string, string, string, string, string, number]> =>
  db.executeRaw.mock.calls.flatMap((call) => {
    // A tagged template call: (strings, ...values). The one value is the joined rows.
    const joined = call[1] as { values: unknown[] };
    const rows: Array<[string, string, string, string, string, number]> = [];
    // Seven values per row, the first one is the generated id.
    for (let i = 0; i < joined.values.length; i += 7) {
      const v = joined.values.slice(i + 1, i + 7);
      rows.push(v as [string, string, string, string, string, number]);
    }
    return rows;
  });

const inRequest = (work: () => void): void => {
  accessScopeMiddleware({} as never, {} as never, work);
};

beforeEach(() => {
  resetFeatureUsageBuffer();
  db.executeRaw.mockReset().mockResolvedValue(1);
  db.queryRaw.mockReset();
  db.groupBy.mockReset();
});

describe("the catalogue", () => {
  it("has no repeated names and every name fits the column", () => {
    const names = FEATURE_CATALOGUE.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9_.]+$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });

  it("lists every tool the MCP server registers", () => {
    const source = readFileSync(join(__dirname, "../../mcp/planAiMcpServer.ts"), "utf8");
    const registered = [...source.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(registered.length).toBeGreaterThan(0);
    expect([...MCP_TOOL_NAMES].sort()).toEqual([...registered].sort());
  });

  it("only uses names that are in the list at every call site", () => {
    const names = new Set(FEATURE_CATALOGUE.map((f) => f.name));
    const root = join(__dirname, "../..");
    const files = ["controller", "services", "routes", "mcp"].flatMap((dir) =>
      readdirSync(join(root, dir), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
        .map((entry) => join(root, dir, entry.name)),
    );
    const used: string[] = [];
    for (const file of files) {
      if (file.endsWith("featureUsageService.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(
        /(?:countFeature|trackFeatureFor|countRecorderFeature)\(\s*(?:req(?:uest)?,\s*)?"([a-z0-9_.]+)"/g,
      )) {
        used.push(m[1]);
      }
      for (const m of text.matchAll(/feature:\s*"([a-z0-9_]+\.[a-z0-9_.]+)"/g)) used.push(m[1]);
    }
    expect(used.length).toBeGreaterThan(30);
    expect(used.filter((name) => !names.has(name))).toEqual([]);
  });
});

describe("trackFeature", () => {
  it("drops a name that is not in the list", async () => {
    expect(trackFeature({ feature: "made.up", client: "web", userId: "u1" })).toBe(false);
    expect(trackFeature({ feature: "", client: "web" })).toBe(false);
    expect(bufferedFeatureKeys()).toBe(0);
    await flushFeatureUsage();
    expect(db.executeRaw).not.toHaveBeenCalled();
  });

  it("drops a client that is not in the list", () => {
    expect(trackFeature({ feature: "meeting.opened", client: "tv" as never })).toBe(false);
    expect(bufferedFeatureKeys()).toBe(0);
  });

  it("never throws, whatever it is given", () => {
    expect(() => trackFeature(undefined as never)).not.toThrow();
    expect(() => trackFeature({ feature: 7 as never, client: {} as never })).not.toThrow();
    expect(trackFeature(null as never)).toBe(false);
  });

  it("does not touch the database until the flush", () => {
    for (let i = 0; i < 50; i++) trackFeature({ feature: "meeting.opened", client: "web" });
    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("writes several increments of one key as one row with the sum", async () => {
    const who = { client: "web" as const, workspaceId: "w1", userId: "u1" };
    const at = new Date("2026-10-09T10:00:00Z");
    for (let i = 0; i < 5; i++) trackFeature({ feature: "meeting.opened", ...who }, at);
    trackFeature({ feature: "doc.generated", ...who }, at);
    trackFeature({ feature: "meeting.opened", ...who, userId: "u2" }, at);

    await flushFeatureUsage();

    expect(db.executeRaw).toHaveBeenCalledTimes(1);
    expect(writtenRows()).toEqual([
      ["2026-10-09", "doc.generated", "web", "w1", "u1", 1],
      ["2026-10-09", "meeting.opened", "web", "w1", "u1", 5],
      ["2026-10-09", "meeting.opened", "web", "w1", "u2", 1],
    ]);
    const sql = (db.executeRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain('"FeatureUsageDaily"."count" + EXCLUDED."count"');
  });

  it("stores empty strings when there is no user or workspace", async () => {
    trackFeature({ feature: "meeting.opened", client: "api" }, new Date("2026-10-09T10:00:00Z"));
    await flushFeatureUsage();
    expect(writtenRows()).toEqual([["2026-10-09", "meeting.opened", "api", "", "", 1]]);
  });

  it("uses the UTC day, so a use just before midnight UTC is not moved", async () => {
    const who = { client: "web" as const, workspaceId: "w1", userId: "u1" };
    // 23:59 UTC on the 9th is already the 10th in Dubai, and the 9th in UTC.
    trackFeature({ feature: "meeting.opened", ...who }, new Date("2026-10-09T23:59:59.999Z"));
    trackFeature({ feature: "meeting.opened", ...who }, new Date("2026-10-10T00:00:00.000Z"));
    // 01:30 on the 10th in Dubai (+04:00) is 21:30 UTC on the 9th.
    trackFeature({ feature: "meeting.opened", ...who }, new Date("2026-10-10T01:30:00+04:00"));
    await flushFeatureUsage();
    expect(writtenRows()).toEqual([
      ["2026-10-09", "meeting.opened", "web", "w1", "u1", 2],
      ["2026-10-10", "meeting.opened", "web", "w1", "u1", 1],
    ]);
    expect(utcDay(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });

  it("keeps the buffer bounded", () => {
    for (let i = 0; i < MAX_BUFFERED_KEYS + 50; i++) {
      trackFeature({ feature: "meeting.opened", client: "web", userId: `u${i}` });
    }
    expect(bufferedFeatureKeys()).toBe(MAX_BUFFERED_KEYS);
    // A key already in the buffer still counts when the buffer is full.
    expect(trackFeature({ feature: "meeting.opened", client: "web", userId: "u0" })).toBe(true);
    expect(trackFeature({ feature: "meeting.opened", client: "web", userId: "new" })).toBe(false);
  });
});

describe("flushFeatureUsage", () => {
  it("never throws when the database fails, and writes the counts on the next run", async () => {
    const at = new Date("2026-10-09T10:00:00Z");
    trackFeature({ feature: "meeting.opened", client: "web", userId: "u1" }, at);
    trackFeature({ feature: "meeting.opened", client: "web", userId: "u1" }, at);
    db.executeRaw.mockRejectedValueOnce(new Error("database is down"));

    await expect(flushFeatureUsage()).resolves.toBeUndefined();
    expect(bufferedFeatureKeys()).toBe(1);

    // One more use while the database was down.
    trackFeature({ feature: "meeting.opened", client: "web", userId: "u1" }, at);
    await flushFeatureUsage();
    expect(writtenRows().at(-1)).toEqual(["2026-10-09", "meeting.opened", "web", "", "u1", 3]);
    expect(bufferedFeatureKeys()).toBe(0);
  });

  it("does nothing when there is nothing to write", async () => {
    await flushFeatureUsage();
    expect(db.executeRaw).not.toHaveBeenCalled();
  });

  it("writes each count once when two flushes run at the same time", async () => {
    let release: () => void = () => undefined;
    db.executeRaw.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(1))),
    );
    const at = new Date("2026-10-09T10:00:00Z");
    trackFeature({ feature: "meeting.opened", client: "web", userId: "u1" }, at);
    const first = flushFeatureUsage();
    // Arrives while the first write is still open.
    trackFeature({ feature: "meeting.opened", client: "web", userId: "u1" }, at);
    const second = flushFeatureUsage();
    release();
    await Promise.all([first, second]);

    const counts = writtenRows().map((row) => row[5]);
    expect(counts).toEqual([1, 1]);
  });

  it("splits a large buffer into several inserts", async () => {
    for (let i = 0; i < 1200; i++) {
      trackFeature({ feature: "meeting.opened", client: "web", userId: `u${i}` });
    }
    await flushFeatureUsage();
    expect(db.executeRaw).toHaveBeenCalledTimes(3);
    expect(writtenRows()).toHaveLength(1200);
  });
});

describe("trackClientFeature", () => {
  it("accepts a name the web reports", () => {
    expect(trackClientFeature({ feature: "nav.projects", client: "web", userId: "u1" })).toBe(true);
  });

  it("drops a name the server counts itself, so an app cannot inflate it", () => {
    expect(trackClientFeature({ feature: "meeting.recorded", client: "web" })).toBe(false);
  });

  it("drops unknown names, unknown clients and the clients an app cannot be", () => {
    expect(trackClientFeature({ feature: "nav.secret_page", client: "web" })).toBe(false);
    expect(trackClientFeature({ feature: "nav.projects", client: "browser" })).toBe(false);
    expect(trackClientFeature({ feature: "nav.projects", client: "mcp" })).toBe(false);
    expect(trackClientFeature({ feature: "nav.projects", client: "api" })).toBe(false);
    expect(trackClientFeature({ feature: { $ne: "" }, client: ["web"] })).toBe(false);
    expect(bufferedFeatureKeys()).toBe(0);
  });
});

describe("who made the request", () => {
  it("counts for the user and workspace of the current request", async () => {
    inRequest(() => {
      rememberRequester({ headers: { "x-current-path": "/projects" } }, "u1", "w1");
      countFeature("doc.generated");
    });
    await flushFeatureUsage();
    expect(writtenRows()[0].slice(1)).toEqual(["doc.generated", "web", "w1", "u1", 1]);
  });

  it("does not leak the caller of one request into another", async () => {
    inRequest(() => rememberRequester({ headers: {} }, "u1", "w1"));
    inRequest(() => countFeature("doc.generated"));
    await flushFeatureUsage();
    expect(writtenRows()[0].slice(1)).toEqual(["doc.generated", "api", "", "", 1]);
  });

  it("tells the apps apart without keeping the headers", () => {
    expect(clientFromRequest({ headers: { origin: "app://recorder" } })).toBe("recorder");
    expect(clientFromRequest({ headers: { "user-agent": "Mozilla Electron/31.0.0" } })).toBe(
      "recorder",
    );
    expect(clientFromRequest({ headers: { "x-current-path": "/x", origin: "https://a.b" } })).toBe(
      "web",
    );
    expect(clientFromRequest({ headers: { "user-agent": "okhttp/4.12.0" } })).toBe("mobile");
    expect(clientFromRequest({ headers: { "user-agent": "PlanAI/3 CFNetwork/1490 Darwin" } })).toBe(
      "mobile",
    );
    expect(clientFromRequest({ headers: { origin: "https://plan-ai.example.com" } })).toBe("web");
    expect(clientFromRequest({ headers: { "user-agent": "curl/8" } })).toBe("api");
    expect(clientFromRequest(undefined)).toBe("api");
    expect(recordingClient({ headers: { origin: "http://10.0.0.2:8080" } })).toBe("mobile");
    expect(recordingClient({ headers: { origin: "app://recorder" } })).toBe("recorder");
  });
});

describe("helpers for the call sites", () => {
  it("maps the source of a new meeting to a feature", () => {
    expect(meetingCreatedFeature("RECORDING")).toBe("meeting.recorded");
    expect(meetingCreatedFeature("UPLOAD")).toBe("meeting.imported");
    expect(meetingCreatedFeature("IMPORTED")).toBe("meeting.imported");
    expect(meetingCreatedFeature("MANUAL")).toBe("meeting.created_manual");
    expect(meetingCreatedFeature(undefined)).toBe("meeting.created_manual");
    expect(chatMessageFeature("t1")).toBe("chat.meeting_message");
    expect(chatMessageFeature(null)).toBe("chat.project_message");
  });

  it("counts a read of a meeting by kind and channel", async () => {
    const base = { workspaceId: "w1", userId: "u1" };
    expect(trackMeetingAccess({ ...base, kind: "viewed", channel: "mcp" })).toBe(true);
    expect(
      trackMeetingAccess({
        ...base,
        kind: "notes_sent",
        channel: "app",
        request: { headers: { origin: "app://recorder" } },
      }),
    ).toBe(true);
    expect(trackMeetingAccess({ ...base, kind: "something_new", channel: "app" })).toBe(false);
    await flushFeatureUsage();
    expect(writtenRows().map((row) => row.slice(1, 3))).toEqual([
      ["meeting.notes_emailed", "recorder"],
      ["meeting.opened", "mcp"],
    ]);
  });

  it("counts a connection per provider and ignores an unknown one", async () => {
    expect(trackIntegrationConnected("JIRA", "w1")).toBe(true);
    expect(trackIntegrationConnected("GOOGLE_CALENDAR", undefined, "u1")).toBe(true);
    expect(trackIntegrationConnected("FAX", "w1")).toBe(false);
    await flushFeatureUsage();
    expect(writtenRows().map((row) => row.slice(1, 5))).toEqual([
      ["calendar.connected.google", "web", "", "u1"],
      ["integration.connected.jira", "web", "w1", ""],
    ]);
  });

  it("counts each MCP tool call by name and never reads the arguments", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const server = {
      registerTool(name: string, _config: unknown, handler: (...args: unknown[]) => unknown) {
        handlers.set(name, handler);
        return "registered";
      },
    };
    countMcpToolCalls(server, "u1", "w1");
    const result = server.registerTool("get_tasks", {}, (args) => ({ echoed: args }));
    expect(result).toBe("registered");
    server.registerTool("not_in_the_list", {}, () => "ok");

    const secret = { query: "salary of Ana" };
    expect(handlers.get("get_tasks")?.(secret)).toEqual({ echoed: secret });
    handlers.get("get_tasks")?.(secret);
    expect(handlers.get("not_in_the_list")?.()).toBe("ok");

    await flushFeatureUsage();
    expect(writtenRows().map((row) => row.slice(1))).toEqual([
      ["mcp.get_tasks", "mcp", "w1", "u1", 2],
    ]);
    expect(JSON.stringify(db.executeRaw.mock.calls)).not.toContain("salary");
  });
});

describe("getFeatureUsageReport", () => {
  const now = new Date("2026-10-09T15:00:00Z");

  const withRows = () => {
    db.queryRaw
      // Totals per feature. Postgres returns bigint for SUM and COUNT.
      .mockResolvedValueOnce([
        { feature: "meeting.opened", total: 12n, users: 3n, workspaces: 2n },
        { feature: "nav.projects", total: 4n, users: 1n, workspaces: 1n },
        { feature: "removed.feature", total: 99n, users: 9n, workspaces: 9n },
      ])
      .mockResolvedValueOnce([{ users: 4n, workspaces: 2n }]);
    db.groupBy
      .mockResolvedValueOnce([
        { feature: "meeting.opened", client: "web", _sum: { count: 7 } },
        { feature: "meeting.opened", client: "mobile", _sum: { count: 5 } },
        { feature: "nav.projects", client: "web", _sum: { count: 4 } },
        { feature: "meeting.opened", client: "fridge", _sum: { count: 1 } },
      ])
      .mockResolvedValueOnce([
        { feature: "meeting.opened", day: new Date("2026-10-09T00:00:00Z"), _sum: { count: 2 } },
        { feature: "meeting.opened", day: new Date("2026-10-03T00:00:00Z"), _sum: { count: 10 } },
        { feature: "nav.projects", day: new Date("2026-10-08T00:00:00Z"), _sum: { count: 4 } },
      ])
      .mockResolvedValueOnce([
        { feature: "meeting.opened", _max: { day: new Date("2026-10-09T00:00:00Z") } },
        { feature: "nav.projects", _max: { day: new Date("2026-10-08T00:00:00Z") } },
        // Used months ago, nothing in the period.
        { feature: "doc.generated", _max: { day: new Date("2026-06-01T00:00:00Z") } },
      ]);
  };

  it("lists every feature of the catalogue, the unused ones with zeros", async () => {
    withRows();
    const report = await getFeatureUsageReport(7, now);

    expect(report.features.map((f) => f.feature)).toEqual(FEATURE_CATALOGUE.map((f) => f.name));
    const unused = report.features.find((f) => f.feature === "slides.generated");
    expect(unused).toMatchObject({
      total: 0,
      users: 0,
      workspaces: 0,
      lastUsedDay: null,
      byClient: { web: 0, recorder: 0, mobile: 0, api: 0, mcp: 0 },
      series: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(unused?.description).toBeTruthy();
  });

  it("returns totals, distinct counts, clients, last day and the series per day", async () => {
    withRows();
    const report = await getFeatureUsageReport(7, now);

    expect(report.days).toBe(7);
    expect(report.dayLabels).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
    const opened = report.features.find((f) => f.feature === "meeting.opened");
    expect(opened).toMatchObject({
      total: 12,
      users: 3,
      workspaces: 2,
      byClient: { web: 7, recorder: 0, mobile: 5, api: 0, mcp: 0 },
      lastUsedDay: "2026-10-09",
      series: [10, 0, 0, 0, 0, 0, 2],
      source: "server",
    });
    expect(report.features.find((f) => f.feature === "nav.projects")).toMatchObject({
      total: 4,
      users: 1,
      source: "client",
      series: [0, 0, 0, 0, 0, 4, 0],
    });
    // Not used in the period, but the last day it was ever used is kept.
    expect(report.features.find((f) => f.feature === "doc.generated")).toMatchObject({
      total: 0,
      lastUsedDay: "2026-06-01",
    });
    // A name that left the catalogue is not reported and not summed.
    expect(report.features.some((f) => f.feature === "removed.feature")).toBe(false);
    expect(report.totalUses).toBe(16);
    expect(report.activeUsers).toBe(4);
    expect(report.activeWorkspaces).toBe(2);
    expect(typeof report.activeUsers).toBe("number");
  });

  it("asks the database for the period that starts days-1 UTC days ago", async () => {
    withRows();
    await getFeatureUsageReport(7, now);
    expect(db.queryRaw.mock.calls[0].slice(1)).toEqual(["2026-10-03"]);
    expect(db.groupBy.mock.calls[0][0].where).toEqual({
      day: { gte: new Date("2026-10-03T00:00:00.000Z") },
    });
    // The last day ever used has no period.
    expect(db.groupBy.mock.calls[2][0].where).toBeUndefined();
  });

  it("clamps the period and falls back to 30 days", async () => {
    for (const [input, expected] of [
      [undefined, 30],
      [0, 1],
      [-5, 1],
      [9999, 365],
      [Number.NaN, 30],
      [7.9, 7],
    ] as Array<[number | undefined, number]>) {
      db.queryRaw.mockResolvedValue([]);
      db.groupBy.mockResolvedValue([]);
      const report = await getFeatureUsageReport(input, now);
      expect(report.days).toBe(expected);
      expect(report.dayLabels).toHaveLength(expected);
      expect(report.dayLabels.at(-1)).toBe("2026-10-09");
    }
  });
});
