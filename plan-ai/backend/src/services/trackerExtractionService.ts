import { generateText, Output } from "ai";
import { z } from "zod";
import type { Prisma, Tracker, TrackerEntry } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import {
  DEFAULT_AI_MODEL,
  getStructuredProviderOptions,
  getWorkspaceModel,
  privacyProviderPrefs,
} from "../utils/aiModelUtils";
import { aiUsageService } from "./aiUsageService";
import { lookupFood } from "./foodLookupService";
import { addDays, dayKey, listTrackers, parseToday, type TrackerOwner } from "./trackerService";

/**
 * Reads a note (or a line the user typed) and proposes tracker entries.
 * Nothing counts until the user accepts it. For food, the AI names each food
 * and guesses the grams; the kcal come from USDA FoodData Central when it
 * knows the food, and every number is kept as a range.
 *
 * The text is health data, so the call asks OpenRouter for providers that
 * keep nothing (zero data retention), on top of the usual no-training rule.
 */

const MODEL = DEFAULT_AI_MODEL;
export const MAX_NOTE_CHARS = 6000;
export const MAX_TEXT_CHARS = 2000;
const MAX_DAYS_BACK = 7;
const MAX_GRAMS = 5000;

export interface ExtractionError {
  status: number;
  message: string;
  code?: string;
}

const fail = (status: number, message: string, code?: string): ExtractionError => ({
  status,
  message,
  ...(code ? { code } : {}),
});

// Every field required and nullable: strict json_schema providers reject
// optional properties (see aiTaskCoachService).
const FoodSchema = z.object({
  name: z.string().describe("The food as the user wrote it, in their language."),
  usdaQuery: z
    .string()
    .describe(
      "Short generic English description to search the USDA food database, e.g. 'egg whole boiled', 'bread white toasted', 'rice white cooked'.",
    ),
  grams: z.number().describe("Best guess of the eaten weight in grams."),
  gramsLow: z.number().describe("Low end of a reasonable range of grams."),
  gramsHigh: z.number().describe("High end of a reasonable range of grams."),
  kcalPer100g: z.number().describe("Your own estimate of kcal per 100 g, as a backup."),
});

const ExtractionSchema = z.object({
  entries: z.array(
    z.object({
      trackerId: z.string().describe("Id of the tracker, copied from the list."),
      value: z
        .number()
        .nullable()
        .describe("The number for a NUMBER tracker. Null for CHECK and CALORIES."),
      label: z.string().describe("A few words saying what was logged, in the user's language."),
      dayOffset: z
        .number()
        .describe("0 if it happened today, -1 yesterday, and so on. Never positive."),
      foods: z
        .array(FoodSchema)
        .nullable()
        .describe("Only for a CALORIES tracker: one item per food eaten. Null otherwise."),
    }),
  ),
});

type Extracted = z.infer<typeof ExtractionSchema>["entries"][number];

export interface FoodItemDetails {
  name: string;
  grams: number;
  gramsLow: number;
  gramsHigh: number;
  kcal: number;
  kcalLow: number;
  kcalHigh: number;
  /** "usda" when the kcal per 100 g came from the database, "ai" when it is the model's guess. */
  source: "usda" | "ai";
  fdcId?: number;
  matchedName?: string;
}

export interface FoodDetails {
  items: FoodItemDetails[];
  kcalLow: number;
  kcalHigh: number;
}

const clampGrams = (g: unknown): number =>
  typeof g === "number" && Number.isFinite(g) ? Math.min(Math.max(g, 0), MAX_GRAMS) : 0;

/**
 * Turns the AI's foods into kcal. The database value is used unless it is
 * more than twice as far from the AI's own estimate, which means the search
 * matched the wrong food ("boiled egg" finding "boiled peanuts").
 */
