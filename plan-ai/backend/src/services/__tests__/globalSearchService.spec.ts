import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transcript: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  docDocument: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
}));
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

import {
  MAX_UTTERANCE_LOOKUPS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MAX_WORDS,
  SNIPPET_LENGTH,
  SearchQueryError,
  clampSearchLimit,
  cutSnippet,
  findUtteranceMatch,
  hasAllWords,
  leadSnippet,
  parseSearchQuery,
  rankHits,
  searchWorkspace,
  wordsCondition,
  type SearchHit,
} from "../globalSearchService";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

const hit = (over: Partial<SearchHit>): SearchHit => ({
  type: "task",
  id: "x",
  title: "x",
  snippet: null,
  titleMatch: false,
  projectId: null,
  projectTitle: null,
  date: day(1).toISOString(),
  ...over,
});

beforeEach(() => {
  for (const model of Object.values(db)) model.findMany.mockReset().mockResolvedValue([]);
});

describe("parseSearchQuery", () => {
  it("splits into lowercase words without repeats", () => {
    expect(parseSearchQuery("  Budget  Q3 budget ")).toEqual(["budget", "q3"]);
  });

  it("refuses fewer than two characters", () => {
    expect(() => parseSearchQuery(" a ")).toThrow(SearchQueryError);
    expect(() => parseSearchQuery("")).toThrow(SearchQueryError);
  });

  it("cuts the query at 200 characters and at 8 words", () => {
    const long = "a".repeat(SEARCH_MAX_QUERY_LENGTH + 50);
    expect(parseSearchQuery(long)[0]).toHaveLength(SEARCH_MAX_QUERY_LENGTH);
    const many = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    expect(parseSearchQuery(many)).toHaveLength(SEARCH_MAX_WORDS);
  });
});

describe("clampSearchLimit", () => {
  it("defaults to 20 and stops at 50", () => {
    expect(clampSearchLimit()).toBe(SEARCH_DEFAULT_LIMIT);
    expect(clampSearchLimit(Number.NaN)).toBe(SEARCH_DEFAULT_LIMIT);
    expect(clampSearchLimit(500)).toBe(SEARCH_MAX_LIMIT);
    expect(clampSearchLimit(0)).toBe(1);
    expect(clampSearchLimit(7.9)).toBe(7);
  });
});

