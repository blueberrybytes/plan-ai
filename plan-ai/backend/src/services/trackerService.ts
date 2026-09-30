import {
  Prisma,
  type NotePeriod,
  type Tracker,
  type TrackerAggregation,
  type TrackerEntry,
  type TrackerEntryStatus,
  type TrackerGoalDirection,
  type TrackerKind,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";

/**
 * Trackers and their entries. A tracker and its entries belong to one user
 * and are never shown to anyone else. Every call here takes the owner's id
 * and filters on it, so a wrong id answers 404, never someone else's data.
 */

export const MAX_TRACKERS_PER_USER = 30;
export const MAX_ENTRY_VALUE = 10_000_000;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
/** How far back a streak is counted. */
const STREAK_LOOKBACK_DAYS = 400;

export interface TrackerError {
  status: number;
  message: string;
  code?: string;
}

const fail = (status: number, message: string, code?: string): TrackerError => ({
  status,
  message,
  ...(code ? { code } : {}),
});

export interface TrackerOwner {
  userId: string;
  workspaceId: string;
}

// ── Dates ──────────────────────────────────────────────────────────────────

/** Parses a YYYY-MM-DD local day into a UTC midnight Date. */
export function parseDay(value: string | undefined | null, field = "date"): Date {
  if (!value || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw fail(400, `Use a ${field} like 2026-09-30.`);
  }
  return new Date(`${value}T00:00:00Z`);
}

export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
export const mondayOf = (date: Date): Date => addDays(date, -((date.getUTCDay() + 6) % 7));

/**
 * The user's "today" comes from the app, since only it knows the time zone.
 * It must be within a day of the server's date.
 */
export function parseToday(value: string | undefined | null, now = new Date()): Date {
  const today = parseDay(value, "today");
  const serverDay = new Date(`${dayKey(now)}T00:00:00Z`);
  if (Math.abs(today.getTime() - serverDay.getTime()) > DAY_MS) {
    throw fail(400, "The date of today does not match the server clock.");
  }
  return today;
}

// ── Trackers ───────────────────────────────────────────────────────────────

export interface TrackerInput {
  name?: string;
  kind?: TrackerKind;
  unit?: string | null;
  aggregation?: TrackerAggregation;
  goalValue?: number | null;
  goalDirection?: TrackerGoalDirection | null;
  goalPeriod?: NotePeriod | null;
  instructions?: string | null;
  position?: number;
  archived?: boolean;
}

const KINDS: TrackerKind[] = ["NUMBER", "CHECK", "CALORIES"];
const AGGREGATIONS: TrackerAggregation[] = ["SUM", "LAST", "AVERAGE"];
const DIRECTIONS: TrackerGoalDirection[] = ["AT_LEAST", "AT_MOST"];
const PERIODS: NotePeriod[] = ["DAY", "WEEK"];

const trimmed = (
  value: string | null | undefined,
  max: number,
  field: string,
): string | null | undefined => {
  if (value === undefined || value === null) return value;
  const t = value.trim();
  if (t.length > max) throw fail(400, `${field} can have at most ${max} characters.`);
  return t || null;
};

/** Checks the fields and fills in what the kind decides. */
function trackerData(input: TrackerInput, current?: Tracker): Prisma.TrackerUncheckedUpdateInput {
  const kind = input.kind ?? current?.kind;
  if (!kind || !KINDS.includes(kind)) throw fail(400, "Choose a kind: NUMBER, CHECK or CALORIES.");
  if (current && input.kind && input.kind !== current.kind) {
    throw fail(400, "The kind of a tracker cannot change. Create a new one.");
  }
  if (input.aggregation !== undefined && !AGGREGATIONS.includes(input.aggregation)) {
    throw fail(400, "Unknown aggregation.");
  }

  const data: Prisma.TrackerUncheckedUpdateInput = {};
  if (input.name !== undefined) {
    const name = trimmed(input.name, 60, "The name");
    if (!name) throw fail(400, "A tracker needs a name.");
    data.name = name;
  }
  if (input.unit !== undefined) data.unit = trimmed(input.unit, 16, "The unit");
  if (input.instructions !== undefined) {
    data.instructions = trimmed(input.instructions, 300, "The instructions");
  }
  if (input.aggregation !== undefined) data.aggregation = input.aggregation;
  if (typeof input.position === "number" && Number.isInteger(input.position)) {
    data.position = input.position;
  }
  if (typeof input.archived === "boolean") data.archivedAt = input.archived ? new Date() : null;

  // The kind decides some fields, whatever the app sent.
  if (kind === "CALORIES") {
    data.unit = "kcal";
    data.aggregation = "SUM";
  } else if (kind === "CHECK") {
    data.unit = null;
    data.aggregation = "SUM";
  }

  const goalTouched =
    input.goalValue !== undefined ||
    input.goalDirection !== undefined ||
    input.goalPeriod !== undefined;
  if (goalTouched) {
    const value = input.goalValue !== undefined ? input.goalValue : (current?.goalValue ?? null);
    const direction =
      input.goalDirection !== undefined ? input.goalDirection : (current?.goalDirection ?? null);
    const period = input.goalPeriod !== undefined ? input.goalPeriod : (current?.goalPeriod ?? null);
    if (value === null) {
      data.goalValue = null;
      data.goalDirection = null;
      data.goalPeriod = null;
    } else {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw fail(400, "The goal must be a number of 0 or more.");
      }
      if (value > MAX_ENTRY_VALUE) throw fail(400, "The goal is too large.");
      if (!direction || !DIRECTIONS.includes(direction)) {
        throw fail(400, "Say whether the goal is a minimum (AT_LEAST) or a maximum (AT_MOST).");
      }
      if (!period || !PERIODS.includes(period)) throw fail(400, "The goal period is DAY or WEEK.");
      data.goalValue = value;
      data.goalDirection = direction;
      data.goalPeriod = period;
    }
  }
  return data;
}