export async function priceFoods(foods: Extracted["foods"]): Promise<FoodDetails | null> {
  if (!foods || foods.length === 0) return null;
  const items: FoodItemDetails[] = [];
  for (const food of foods.slice(0, 20)) {
    const grams = clampGrams(food.grams);
    if (grams <= 0) continue;
    const low = Math.min(clampGrams(food.gramsLow) || grams, grams);
    const high = Math.max(clampGrams(food.gramsHigh) || grams, grams);
    const aiPer100 =
      typeof food.kcalPer100g === "number" && food.kcalPer100g >= 0 && food.kcalPer100g <= 950
        ? food.kcalPer100g
        : null;
    const match = await lookupFood(food.usdaQuery || food.name);
    const plausible =
      match &&
      (aiPer100 === null ||
        aiPer100 === 0 ||
        (match.kcalPer100g / aiPer100 <= 2 && match.kcalPer100g / aiPer100 >= 0.5));
    const per100 = plausible ? match!.kcalPer100g : aiPer100;
    if (per100 === null) continue;
    items.push({
      name: food.name.slice(0, 80),
      grams: Math.round(grams),
      gramsLow: Math.round(low),
      gramsHigh: Math.round(high),
      kcal: Math.round((grams * per100) / 100),
      kcalLow: Math.round((low * per100) / 100),
      kcalHigh: Math.round((high * per100) / 100),
      source: plausible ? "usda" : "ai",
      ...(plausible ? { fdcId: match!.fdcId, matchedName: match!.description } : {}),
    });
  }
  if (items.length === 0) return null;
  return {
    items,
    kcalLow: items.reduce((t, i) => t + i.kcalLow, 0),
    kcalHigh: items.reduce((t, i) => t + i.kcalHigh, 0),
  };
}

const describeTracker = (t: Tracker): string => {
  const parts = [`id=${t.id}`, `name="${t.name}"`, `kind=${t.kind}`];
  if (t.unit) parts.push(`unit=${t.unit}`);
  if (t.instructions) parts.push(`notes="${t.instructions}"`);
  return `- ${parts.join(", ")}`;
};

const SYSTEM_PROMPT = `You read a personal note and find values for the user's trackers.
Rules:
- Only log what the text says happened. Plans, wishes and goals are not entries ("I want to run tomorrow" logs nothing).
- Use only the trackers in the list, by id. If nothing matches, return no entries.
- NUMBER: put the number in "value", converted to the tracker's unit (e.g. 1.5 h for "an hour and a half").
- CHECK: one entry per day it was done, "value" null.
- CALORIES: one entry per meal or snack, "value" null, and list every food in "foods" with grams. Use normal portion sizes when the text gives none.
- Do not repeat anything in "Already logged".
- dayOffset: 0 unless the text says it was another day ("yesterday" is -1). Never earlier than -7.
- Labels are short and in the language of the note.`;

