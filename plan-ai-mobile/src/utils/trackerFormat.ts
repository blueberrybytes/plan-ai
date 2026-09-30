import type { Tracker, TrackerEntry } from "../services/planAiApi";

/**
 * The `details` of a CALORIES entry. The API types it as loose JSON, so this
 * is only a view of it, checked by caloriesDetailsOf before use.
 */
export interface CalorieItem {
  name: string;
  grams: number | null;
  kcal: number | null;
  kcalLow: number | null;
  kcalHigh: number | null;
}

export interface CalorieDetails {
  items: CalorieItem[];
  kcalLow: number | null;
  kcalHigh: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The food list of a CALORIES entry, or null when details has another shape. */
export function caloriesDetailsOf(entry: Pick<TrackerEntry, "details">): CalorieDetails | null {
  const d = entry.details as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.items)) return null;
  const items: CalorieItem[] = [];
  for (const raw of d.items as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Record<string, unknown>;
    if (typeof i.name !== "string") continue;
    items.push({
      name: i.name,
      grams: num(i.grams),
      kcal: num(i.kcal),
      kcalLow: num(i.kcalLow),
      kcalHigh: num(i.kcalHigh),
    });
  }
  return { items, kcalLow: num(d.kcalLow), kcalHigh: num(d.kcalHigh) };
}

/** 1234.5 as "1,234.5". At most one decimal. */
export function formatNumber(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function unitOf(t: Pick<Tracker, "kind" | "unit">): string {
  if (t.unit && t.unit.trim()) return t.unit.trim();
  return t.kind === "CALORIES" ? "kcal" : "";
}

/** "350 kcal", "2 l", "7". */
export function formatValue(v: number, t: Pick<Tracker, "kind" | "unit">): string {
  const unit = unitOf(t);
  return unit ? `${formatNumber(v)} ${unit}` : formatNumber(v);
}

/** "about 350 kcal (280 to 450)" for a CALORIES proposal. */
export function formatCalories(value: number, details: CalorieDetails | null): string {
  const base = `about ${formatNumber(Math.round(value))} kcal`;
  const low = details?.kcalLow;
  const high = details?.kcalHigh;
  if (low == null || high == null || low === high) return base;
  return `${base} (${formatNumber(Math.round(low))} to ${formatNumber(Math.round(high))})`;
}

/** Local date key YYYY-MM-DD moved by `days`. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, 12);
  date.setDate(date.getDate() + days);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Today", "Yesterday" or "Mon, Sep 29". */
export function dayLabel(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === addDaysKey(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, 12);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** One letter for a day in the week chart: "M", "T". */
export function weekdayLetter(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, 12);
  return date.toLocaleDateString(undefined, { weekday: "narrow" });
}

/** "5 days in a row", "1 week in a row". */
export function streakLabel(streak: number, unit: "DAY" | "WEEK"): string {
  const n = Math.floor(streak);
  const word = unit === "WEEK" ? (n === 1 ? "week" : "weeks") : n === 1 ? "day" : "days";
  return `${n} ${word} in a row`;
}

/** A number typed by the user. Accepts a comma as the decimal mark. */
export function parseTypedNumber(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
}
