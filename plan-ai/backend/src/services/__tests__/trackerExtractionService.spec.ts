/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db: any = {
    note: { findFirst: vi.fn(), updateMany: vi.fn() },
    tracker: { findMany: vi.fn() },
    trackerEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
  };
  db.$transaction = vi.fn((arg: any) => Promise.all(arg));
  return { db, generateText: vi.fn(), logUsage: vi.fn() };
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

import { extractFromNote, priceFoods } from "../trackerExtractionService";

const { db } = mocks;
const owner = { userId: "ana", workspaceId: "ws-p" };
const today = new Date().toISOString().slice(0, 10);
const food = { id: "t-food", name: "Food", kind: "CALORIES", unit: "kcal", instructions: null };
const gym = { id: "t-gym", name: "Gym", kind: "CHECK", unit: null, instructions: null };
const note = {
  id: "n1",
  title: null,
  body: "Breakfast: 2 boiled eggs. Went to the gym.",
  version: 4,
  trackersExtractedVersion: null,
  updatedAt: new Date("2026-09-30T08:00:00Z"),
};

const answer = (entries: unknown[]) => ({
  output: { entries },
  totalUsage: { inputTokens: 500, outputTokens: 80 },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((arg: any) => Promise.all(arg));
});

describe("pricing food", () => {
  it("multiplies the grams by the kcal per 100 g and keeps a range", () => {
    const details = priceFoods([
      { name: "2 huevos", grams: 100, gramsLow: 90, gramsHigh: 120, kcalPer100g: 155 },
      { name: "tostada", grams: 30, gramsLow: 25, gramsHigh: 40, kcalPer100g: 290 },
    ]);
    expect(details?.items[0]).toMatchObject({ kcal: 155, kcalLow: 140, kcalHigh: 186 });
    expect(details).toMatchObject({ kcalLow: 140 + 73, kcalHigh: 186 + 116 });
  });

  it("drops foods with no weight or an impossible kcal value", () => {
    expect(
      priceFoods([
        { name: "air", grams: 0, gramsLow: 0, gramsHigh: 0, kcalPer100g: 0 },
        { name: "typo", grams: 100, gramsLow: 100, gramsHigh: 100, kcalPer100g: 5000 },
      ]),
    ).toBeNull();
  });

  it("orders a low end given above the best guess", () => {
    const details = priceFoods([
      { name: "rice", grams: 150, gramsLow: 200, gramsHigh: 100, kcalPer100g: 130 },
    ]);
    expect(details?.items[0]).toMatchObject({ gramsLow: 150, gramsHigh: 150 });
  });
});

describe("reading a note", () => {
  it("proposes entries and nothing counts until accepted", async () => {
    db.note.findFirst.mockResolvedValue(note);
    db.tracker.findMany.mockResolvedValue([food, gym]);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.trackerEntry.findMany.mockResolvedValue([]);
    mocks.generateText.mockResolvedValue(
      answer([
        {
          trackerId: "t-food",
          value: null,
          label: "Breakfast",
          dayOffset: 0,
          foods: [
            { name: "2 eggs", grams: 100, gramsLow: 90, gramsHigh: 110, kcalPer100g: 155 },
          ],
        },
        { trackerId: "t-gym", value: null, label: "Gym", dayOffset: 0, foods: null },
        // Not one of the user's trackers: dropped.
        { trackerId: "someone-else", value: 5, label: "x", dayOffset: 0, foods: null },
      ]),
    );

    await extractFromNote(owner, "n1", today);

    const rows = db.trackerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.status === "PROPOSED" && r.noteId === "n1")).toBe(true);
    expect(rows[0].value).toBe(155);
    expect(rows[1]).toMatchObject({ trackerId: "t-gym", value: 1 });
    // The old proposals of the note are replaced.
    expect(db.trackerEntry.deleteMany.mock.calls[0][0].where).toMatchObject({
      noteId: "n1",
      status: "PROPOSED",
    });
  });

  it("asks for providers that keep no data", async () => {
    db.note.findFirst.mockResolvedValue(note);
    db.tracker.findMany.mockResolvedValue([gym]);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.trackerEntry.findMany.mockResolvedValue([]);
    mocks.generateText.mockResolvedValue(answer([]));

    await extractFromNote(owner, "n1", today);

    const provider = mocks.generateText.mock.calls[0][0].providerOptions.openrouter.provider;
    expect(provider).toMatchObject({ data_collection: "deny", zdr: true });
  });

  it("does not call the AI twice for the same version", async () => {
    db.note.findFirst.mockResolvedValue({ ...note, trackersExtractedVersion: 4 });
    db.tracker.findMany.mockResolvedValue([gym]);
    db.note.updateMany.mockResolvedValue({ count: 0 });
    db.trackerEntry.findMany.mockResolvedValue([{ id: "e1" }]);

    const result = await extractFromNote(owner, "n1", today);

    expect(result.skipped).toBe("unchanged");
    expect(result.entries).toEqual([{ id: "e1" }]);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("keeps the note's date of change when it marks it as read", async () => {
    db.note.findFirst.mockResolvedValue(note);
    db.tracker.findMany.mockResolvedValue([gym]);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.trackerEntry.findMany.mockResolvedValue([]);
    mocks.generateText.mockResolvedValue(answer([]));

    await extractFromNote(owner, "n1", today);

    expect(db.note.updateMany.mock.calls[0][0].data).toEqual({
      trackersExtractedVersion: 4,
      updatedAt: note.updatedAt,
    });
  });

  it("lets the next call try again when the AI fails", async () => {
    db.note.findFirst.mockResolvedValue(note);
    db.tracker.findMany.mockResolvedValue([gym]);
    db.note.updateMany.mockResolvedValue({ count: 1 });
    db.trackerEntry.findMany.mockResolvedValue([]);
    // The provider's error repeats the note: it must not travel on.
    mocks.generateText.mockRejectedValue(new Error(`provider down: ${note.body}`));

    const error = await extractFromNote(owner, "n1", today).catch((e: Error) => e);
    expect((error as Error).message).toContain("Tracker AI call failed");
    expect((error as Error).message).not.toContain("boiled eggs");
    expect(db.note.updateMany.mock.calls[1][0].data.trackersExtractedVersion).toBeNull();
  });

  it("does not read another user's note", async () => {
    db.note.findFirst.mockResolvedValue(null);
    await expect(extractFromNote(owner, "n1", today)).rejects.toMatchObject({ status: 404 });
    expect(db.note.findFirst.mock.calls[0][0].where).toMatchObject({ userId: "ana" });
  });

  it("does not call the AI without trackers", async () => {
    db.note.findFirst.mockResolvedValue(note);
    db.tracker.findMany.mockResolvedValue([]);
    const result = await extractFromNote(owner, "n1", today);
    expect(result.skipped).toBe("no_trackers");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