async function callModel(
  owner: TrackerOwner,
  trackers: Tracker[],
  text: string,
  today: Date,
  alreadyLogged: string[],
): Promise<Extracted[]> {
  const model = await getWorkspaceModel(owner.workspaceId, MODEL);
  const structured = getStructuredProviderOptions(MODEL);
  const prompt = [
    `Today is ${dayKey(today)} (${today.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}).`,
    `Trackers:\n${trackers.map(describeTracker).join("\n")}`,
    alreadyLogged.length ? `Already logged from this text:\n${alreadyLogged.join("\n")}` : "",
    `Text:\n"""\n${text}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await generateText({
    model,
    providerOptions: {
      openrouter: {
        ...structured.openrouter,
        provider: { ...privacyProviderPrefs(), data_collection: "deny", zdr: true },
      },
    },
    output: Output.object({
      name: "TrackerEntries",
      description: "Tracker entries found in the user's text.",
      schema: ExtractionSchema,
    }),
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0,
  });

  if (response.totalUsage) {
    await aiUsageService.logUsage({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      feature: "TRACKERS",
      provider: "OPENROUTER",
      model: MODEL,
      inputTokens: response.totalUsage.inputTokens || 0,
      outputTokens: response.totalUsage.outputTokens || 0,
    });
  }
  return response.output?.entries ?? [];
}

/** Checks the model's answer and builds the rows to store. */
async function toProposals(
  owner: TrackerOwner,
  trackers: Tracker[],
  extracted: Extracted[],
  today: Date,
  source: { noteId: string | null },
): Promise<Prisma.TrackerEntryCreateManyInput[]> {
  const byId = new Map(trackers.map((t) => [t.id, t]));
  const rows: Prisma.TrackerEntryCreateManyInput[] = [];
  for (const e of extracted.slice(0, 50)) {
    const tracker = byId.get(e.trackerId);
    if (!tracker) continue;
    const offset = Math.round(Number.isFinite(e.dayOffset) ? e.dayOffset : 0);
    const date = addDays(today, Math.min(0, Math.max(-MAX_DAYS_BACK, offset)));
    let value: number;
    let details: FoodDetails | null = null;
    if (tracker.kind === "CHECK") {
      value = 1;
    } else if (tracker.kind === "CALORIES") {
      details = await priceFoods(e.foods);
      if (!details) continue;
      value = details.items.reduce((t, i) => t + i.kcal, 0);
    } else {
      if (typeof e.value !== "number" || !Number.isFinite(e.value)) continue;
      if (Math.abs(e.value) > 10_000_000) continue;
      value = e.value;
    }
    rows.push({
      trackerId: tracker.id,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      date,
      value,
      label: (e.label || "").trim().slice(0, 200) || null,
      ...(details ? { details: details as unknown as Prisma.InputJsonObject } : {}),
      status: "PROPOSED",
      source: source.noteId ? "NOTE" : "MANUAL",
      noteId: source.noteId,
    });
  }
  return rows;
}

export interface ExtractionResult {
  /** Proposals waiting for the user, for this note (or just made from the text). */
  entries: TrackerEntry[];
  /** Why the AI was not called. */
  skipped: "no_trackers" | "unchanged" | "empty" | null;
}

/**
 * Proposes entries from one of the user's notes. The same note version is
 * read once: calling again returns the proposals already made. When the note
 * changed, old proposals are replaced and accepted or refused ones are left
 * alone and shown to the AI, so it does not propose them again.
 */
export async function extractFromNote(
  owner: TrackerOwner,
  noteId: string,
  todayInput: string,
): Promise<ExtractionResult> {
  const today = parseToday(todayInput);
  const note = await prisma.note.findFirst({
    where: { id: noteId, workspaceId: owner.workspaceId, userId: owner.userId, deletedAt: null },
  });
  if (!note) throw fail(404, "Note not found.");

  const pending = () =>
    prisma.trackerEntry.findMany({
      where: { noteId: note.id, userId: owner.userId, status: "PROPOSED" },
      orderBy: { createdAt: "asc" },
    });

  const trackers = await listTrackers(owner);
  if (trackers.length === 0) return { entries: [], skipped: "no_trackers" };
  const text = [note.title, note.body].filter(Boolean).join("\n").trim();
  if (!text) return { entries: [], skipped: "empty" };

  // Claim this version, so two devices closing the same note do not both
  // pay for it. The note's updatedAt is kept: this is not an edit.
  const claimed = await prisma.note.updateMany({
    where: {
      id: note.id,
      version: note.version,
      OR: [
        { trackersExtractedVersion: null },
        { trackersExtractedVersion: { not: note.version } },
      ],
    },
    data: { trackersExtractedVersion: note.version, updatedAt: note.updatedAt },
  });
  if (claimed.count === 0) return { entries: await pending(), skipped: "unchanged" };

  try {
    const reviewed = await prisma.trackerEntry.findMany({
      where: { noteId: note.id, userId: owner.userId, status: { in: ["CONFIRMED", "REJECTED"] } },
      include: { tracker: { select: { name: true } } },
    });
    const alreadyLogged = reviewed.map(
      (r) => `- ${r.tracker.name}: ${r.value} "${r.label ?? ""}" on ${dayKey(r.date)}`,
    );
    const extracted = await callModel(
      owner,
      trackers,
      text.slice(0, MAX_NOTE_CHARS),
      today,
      alreadyLogged,
    );
    const rows = await toProposals(owner, trackers, extracted, today, { noteId: note.id });
    await prisma.$transaction([
      prisma.trackerEntry.deleteMany({
        where: { noteId: note.id, userId: owner.userId, status: "PROPOSED" },
      }),
      prisma.trackerEntry.createMany({ data: rows }),
    ]);
  } catch (err) {
    // Let the next call try again.
    await prisma.note.updateMany({
      where: { id: note.id, trackersExtractedVersion: note.version },
      data: { trackersExtractedVersion: note.trackersExtractedVersion, updatedAt: note.updatedAt },
    });
    throw err;
  }
  return { entries: await pending(), skipped: null };
}

/** Proposes entries from a line typed on the trackers page ("2 eggs and toast"). */
export async function extractFromText(
  owner: TrackerOwner,
  text: string,
  todayInput: string,
): Promise<ExtractionResult> {
  const today = parseToday(todayInput);
  const clean = (text ?? "").trim();
  if (!clean) return { entries: [], skipped: "empty" };
  if (clean.length > MAX_TEXT_CHARS) {
    throw fail(400, `Write at most ${MAX_TEXT_CHARS} characters, or use a note.`);
  }
  const trackers = await listTrackers(owner);
  if (trackers.length === 0) return { entries: [], skipped: "no_trackers" };

  const extracted = await callModel(owner, trackers, clean, today, []);
  const rows = await toProposals(owner, trackers, extracted, today, { noteId: null });
  const created = await prisma.$transaction(
    rows.map((data) => prisma.trackerEntry.create({ data })),
  );
  return { entries: created, skipped: null };
}