export async function listTrackers(
  owner: TrackerOwner,
  includeArchived = false,
): Promise<Tracker[]> {
  return prisma.tracker.findMany({
    where: {
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getTracker(owner: TrackerOwner, id: string): Promise<Tracker> {
  const tracker = await prisma.tracker.findFirst({
    where: { id, workspaceId: owner.workspaceId, userId: owner.userId },
  });
  if (!tracker) throw fail(404, "Tracker not found.");
  return tracker;
}

export async function createTracker(owner: TrackerOwner, input: TrackerInput): Promise<Tracker> {
  if (!input?.name) throw fail(400, "A tracker needs a name.");
  const count = await prisma.tracker.count({
    where: { userId: owner.userId, workspaceId: owner.workspaceId, archivedAt: null },
  });
  if (count >= MAX_TRACKERS_PER_USER) {
    throw fail(400, `You can have up to ${MAX_TRACKERS_PER_USER} trackers. Archive one first.`);
  }
  const data = trackerData(input);
  return prisma.tracker.create({
    data: {
      ...(data as Prisma.TrackerUncheckedCreateInput),
      name: data.name as string,
      kind: input.kind as TrackerKind,
      position: typeof input.position === "number" ? input.position : count,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
    },
  });
}

export async function updateTracker(
  owner: TrackerOwner,
  id: string,
  input: TrackerInput,
): Promise<Tracker> {
  const current = await getTracker(owner, id);
  return prisma.tracker.update({ where: { id: current.id }, data: trackerData(input, current) });
}

/** Deletes the tracker and all its entries. Archive it to keep the history. */
export async function deleteTracker(owner: TrackerOwner, id: string): Promise<void> {
  const current = await getTracker(owner, id);
  await prisma.tracker.delete({ where: { id: current.id } });
}

// ── Entries ────────────────────────────────────────────────────────────────

export interface EntryInput {
  id?: string;
  date?: string;
  value?: number;
  label?: string | null;
  status?: TrackerEntryStatus;
}

const checkValue = (tracker: Tracker, value: unknown): number => {
  if (tracker.kind === "CHECK") return 1;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_ENTRY_VALUE) {
    throw fail(400, "The value must be a number.");
  }
  if (tracker.kind === "CALORIES" && value < 0) throw fail(400, "Calories cannot be negative.");
  return value;
};

/** Entry dates go from five years ago to tomorrow (time zones). */
const checkEntryDate = (value: string | undefined): Date => {
  const date = parseDay(value);
  const now = Date.now();
  if (date.getTime() > now + 2 * DAY_MS || date.getTime() < now - 5 * 366 * DAY_MS) {
    throw fail(400, "That date is out of range.");
  }
  return date;
};

/** A value the user typed. It counts at once. */
export async function addEntry(
  owner: TrackerOwner,
  trackerId: string,
  input: EntryInput,
): Promise<TrackerEntry> {
  const tracker = await getTracker(owner, trackerId);
  if (input.id !== undefined) {
    if (!CLIENT_ID_PATTERN.test(input.id)) throw fail(400, "Invalid entry id.");
    const existing = await prisma.trackerEntry.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.userId !== owner.userId) throw fail(409, "That id is already in use.");
      return existing;
    }
  }
  return prisma.trackerEntry.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      trackerId: tracker.id,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      date: checkEntryDate(input.date),
      value: checkValue(tracker, input.value),
      label: trimmed(input.label, 200, "The label") ?? null,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });
}

