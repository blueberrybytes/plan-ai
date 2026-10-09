import {
  buildFeatureTable,
  clientsSummary,
  featureUsageCsv,
  type FeatureUsageReport,
  type FeatureUsageRow,
} from "./featureUsageTable";

const row = (
  feature: string,
  total: number,
  extra: Partial<FeatureUsageRow> = {},
): FeatureUsageRow => ({
  feature,
  description: `About ${feature}`,
  source: "server",
  total,
  users: total > 0 ? 1 : 0,
  workspaces: total > 0 ? 1 : 0,
  byClient: { web: total, recorder: 0, mobile: 0, api: 0, mcp: 0 },
  lastUsedDay: total > 0 ? "2026-10-09" : null,
  series: [total],
  ...extra,
});

const rows = [
  row("doc.generated", 3),
  row("meeting.opened", 40),
  row("slides.generated", 0),
  row("diagram.generated", 0, { lastUsedDay: "2026-07-01" }),
  row("chat.project_message", 40, { users: 9 }),
  row("theme.created", 0, { lastUsedDay: "2026-09-01" }),
];

describe("buildFeatureTable", () => {
  it("sorts the used features by uses, then by users", () => {
    expect(buildFeatureTable(rows).used.map((r) => r.feature)).toEqual([
      "chat.project_message",
      "meeting.opened",
      "doc.generated",
    ]);
  });

  it("lists the unused features apart, the ones never used last", () => {
    expect(buildFeatureTable(rows).unused.map((r) => r.feature)).toEqual([
      "theme.created",
      "diagram.generated",
      "slides.generated",
    ]);
  });

  it("filters by name or description, ignoring case", () => {
    const byName = buildFeatureTable(rows, { query: "  GENERATED " });
    expect(byName.used.map((r) => r.feature)).toEqual(["doc.generated"]);
    expect(byName.unused.map((r) => r.feature)).toEqual(["diagram.generated", "slides.generated"]);
    const byDescription = buildFeatureTable(rows, { query: "about meeting" });
    expect(byDescription.used.map((r) => r.feature)).toEqual(["meeting.opened"]);
    expect(buildFeatureTable(rows, { query: "nothing like this" })).toEqual({
      used: [],
      unused: [],
    });
  });

  it("keeps only the unused features when asked", () => {
    const table = buildFeatureTable(rows, { onlyUnused: true });
    expect(table.used).toEqual([]);
    expect(table.unused).toHaveLength(3);
  });

  it("does not change the list it is given", () => {
    const before = rows.map((r) => r.feature);
    buildFeatureTable(rows);
    expect(rows.map((r) => r.feature)).toEqual(before);
  });
});

describe("clientsSummary", () => {
  it("lists the clients with uses, most uses first", () => {
    const mixed = row("meeting.opened", 12, {
      byClient: { web: 2, recorder: 0, mobile: 9, api: 0, mcp: 1 },
    });
    expect(clientsSummary(mixed)).toBe("mobile 9, web 2, mcp 1");
    expect(clientsSummary(row("slides.generated", 0))).toBe("");
  });
});

describe("featureUsageCsv", () => {
  it("writes one line per feature and quotes what needs it", () => {
    const report: FeatureUsageReport = {
      days: 7,
      dayLabels: ["2026-10-09"],
      totalUses: 5,
      activeUsers: 1,
      activeWorkspaces: 1,
      features: [
        row("slides.generated", 0),
        row("doc.generated", 5, { description: 'A "quoted", long text' }),
      ],
    };
    expect(featureUsageCsv(report).split("\n")).toEqual([
      "feature,description,counted_by,uses,users,workspaces,web,recorder,mobile,api,mcp,last_used_day",
      'doc.generated,"A ""quoted"", long text",server,5,1,1,5,0,0,0,0,2026-10-09',
      "slides.generated,About slides.generated,server,0,0,0,0,0,0,0,0,",
    ]);
  });
});