describe("wordsCondition", () => {
  it("asks for every word in at least one field", () => {
    expect(wordsCondition(["ana", "budget"], ["title", "summary"])).toEqual([
      {
        OR: [
          { title: { contains: "ana", mode: "insensitive" } },
          { summary: { contains: "ana", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { title: { contains: "budget", mode: "insensitive" } },
          { summary: { contains: "budget", mode: "insensitive" } },
        ],
      },
    ]);
  });
});

describe("hasAllWords", () => {
  it("ignores case and needs every word", () => {
    expect(hasAllWords("Budget review with Ana", ["ana", "budget"])).toBe(true);
    expect(hasAllWords("Budget review", ["ana", "budget"])).toBe(false);
    expect(hasAllWords(null, ["ana"])).toBe(false);
  });
});

describe("cutSnippet", () => {
  it("returns short text whole", () => {
    expect(cutSnippet("We agreed the  budget\nfor Q3.", ["budget"])).toBe(
      "We agreed the budget for Q3.",
    );
  });

  it("returns null when no word is in the text", () => {
    expect(cutSnippet("Nothing here", ["budget"])).toBeNull();
    expect(cutSnippet(null, ["budget"])).toBeNull();
  });

  it("cuts a long text around the first match", () => {
    const text = `${"before ".repeat(200)}the BUDGET is here ${"after ".repeat(200)}`;
    const snippet = cutSnippet(text, ["budget"]);
    expect(snippet).not.toBeNull();
    expect(snippet!.toLowerCase()).toContain("budget");
    expect(snippet!.startsWith("...")).toBe(true);
    expect(snippet!.endsWith("...")).toBe(true);
    expect(snippet!.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 6);
  });

  it("starts at the first of the words that appears", () => {
    const text = `${"x ".repeat(300)}alpha ${"y ".repeat(300)}beta ${"z ".repeat(300)}`;
    const snippet = cutSnippet(text, ["beta", "alpha"]);
    expect(snippet).toContain("alpha");
    expect(snippet).not.toContain("beta");
  });

  it("never returns megabytes", () => {
    const text = `${"word ".repeat(400_000)}needle ${"word ".repeat(400_000)}`;
    expect(cutSnippet(text, ["needle"])!.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 6);
  });
});

describe("leadSnippet", () => {
  it("is the start of the text", () => {
    expect(leadSnippet("Short")).toBe("Short");
    const lead = leadSnippet("word ".repeat(100));
    expect(lead!.endsWith("...")).toBe(true);
    expect(lead!.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 3);
    expect(leadSnippet("   ")).toBeNull();
  });
});

describe("findUtteranceMatch", () => {
  const utterances = [
    { speaker: "User 0", transcript: "Hello everyone", start: 0 },
    { speaker: "User 1", transcript: "The budget is late", start: 12.4 },
    { speaker: "User 0", transcript: "Ana owns the budget", start: 30 },
  ];

  it("prefers the sentence with every word", () => {
    expect(findUtteranceMatch(utterances, ["budget", "ana"])).toEqual({
      atSeconds: 30,
      text: "Ana owns the budget",
    });
  });

  it("falls back to the first sentence with any word", () => {
    expect(findUtteranceMatch(utterances, ["budget", "zebra"])?.atSeconds).toBe(12.4);
  });

  it("gives nothing without times or without a match", () => {
    expect(findUtteranceMatch(utterances, ["zebra"])).toBeNull();
    expect(findUtteranceMatch([{ transcript: "budget" }], ["budget"])).toBeNull();
    expect(findUtteranceMatch(null, ["budget"])).toBeNull();
    expect(findUtteranceMatch("budget", ["budget"])).toBeNull();
  });
});

describe("rankHits", () => {
  it("puts title matches first, then newest first, and cuts at the limit", () => {
    const ranked = rankHits(
      [
        hit({ id: "old-body", date: day(1).toISOString() }),
        hit({ id: "new-body", date: day(9).toISOString() }),
        hit({ id: "old-title", titleMatch: true, date: day(2).toISOString() }),
        hit({ id: "new-title", titleMatch: true, date: day(5).toISOString() }),
      ],
      3,
    );
    expect(ranked.map((h) => h.id)).toEqual(["new-title", "old-title", "new-body"]);
  });
});

describe("searchWorkspace", () => {
  it("puts the workspace id in every query", async () => {
    db.transcript.findMany.mockResolvedValue([
      {
        id: "t1",
        title: "Weekly",
        summary: null,
        recordedAt: null,
        createdAt: day(3),
        project: null,
      },
    ]);
    db.docDocument.findMany.mockResolvedValue([
      { id: "d1", title: "Budget", createdAt: day(2), project: null, content: "The budget" },
    ]);
    await searchWorkspace("w1", "budget");

    const calls = [
      ...db.transcript.findMany.mock.calls,
      ...db.docDocument.findMany.mock.calls,
      ...db.project.findMany.mock.calls,
    ];
    // Two first-round queries per model, plus the follow-ups for text.
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const [args] of calls) expect(args.where.workspaceId).toBe("w1");
    expect(db.task.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of db.task.findMany.mock.calls) {
      expect(args.where.project).toEqual({ workspaceId: "w1" });
    }
  });

  it("bounds every first-round query with take", async () => {
    await searchWorkspace("w1", "budget", 500);
    for (const model of Object.values(db)) {
      for (const [args] of model.findMany.mock.calls) expect(args.take).toBe(SEARCH_MAX_LIMIT);
    }
  });

  it("does not select heavy columns in the first round", async () => {
    await searchWorkspace("w1", "budget");
    for (const [args] of db.transcript.findMany.mock.calls) {
      expect(args.select.transcript).toBeUndefined();
      expect(args.select.utterances).toBeUndefined();
    }
    for (const [args] of db.docDocument.findMany.mock.calls) {
      expect(args.select.content).toBeUndefined();
    }
  });

  it("refuses a short query before touching the database", async () => {
    await expect(searchWorkspace("w1", "a")).rejects.toBeInstanceOf(SearchQueryError);
    expect(db.transcript.findMany).not.toHaveBeenCalled();
  });

  it("reads the transcript text only for the meetings that need it", async () => {
    const light = [
      {
        id: "in-summary",
        title: "Weekly",
        summary: "We talked about the budget.",
        recordedAt: day(8),
        createdAt: day(8),
        project: { id: "p1", title: "Acme" },
      },
      {
        id: "in-text",
        title: "Standup",
        summary: "Nothing special.",
        recordedAt: null,
        createdAt: day(7),
        project: null,
      },
    ];
    db.transcript.findMany.mockImplementation(async (args: { select: { transcript?: boolean } }) =>
      args.select.transcript
        ? [
            {
              id: "in-text",
              transcript: "User 0: hi\nUser 1: the budget moved",
              utterances: [
                { speaker: "User 0", transcript: "hi", start: 0 },
                { speaker: "User 1", transcript: "the budget moved", start: 95.7 },
              ],
            },
          ]
        : light,
    );

    const result = await searchWorkspace("w1", "Budget");

    const heavy = db.transcript.findMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.select.transcript);
    expect(heavy).toHaveLength(1);
    expect(heavy[0].where).toEqual({ workspaceId: "w1", id: { in: ["in-text"] } });

    expect(result.query).toBe("budget");
    expect(result.hits).toEqual([
      {
        type: "meeting",
        id: "in-summary",
        title: "Weekly",
        snippet: "We talked about the budget.",
        titleMatch: false,
        projectId: "p1",
        projectTitle: "Acme",
        date: day(8).toISOString(),
      },
      {
        type: "meeting",
        id: "in-text",
        title: "Standup",
        snippet: "the budget moved",
        titleMatch: false,
        projectId: null,
        projectTitle: null,
        date: day(7).toISOString(),
        atSeconds: 95,
      },
    ]);
  });

  it("reads utterances for a few meetings only", async () => {
    const light = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      title: "Standup",
      summary: null,
      recordedAt: null,
      createdAt: day(20 - i),
      project: null,
    }));
    db.transcript.findMany.mockImplementation(
      async (args: { select: { transcript?: boolean }; where: { id?: { in: string[] } } }) =>
        args.select.transcript
          ? (args.where.id?.in ?? []).map((id) => ({ id, transcript: "about the budget" }))
          : light,
    );
    const result = await searchWorkspace("w1", "budget");
    const heavy = db.transcript.findMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.select.transcript);
    const withUtterances = heavy.filter((args) => args.select.utterances);
    expect(withUtterances).toHaveLength(1);
    expect(withUtterances[0].where.id.in).toHaveLength(MAX_UTTERANCE_LOOKUPS);
    expect(result.hits.every((h) => h.snippet === "about the budget")).toBe(true);
  });

  it("ranks across kinds and returns one hit per row", async () => {
    db.task.findMany.mockResolvedValue([
      {
        id: "k1",
        title: "Send the budget",
        description: "To Ana",
        createdAt: day(1),
        project: { id: "p1", title: "Acme" },
      },
    ]);
    db.project.findMany.mockResolvedValue([
      { id: "p2", title: "Other", description: "Budget work", createdAt: day(9) },
    ]);
    const result = await searchWorkspace("w1", "budget");
    expect(result.hits.map((h) => `${h.type}:${h.id}`)).toEqual(["task:k1", "project:p2"]);
    expect(result.hits[0]).toMatchObject({ titleMatch: true, snippet: "To Ana", projectId: "p1" });
    expect(result.hits[1]).toMatchObject({ titleMatch: false, snippet: "Budget work" });
  });

  it("cuts the document snippet from its content, without the markup", async () => {
    db.docDocument.findMany.mockImplementation(async (args: { select: { content?: boolean } }) =>
      args.select.content
        ? [{ id: "d1", content: "## Plan\n\n<p>The **budget** is 10k</p>" }]
        : [{ id: "d1", title: "Plan", createdAt: day(2), project: null }],
    );
    const result = await searchWorkspace("w1", "budget");
    expect(result.hits[0].snippet).toBe("Plan The budget is 10k");
  });
});
