/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tracker: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  trackerEntry: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

import {
  addEntry,
  computeStats,
  createTracker,
  getTracker,
  parseToday,
  reviewProposals,
  updateEntry,
  updateTracker,
} from "../trackerService";

const owner = { userId: "ana", workspaceId: "personal-ws" };
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const entry = (date: string, value: number, createdAt = `${date}T10:00:00Z`) => ({
  date: day(date),
  value,
  createdAt: new Date(createdAt),
});
const tracker = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  workspaceId: "personal-ws",
  userId: "ana",
  name: "Steps",
  kind: "NUMBER",
  unit: "steps",
  aggregation: "SUM",
  goalValue: null,
  goalDirection: null,
  goalPeriod: null,
  instructions: null,
  position: 0,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("only the owner reaches a tracker", () => {
  it("filters every lookup on the user and the workspace", async () => {
    db.tracker.findFirst.mockResolvedValue(null);
    await expect(getTracker(owner, "t1")).rejects.toMatchObject({ status: 404 });
    expect(db.tracker.findFirst.mock.calls[0][0].where).toEqual({
      id: "t1",
      workspaceId: "personal-ws",
      userId: "ana",
    });
  });

  it("accepts proposals of this user only", async () => {
    db.trackerEntry.updateMany.mockResolvedValue({ count: 2 });
    await reviewProposals(owner, ["e1", "e2"], "CONFIRMED");
    expect(db.trackerEntry.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: "ana",
      workspaceId: "personal-ws",
      status: "PROPOSED",
    });
  });
});