async function ownEntry(owner: TrackerOwner, id: string) {
  const entry = await prisma.trackerEntry.findFirst({
    where: { id, workspaceId: owner.workspaceId, userId: owner.userId },
    include: { tracker: true },
  });
  if (!entry) throw fail(404, "Entry not found.");
  return entry;
}

/**
 * Edits an entry. Accepting a proposal is an update to CONFIRMED, refusing
 * it an update to REJECTED. A changed value on a food entry drops the food
 * breakdown, since it no longer adds up.
 */
export async function updateEntry(
  owner: TrackerOwner,
  id: string,
  input: EntryInput,
): Promise<TrackerEntry> {
  const entry = await ownEntry(owner, id);
  const data: Prisma.TrackerEntryUncheckedUpdateInput = {};
  if (input.value !== undefined) {
    const value = checkValue(entry.tracker, input.value);
    if (value !== entry.value) {
      data.value = value;
      if (entry.details) data.details = Prisma.DbNull;
    }
  }
  if (input.date !== undefined) data.date = checkEntryDate(input.date);
  if (input.label !== undefined) data.label = trimmed(input.label, 200, "The label") ?? null;
  if (input.status !== undefined) {
    if (!["PROPOSED", "CONFIRMED", "REJECTED"].includes(input.status)) {
      throw fail(400, "Unknown status.");
    }
    if (input.status === "PROPOSED" && entry.status !== "PROPOSED") {
      throw fail(400, "An entry cannot go back to proposed.");
    }
    data.status = input.status;
  }
  return prisma.trackerEntry.update({ where: { id: entry.id }, data });
}

export async function deleteEntry(owner: TrackerOwner, id: string): Promise<void> {
  const entry = await ownEntry(owner, id);
  await prisma.trackerEntry.delete({ where: { id: entry.id } });
}

/** Accepts or refuses several proposals at once. Returns how many changed. */
export async function reviewProposals(
  owner: TrackerOwner,
  ids: string[],
  status: "CONFIRMED" | "REJECTED",
): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    throw fail(400, "Send between 1 and 200 entry ids.");
  }
  if (status !== "CONFIRMED" && status !== "REJECTED") throw fail(400, "Unknown status.");
  const result = await prisma.trackerEntry.updateMany({
    where: {
      id: { in: ids },
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      status: "PROPOSED",
    },
    data: { status },
  });
  return result.count;
}

export interface EntryQuery {
  from?: string;
  to?: string;
  status?: TrackerEntryStatus;
  trackerId?: string;
  noteId?: string;
}

export async function listEntries(owner: TrackerOwner, query: EntryQuery): Promise<TrackerEntry[]> {
  const where: Prisma.TrackerEntryWhereInput = {
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    tracker: { archivedAt: null },
  };
  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: parseDay(query.from, "from") } : {}),
      ...(query.to ? { lte: parseDay(query.to, "to") } : {}),
    };
  }
  if (query.status) where.status = query.status;
  if (query.trackerId) where.trackerId = query.trackerId;
  if (query.noteId) where.noteId = query.noteId;
  return prisma.trackerEntry.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────

export interface DayValue {
  date: string;
  /** Null when nothing was logged that day. */
  value: number | null;
  /** Null when the tracker has no daily goal or nothing was logged. */
  goalMet: boolean | null;
}

export interface TrackerStats {
  trackerId: string;
  days: DayValue[];
  today: number | null;
  /** Monday to today: a total, the last value or an average, as the tracker adds up. */
  week: number | null;
  goalMetToday: boolean | null;
  goalMetThisWeek: boolean | null;
  /** Days (or weeks, for a weekly goal) in a row with the goal met. */
  streak: number;
  streakUnit: NotePeriod;
}

type StatEntry = Pick<TrackerEntry, "date" | "value" | "createdAt">;

/** One number for a group of entries, as the tracker adds up. */
export function aggregate(tracker: Pick<Tracker, "kind" | "aggregation">, entries: StatEntry[]) {
  if (entries.length === 0) return null;
  if (tracker.kind === "CHECK") return 1;
  if (tracker.aggregation === "LAST") {
    const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return sorted[sorted.length - 1].value;
  }
  const sum = entries.reduce((total, e) => total + e.value, 0);
  return tracker.aggregation === "AVERAGE" ? sum / entries.length : sum;
}

