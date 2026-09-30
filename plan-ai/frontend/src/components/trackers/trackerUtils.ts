import type {
  Tracker,
  TrackerEntry,
  TrackerPeriod,
  TrackerStats,
} from "../../store/apis/trackersApi";
import { localDateKey, parseDateKey } from "../notes/noteUtils";

/** The user's today as YYYY-MM-DD, from the browser's local calendar (not UTC). */
export const localToday = (now: Date = new Date()): string => localDateKey(now);

/** Moves a YYYY-MM-DD key by whole days, in local time. */
export const shiftDateKey = (key: string, days: number): string => {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

/**
 * Shape of `details` on a CALORIES entry. The API types it as loose JSON,
 * so it is read with the guard below.
 */
export interface FoodItem {
  name: string;
  grams: number | null;
  gramsLow: number | null;
  gramsHigh: number | null;
  kcal: number | null;
  kcalLow: number | null;
  kcalHigh: number | null;
}

export interface FoodDetails {
  items: FoodItem[];
  kcalLow: number | null;
  kcalHigh: number | null;
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readFoodItem = (raw: unknown): FoodItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.name !== "string" || !item.name) return null;
  return {
    name: item.name,
    grams: numberOrNull(item.grams),
    gramsLow: numberOrNull(item.gramsLow),
    gramsHigh: numberOrNull(item.gramsHigh),
    kcal: numberOrNull(item.kcal),
    kcalLow: numberOrNull(item.kcalLow),
    kcalHigh: numberOrNull(item.kcalHigh),
  };
};

/** The food breakdown of an entry, or null when it has none. */
export const readFoodDetails = (details: unknown): FoodDetails | null => {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = details as Record<string, unknown>;
  if (!Array.isArray(raw.items)) return null;
  const items = raw.items.map(readFoodItem).filter((item): item is FoodItem => item !== null);
  return { items, kcalLow: numberOrNull(raw.kcalLow), kcalHigh: numberOrNull(raw.kcalHigh) };
};

/** Estimates are not precise: round to 10 kcal from 100 up. */
export const roundKcal = (kcal: number): number =>
  Math.abs(kcal) >= 100 ? Math.round(kcal / 10) * 10 : Math.round(kcal);

export interface KcalEstimate {
  value: number;
  /** Null when the entry has no range, or the range is a single number. */
  low: number | null;
  high: number | null;
}

/** "about 350 kcal (280 to 450)": the rounded value and range of a food entry. */
export const kcalEstimate = (entry: Pick<TrackerEntry, "value" | "details">): KcalEstimate => {
  const value = roundKcal(entry.value);
  const details = readFoodDetails(entry.details);
  if (!details || details.kcalLow === null || details.kcalHigh === null) {
    return { value, low: null, high: null };
  }
  const low = roundKcal(details.kcalLow);
  const high = roundKcal(details.kcalHigh);
  return low === high ? { value, low: null, high: null } : { value, low, high };
};

/** A number for display, with at most `digits` decimals, in the user's language. */
export const formatNumber = (value: number, locale?: string, digits = 1): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);

/** Reads what the user typed. Accepts a comma as the decimal mark. */
export const parseAmount = (text: string): number | null => {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
};

/** For CALORIES trackers with "hide calories" on, no kcal number is shown. */
export const hidesKcal = (tracker: Pick<Tracker, "kind">, hideCalories: boolean): boolean =>
  hideCalories && tracker.kind === "CALORIES";

export interface GoalProgress {
  period: TrackerPeriod;
  direction: "AT_LEAST" | "AT_MOST";
  /** Today's value for a daily goal, this week's for a weekly one. */
  current: number;
  goal: number;
  /** current / goal, from 0. Above 1 when past the goal. */
  ratio: number;
  met: boolean | null;
}

/** Where the tracker stands against its goal, or null when it has none. */
export const goalProgress = (
  tracker: Pick<Tracker, "goalValue" | "goalDirection" | "goalPeriod">,
  stats: Pick<TrackerStats, "today" | "week" | "goalMetToday" | "goalMetThisWeek"> | undefined,
): GoalProgress | null => {
  if (tracker.goalValue === null || !tracker.goalDirection) return null;
  const period: TrackerPeriod = tracker.goalPeriod ?? "DAY";
  const current = (period === "DAY" ? stats?.today : stats?.week) ?? 0;
  const goal = tracker.goalValue;
  const met = (period === "DAY" ? stats?.goalMetToday : stats?.goalMetThisWeek) ?? null;
  return {
    period,
    direction: tracker.goalDirection,
    current,
    goal,
    ratio: goal > 0 ? current / goal : current > 0 ? 1 : 0,
    met,
  };
};

/** The i18n key and count for "5 days in a row", or null when there is no streak. */
export const streakLabel = (
  streak: number,
  unit: TrackerPeriod,
): { key: "trackers.streak.days" | "trackers.streak.weeks"; count: number } | null => {
  if (!Number.isFinite(streak) || streak < 1) return null;
  return { key: unit === "WEEK" ? "trackers.streak.weeks" : "trackers.streak.days", count: streak };
};

/** The error code the API sends in the body, if any. */
export const apiErrorCode = (error: unknown): string | null => {
  const code = (error as { data?: { code?: unknown } } | undefined)?.data?.code;
  return typeof code === "string" ? code : null;
};

/** The message the API sends in the body, if any. */
export const apiErrorMessage = (error: unknown): string | null => {
  const message = (error as { data?: { message?: unknown } } | undefined)?.data?.message;
  return typeof message === "string" && message ? message : null;
};

/** "today" or "yesterday" for those two days, else null. */
export const relativeDay = (key: string, today: string): "today" | "yesterday" | null => {
  if (key === today) return "today";
  if (key === shiftDateKey(today, -1)) return "yesterday";
  return null;
};

/** The last day with a value, for trackers that keep the last value (weight). */
export const latestDay = (
  days: { date: string; value: number | null }[] | undefined,
): { date: string; value: number } | null => {
  if (!days) return null;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const value = days[i].value;
    if (value !== null) return { date: days[i].date, value };
  }
  return null;
};
