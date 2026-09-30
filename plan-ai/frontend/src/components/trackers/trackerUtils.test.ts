import i18n from "../../i18n";
import type { TrackerEntry } from "../../store/apis/trackersApi";
import {
  goalProgress,
  hidesKcal,
  kcalEstimate,
  latestDay,
  localToday,
  parseAmount,
  readFoodDetails,
  relativeDay,
  roundKcal,
  shiftDateKey,
  streakLabel,
} from "./trackerUtils";

const foodEntry = (value: number, details: unknown): Pick<TrackerEntry, "value" | "details"> => ({
  value,
  details: details as TrackerEntry["details"],
});

describe("localToday", () => {
  it("uses the local calendar day, not UTC", () => {
    expect(localToday(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("shiftDateKey and relativeDay", () => {
  it("moves across months and years", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("names today and yesterday only", () => {
    expect(relativeDay("2026-09-30", "2026-09-30")).toBe("today");
    expect(relativeDay("2026-09-29", "2026-09-30")).toBe("yesterday");
    expect(relativeDay("2026-09-28", "2026-09-30")).toBeNull();
  });
});

describe("kcal formatting", () => {
  it("rounds to 10 kcal from 100 up", () => {
    expect(roundKcal(347)).toBe(350);
    expect(roundKcal(1234)).toBe(1230);
    expect(roundKcal(47.4)).toBe(47);
  });

  it("gives the value and the range of a food entry", () => {
    expect(kcalEstimate(foodEntry(347, { items: [], kcalLow: 281, kcalHigh: 452 }))).toEqual({
      value: 350,
      low: 280,
      high: 450,
    });
  });

  it("drops the range when it is missing or a single number", () => {
    expect(kcalEstimate(foodEntry(347, null))).toEqual({ value: 350, low: null, high: null });
    expect(kcalEstimate(foodEntry(347, { items: [], kcalLow: 346, kcalHigh: 348 }))).toEqual({
      value: 350,
      low: null,
      high: null,
    });
  });

  it("reads the text as it is shown", () => {
    const { value, low, high } = kcalEstimate(
      foodEntry(347, { items: [], kcalLow: 281, kcalHigh: 452 }),
    );
    expect(i18n.t("trackers.kcal.aboutRange", { value, low, high })).toBe(
      "about 350 kcal (280 to 450)",
    );
    expect(i18n.t("trackers.kcal.aboutRange", { value, low, high, lng: "es" })).toBe(
      "unas 350 kcal (280 a 450)",
    );
  });

  it("hides kcal only for calorie trackers", () => {
    expect(hidesKcal({ kind: "CALORIES" }, true)).toBe(true);
    expect(hidesKcal({ kind: "NUMBER" }, true)).toBe(false);
    expect(hidesKcal({ kind: "CALORIES" }, false)).toBe(false);
  });
});

describe("readFoodDetails", () => {
  it("rejects shapes that are not a breakdown", () => {
    expect(readFoodDetails(null)).toBeNull();
    expect(readFoodDetails("text")).toBeNull();
    expect(readFoodDetails([1, 2])).toBeNull();
    expect(readFoodDetails({ kcalLow: 1 })).toBeNull();
  });

  it("keeps valid items and marks unknown sources as AI", () => {
    const details = readFoodDetails({
      items: [
        { name: "Rice", grams: 150, kcal: 195, source: "usda", matchedName: "Rice, white" },
        { name: "Sauce", grams: "a lot", kcal: 80, source: "other" },
        { grams: 10 },
      ],
      kcalLow: 220,
      kcalHigh: 340,
    });
    expect(details?.items).toHaveLength(2);
    expect(details?.items[0]).toMatchObject({ name: "Rice", grams: 150, source: "usda" });
    expect(details?.items[1]).toMatchObject({ name: "Sauce", grams: null, source: "ai" });
    expect(details?.kcalLow).toBe(220);
  });
});

describe("parseAmount", () => {
  it("accepts a comma as the decimal mark", () => {
    expect(parseAmount("72,5")).toBe(72.5);
    expect(parseAmount(" 10000 ")).toBe(10000);
  });

  it("returns null for empty or bad input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("goalProgress", () => {
  const stats = { today: 1500, week: 2, goalMetToday: true, goalMetThisWeek: false };

  it("is null without a goal", () => {
    expect(
      goalProgress({ goalValue: null, goalDirection: null, goalPeriod: null }, stats),
    ).toBeNull();
  });

  it("uses today for a daily goal", () => {
    expect(
      goalProgress({ goalValue: 2000, goalDirection: "AT_MOST", goalPeriod: "DAY" }, stats),
    ).toEqual({
      period: "DAY",
      direction: "AT_MOST",
      current: 1500,
      goal: 2000,
      ratio: 0.75,
      met: true,
    });
  });

  it("uses the week for a weekly goal", () => {
    const progress = goalProgress(
      { goalValue: 3, goalDirection: "AT_LEAST", goalPeriod: "WEEK" },
      stats,
    );
    expect(progress).toMatchObject({ current: 2, goal: 3, met: false, period: "WEEK" });
  });

  it("counts nothing logged as zero", () => {
    expect(
      goalProgress({ goalValue: 7, goalDirection: "AT_LEAST", goalPeriod: "DAY" }, undefined),
    ).toMatchObject({ current: 0, ratio: 0, met: null });
  });
});

describe("streakLabel", () => {
  it("is null with no streak", () => {
    expect(streakLabel(0, "DAY")).toBeNull();
  });

  it("picks days or weeks", () => {
    expect(streakLabel(5, "DAY")).toEqual({ key: "trackers.streak.days", count: 5 });
    expect(streakLabel(3, "WEEK")).toEqual({ key: "trackers.streak.weeks", count: 3 });
  });

  it("reads well in both languages", () => {
    const label = (streak: number, unit: "DAY" | "WEEK", lng: string) => {
      const found = streakLabel(streak, unit);
      return found ? i18n.t(found.key, { count: found.count, lng }) : null;
    };
    expect(label(5, "DAY", "en")).toBe("5 days in a row");
    expect(label(1, "WEEK", "en")).toBe("1 week in a row");
    expect(label(5, "DAY", "es")).toBe("5 días seguidos");
    expect(label(1, "WEEK", "es")).toBe("1 semana seguida");
  });
});

describe("latestDay", () => {
  it("finds the last day with a value", () => {
    expect(
      latestDay([
        { date: "2026-09-28", value: 72.4 },
        { date: "2026-09-29", value: 72.1 },
        { date: "2026-09-30", value: null },
      ]),
    ).toEqual({ date: "2026-09-29", value: 72.1 });
    expect(latestDay([{ date: "2026-09-30", value: null }])).toBeNull();
  });
});