const meets = (direction: TrackerGoalDirection | null, goal: number | null, value: number | null) => {
  if (goal === null || direction === null || value === null) return null;
  return direction === "AT_LEAST" ? value >= goal : value <= goal;
};

/**
 * Pure: turns confirmed entries into what the charts need. `from` to
 * `today` must be UTC midnights of local days.
 */
export function computeStats(
  tracker: Pick<
    Tracker,
    "id" | "kind" | "aggregation" | "goalValue" | "goalDirection" | "goalPeriod"
  >,
  entries: StatEntry[],
  from: Date,
  to: Date,
  today: Date,
): TrackerStats {
  const byDay = new Map<string, StatEntry[]>();
  for (const e of entries) {
    const key = dayKey(e.date);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const dayValue = (date: Date) => aggregate(tracker, byDay.get(dayKey(date)) ?? []);
  const dailyGoal = tracker.goalPeriod === "DAY";

  const days: DayValue[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    const value = dayValue(d);
    days.push({
      date: dayKey(d),
      value,
      goalMet: dailyGoal ? meets(tracker.goalDirection, tracker.goalValue, value) : null,
    });
  }

  const weekValue = (monday: Date, last: Date): number | null => {
    const inWeek: StatEntry[] = [];
    for (let d = monday; d.getTime() <= last.getTime(); d = addDays(d, 1)) {
      inWeek.push(...(byDay.get(dayKey(d)) ?? []));
    }
    if (tracker.kind === "CHECK") {
      // Days done in the week.
      const done = new Set(inWeek.map((e) => dayKey(e.date))).size;
      return inWeek.length ? done : null;
    }
    return aggregate(tracker, inWeek);
  };

  const todayValue = dayValue(today);
  const thisMonday = mondayOf(today);
  const week = weekValue(thisMonday, today);

  // A day with nothing logged never counts: for a maximum (kcal) an empty
  // day is unknown, not a success. Today not met yet does not break it.
  let streak = 0;
  const earliest = addDays(today, -STREAK_LOOKBACK_DAYS);
  if (tracker.goalPeriod === "WEEK") {
    const weekMet = (monday: Date) =>
      meets(tracker.goalDirection, tracker.goalValue, weekValue(monday, addDays(monday, 6)));
    let monday = weekMet(thisMonday) ? thisMonday : addDays(thisMonday, -7);
    while (monday.getTime() >= earliest.getTime() && weekMet(monday)) {
      streak++;
      monday = addDays(monday, -7);
    }
  } else {
    const dayMet = (date: Date) =>
      tracker.goalValue === null
        ? byDay.has(dayKey(date))
        : meets(tracker.goalDirection, tracker.goalValue, dayValue(date)) === true;
    let day = dayMet(today) ? today : addDays(today, -1);
    while (day.getTime() >= earliest.getTime() && dayMet(day)) {
      streak++;
      day = addDays(day, -1);
    }
  }

  return {
    trackerId: tracker.id,
    days,
    today: todayValue,
    week,
    goalMetToday: dailyGoal ? meets(tracker.goalDirection, tracker.goalValue, todayValue) : null,
    goalMetThisWeek:
      tracker.goalPeriod === "WEEK" ? meets(tracker.goalDirection, tracker.goalValue, week) : null,
    streak,
    streakUnit: tracker.goalPeriod === "WEEK" ? "WEEK" : "DAY",
  };
}

export async function getStats(
  owner: TrackerOwner,
  query: { from?: string; to?: string; today?: string },
): Promise<TrackerStats[]> {
  const today = parseToday(query.today);
  const to = query.to ? parseDay(query.to, "to") : today;
  const from = query.from ? parseDay(query.from, "from") : addDays(to, -29);
  if (from.getTime() > to.getTime()) throw fail(400, "from must be before to.");
  if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw fail(400, `Ask for at most ${MAX_RANGE_DAYS} days.`);
  }

  const trackers = await listTrackers(owner);
  if (trackers.length === 0) return [];
  const since = new Date(
    Math.min(from.getTime(), addDays(mondayOf(today), -STREAK_LOOKBACK_DAYS).getTime()),
  );
  const entries = await prisma.trackerEntry.findMany({
    where: {
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      status: "CONFIRMED",
      trackerId: { in: trackers.map((t) => t.id) },
      date: { gte: since, lte: new Date(Math.max(to.getTime(), today.getTime())) },
    },
    select: { trackerId: true, date: true, value: true, createdAt: true },
  });
  return trackers.map((tracker) =>
    computeStats(
      tracker,
      entries.filter((e) => e.trackerId === tracker.id),
      from,
      to,
      today,
    ),
  );
}