describe("creating and editing trackers", () => {
  it("forces kcal and SUM on a calories tracker", async () => {
    db.tracker.count.mockResolvedValue(0);
    db.tracker.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const created: any = await createTracker(owner, {
      name: "Food",
      kind: "CALORIES",
      unit: "g",
      aggregation: "LAST",
    });
    expect(created.unit).toBe("kcal");
    expect(created.aggregation).toBe("SUM");
  });

  it("refuses a goal without a direction", async () => {
    db.tracker.count.mockResolvedValue(0);
    await expect(
      createTracker(owner, { name: "Steps", kind: "NUMBER", goalValue: 10000, goalPeriod: "DAY" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("does not let the kind change", async () => {
    db.tracker.findFirst.mockResolvedValue(tracker());
    await expect(updateTracker(owner, "t1", { kind: "CHECK" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("removes the whole goal when the value is null", async () => {
    db.tracker.findFirst.mockResolvedValue(
      tracker({ goalValue: 10000, goalDirection: "AT_LEAST", goalPeriod: "DAY" }),
    );
    db.tracker.update.mockResolvedValue(tracker());
    await updateTracker(owner, "t1", { goalValue: null });
    expect(db.tracker.update.mock.calls[0][0].data).toMatchObject({
      goalValue: null,
      goalDirection: null,
      goalPeriod: null,
    });
  });

  it("stops at 30 trackers", async () => {
    db.tracker.count.mockResolvedValue(30);
    await expect(createTracker(owner, { name: "One more", kind: "CHECK" })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("entries", () => {
  it("stores 1 for a check tracker whatever the app sends", async () => {
    db.tracker.findFirst.mockResolvedValue(tracker({ kind: "CHECK", unit: null }));
    db.trackerEntry.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const created: any = await addEntry(owner, "t1", {
      date: new Date().toISOString().slice(0, 10),
      value: 42,
    });
    expect(created.value).toBe(1);
    expect(created.status).toBe("CONFIRMED");
  });

  it("returns the first entry when the phone retries with the same id", async () => {
    db.tracker.findFirst.mockResolvedValue(tracker());
    db.trackerEntry.findUnique.mockResolvedValue({ id: "phone-entry-00000001", userId: "ana" });
    const again = await addEntry(owner, "t1", {
      id: "phone-entry-00000001",
      date: new Date().toISOString().slice(0, 10),
      value: 5000,
    });
    expect(again.id).toBe("phone-entry-00000001");
    expect(db.trackerEntry.create).not.toHaveBeenCalled();
  });

  it("drops the food breakdown when the user corrects the kcal", async () => {
    db.trackerEntry.findFirst.mockResolvedValue({
      id: "e1",
      value: 350,
      status: "PROPOSED",
      details: { items: [] },
      tracker: tracker({ kind: "CALORIES", unit: "kcal" }),
    });
    db.trackerEntry.update.mockResolvedValue({});
    await updateEntry(owner, "e1", { value: 420, status: "CONFIRMED" });
    const data = db.trackerEntry.update.mock.calls[0][0].data;
    expect(data.value).toBe(420);
    expect(data.status).toBe("CONFIRMED");
    expect(data.details).toBeDefined();
  });

  it("does not turn an accepted entry back into a proposal", async () => {
    db.trackerEntry.findFirst.mockResolvedValue({
      id: "e1",
      value: 1,
      status: "CONFIRMED",
      details: null,
      tracker: tracker(),
    });
    await expect(updateEntry(owner, "e1", { status: "PROPOSED" })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("today from the app", () => {
  it("accepts the day before or after the server's", () => {
    const now = new Date("2026-09-30T23:30:00Z");
    expect(parseToday("2026-10-01", now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(() => parseToday("2026-10-05", now)).toThrow();
    expect(() => parseToday("30/09/2026", now)).toThrow();
  });
});

describe("stats", () => {
  const today = day("2026-09-30"); // a Wednesday

  it("adds up steps and counts a daily streak that today has not broken yet", () => {
    const stats = computeStats(
      tracker({ goalValue: 10000, goalDirection: "AT_LEAST", goalPeriod: "DAY" }) as any,
      [
        entry("2026-09-27", 12000),
        entry("2026-09-28", 6000),
        entry("2026-09-28", 5000),
        entry("2026-09-29", 10500),
        entry("2026-09-30", 3000),
      ],
      day("2026-09-24"),
      today,
      today,
    );
    expect(stats.today).toBe(3000);
    expect(stats.goalMetToday).toBe(false);
    // 27, 28 (6000 + 5000) and 29 met; today not yet.
    expect(stats.streak).toBe(3);
    expect(stats.days.find((d) => d.date === "2026-09-28")?.value).toBe(11000);
    // Monday 28 to today.
    expect(stats.week).toBe(24500);
  });

  it("keeps the last weight of the day", () => {
    const stats = computeStats(
      tracker({ name: "Weight", unit: "kg", aggregation: "LAST" }) as any,
      [entry("2026-09-30", 81.2, "2026-09-30T07:00:00Z"), entry("2026-09-30", 80.9, "2026-09-30T21:00:00Z")],
      today,
      today,
      today,
    );
    expect(stats.today).toBe(80.9);
  });

  it("does not count an empty day as a success for a maximum", () => {
    const stats = computeStats(
      tracker({
        kind: "CALORIES",
        unit: "kcal",
        goalValue: 2000,
        goalDirection: "AT_MOST",
        goalPeriod: "DAY",
      }) as any,
      [entry("2026-09-30", 1800), entry("2026-09-28", 1900)],
      day("2026-09-27"),
      today,
      today,
    );
    expect(stats.goalMetToday).toBe(true);
    // The 29th has nothing logged, so the streak is just today.
    expect(stats.streak).toBe(1);
    expect(stats.days.find((d) => d.date === "2026-09-29")?.goalMet).toBeNull();
  });

  it("counts gym days per week and weekly streaks", () => {
    const gym = tracker({
      name: "Gym",
      kind: "CHECK",
      unit: null,
      goalValue: 3,
      goalDirection: "AT_LEAST",
      goalPeriod: "WEEK",
    }) as any;
    const stats = computeStats(
      gym,
      [
        // Week of 14 Sept: 3 days. Week of 21 Sept: 3 days (one twice).
        entry("2026-09-14", 1),
        entry("2026-09-16", 1),
        entry("2026-09-18", 1),
        entry("2026-09-21", 1),
        entry("2026-09-23", 1),
        entry("2026-09-23", 1),
        entry("2026-09-25", 1),
        // This week so far: 1 day.
        entry("2026-09-29", 1),
      ],
      day("2026-09-14"),
      today,
      today,
    );
    expect(stats.week).toBe(1);
    expect(stats.goalMetThisWeek).toBe(false);
    expect(stats.streakUnit).toBe("WEEK");
    expect(stats.streak).toBe(2);
  });
});
