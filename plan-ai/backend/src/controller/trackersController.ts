import { countFeature } from "../services/featureUsageService";
import { Body, Delete, Get, Patch, Path, Post, Query, Request, Route, Security, Tags } from "tsoa";
import type { Tracker, TrackerEntry } from "@prisma/client";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { TsoaJsonObject } from "./controllerTypes";
import { checkUsageLimit } from "../services/usageLimitGuard";
import { requireTrackerAccess } from "../services/personalService";
import {
  addEntry,
  createTracker,
  deleteEntry,
  deleteTracker,
  getStats,
  listEntries,
  listTrackers,
  reviewProposals,
  updateEntry,
  updateTracker,
  type TrackerError,
  type TrackerOwner,
} from "../services/trackerService";
import { extractFromNote, extractFromText } from "../services/trackerExtractionService";
import { MissingApiKeyError } from "../utils/aiModelUtils";

export type TrackerKindValue = "NUMBER" | "CHECK" | "CALORIES";
export type TrackerAggregationValue = "SUM" | "LAST" | "AVERAGE";
export type TrackerGoalDirectionValue = "AT_LEAST" | "AT_MOST";
export type TrackerPeriodValue = "DAY" | "WEEK";
export type TrackerEntryStatusValue = "PROPOSED" | "CONFIRMED" | "REJECTED";
export type TrackerEntrySourceValue = "MANUAL" | "NOTE" | "IMPORT";

export interface TrackerResponse {
  id: string;
  name: string;
  kind: TrackerKindValue;
  unit: string | null;
  aggregation: TrackerAggregationValue;
  goalValue: number | null;
  goalDirection: TrackerGoalDirectionValue | null;
  goalPeriod: TrackerPeriodValue | null;
  instructions: string | null;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerEntryResponse {
  id: string;
  trackerId: string;
  /** YYYY-MM-DD, the user's local day. */
  date: string;
  value: number;
  label: string | null;
  /**
   * For CALORIES: { items: [{ name, grams, gramsLow, gramsHigh, kcal, kcalLow,
   * kcalHigh }], kcalLow, kcalHigh }. The kcal are AI estimates.
   */
  details: TsoaJsonObject | null;
  status: TrackerEntryStatusValue;
  source: TrackerEntrySourceValue;
  noteId: string | null;
  createdAt: string;
}

export interface TrackerInputRequest {
  name?: string;
  kind?: TrackerKindValue;
  unit?: string | null;
  aggregation?: TrackerAggregationValue;
  /** Null removes the goal. */
  goalValue?: number | null;
  goalDirection?: TrackerGoalDirectionValue | null;
  goalPeriod?: TrackerPeriodValue | null;
  /** Extra words for the AI, e.g. "count only hours with clients". */
  instructions?: string | null;
  position?: number;
  archived?: boolean;
}

export interface AddEntryRequest {
  /** Optional id made by the app (16 to 64 of A-Z a-z 0-9 _ -), so a retry is not duplicated. */
  id?: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Ignored for CHECK trackers (always 1). */
  value?: number;
  label?: string | null;
}

export interface UpdateEntryRequest {
  date?: string;
  value?: number;
  label?: string | null;
  /** CONFIRMED accepts a proposal, REJECTED refuses it. */
  status?: TrackerEntryStatusValue;
}

export interface ReviewEntriesRequest {
  ids: string[];
  status: "CONFIRMED" | "REJECTED";
}

export interface ExtractRequest {
  /** Read this note of the user. */
  noteId?: string;
  /** Or read this text (at most 2000 characters). */
  text?: string;
  /** The user's local date, YYYY-MM-DD. */
  today: string;
}

export interface ExtractResponse {
  entries: TrackerEntryResponse[];
  /** Why the AI was not called: no_trackers, unchanged (already read) or empty. */
  skipped: "no_trackers" | "unchanged" | "empty" | null;
}

export interface TrackerDayValue {
  date: string;
  value: number | null;
  goalMet: boolean | null;
}

export interface TrackerStatsResponse {
  trackerId: string;
  days: TrackerDayValue[];
  today: number | null;
  week: number | null;
  goalMetToday: boolean | null;
  goalMetThisWeek: boolean | null;
  streak: number;
  streakUnit: TrackerPeriodValue;
}

const trackerResponse = (t: Tracker): TrackerResponse => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  unit: t.unit,
  aggregation: t.aggregation,
  goalValue: t.goalValue,
  goalDirection: t.goalDirection,
  goalPeriod: t.goalPeriod,
  instructions: t.instructions,
  position: t.position,
  archived: !!t.archivedAt,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const entryResponse = (e: TrackerEntry): TrackerEntryResponse => ({
  id: e.id,
  trackerId: e.trackerId,
  date: e.date.toISOString().slice(0, 10),
  value: e.value,
  label: e.label,
  details: (e.details as TsoaJsonObject | null) ?? null,
  status: e.status,
  source: e.source,
  noteId: e.noteId,
  createdAt: e.createdAt.toISOString(),
});

const STATUSES: TrackerEntryStatusValue[] = ["PROPOSED", "CONFIRMED", "REJECTED"];

/**
 * Trackers of the signed-in user. Only in their personal workspace, with
 * consent given (see personalController). Private to the user: no owner or
 * admin of any workspace can read them.
 */
@Route("api/trackers")
@Tags("Trackers")
@Security("ClientLevel")
export class TrackersController extends BaseWorkspaceController {
  private async owner(request: AuthenticatedRequest): Promise<TrackerOwner> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.run(() => requireTrackerAccess({ id: user.id, email: user.email }, workspaceId));
    return { userId: user.id, workspaceId };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.setStatus(400);
        throw {
          status: 400,
          code: "missing_api_key",
          message: "Add an OpenRouter key to your personal workspace to read notes with AI.",
        };
      }
      const e = err as TrackerError;
      if (typeof e?.status === "number") this.setStatus(e.status);
      throw err;
    }
  }

  @Get("/")
  public async listTrackers(
    @Request() request: AuthenticatedRequest,
    @Query() includeArchived?: boolean,
  ): Promise<TrackerResponse[]> {
    const owner = await this.owner(request);
    return (await listTrackers(owner, includeArchived === true)).map(trackerResponse);
  }

  @Post("/")
  public async createTracker(
    @Request() request: AuthenticatedRequest,
    @Body() body: TrackerInputRequest,
  ): Promise<TrackerResponse> {
    const owner = await this.owner(request);
    countFeature("tracker.created");
    return this.run(async () => trackerResponse(await createTracker(owner, body ?? {})));
  }

  /**
   * Values per day for charts, today, this week, goals and streaks.
   * `today` is the user's local date; from/to default to the last 30 days.
   */
  @Get("/stats")
  public async getTrackerStats(
    @Request() request: AuthenticatedRequest,
    @Query() today: string,
    @Query() from?: string,
    @Query() to?: string,
  ): Promise<TrackerStatsResponse[]> {
    const owner = await this.owner(request);
    return this.run(() => getStats(owner, { today, from, to }));
  }

  /** Entries, newest first. Use status=PROPOSED for what waits to be accepted. */
  @Get("/entries")
  public async listTrackerEntries(
    @Request() request: AuthenticatedRequest,
    @Query() from?: string,
    @Query() to?: string,
    @Query() status?: string,
    @Query() trackerId?: string,
    @Query() noteId?: string,
  ): Promise<TrackerEntryResponse[]> {
    const owner = await this.owner(request);
    if (status !== undefined && !STATUSES.includes(status as TrackerEntryStatusValue)) {
      this.setStatus(400);
      throw { status: 400, message: `status must be one of ${STATUSES.join(", ")}` };
    }
    return this.run(async () =>
      (
        await listEntries(owner, {
          from,
          to,
          status: status as TrackerEntryStatusValue | undefined,
          trackerId,
          noteId,
        })
      ).map(entryResponse),
    );
  }

  /** Accepts or refuses several proposals at once. */
  @Post("/entries/review")
  public async reviewTrackerEntries(
    @Request() request: AuthenticatedRequest,
    @Body() body: ReviewEntriesRequest,
  ): Promise<{ updated: number }> {
    const owner = await this.owner(request);
    return this.run(async () => ({
      updated: await reviewProposals(owner, body?.ids, body?.status),
    }));
  }

  @Patch("/entries/{entryId}")
  public async updateTrackerEntry(
    @Request() request: AuthenticatedRequest,
    @Path() entryId: string,
    @Body() body: UpdateEntryRequest,
  ): Promise<TrackerEntryResponse> {
    const owner = await this.owner(request);
    return this.run(async () => entryResponse(await updateEntry(owner, entryId, body ?? {})));
  }

  @Delete("/entries/{entryId}")
  public async deleteTrackerEntry(
    @Request() request: AuthenticatedRequest,
    @Path() entryId: string,
  ): Promise<{ success: boolean }> {
    const owner = await this.owner(request);
    await this.run(() => deleteEntry(owner, entryId));
    return { success: true };
  }

  /**
   * Reads a note (or a line of text) with AI and proposes entries. They do
   * not count until accepted. A note is read once per version.
   */
  @Post("/extract")
  public async extractTrackerEntries(
    @Request() request: AuthenticatedRequest,
    @Body() body: ExtractRequest,
  ): Promise<ExtractResponse> {
    const owner = await this.owner(request);
    if (!body?.noteId === !body?.text) {
      this.setStatus(400);
      throw { status: 400, message: "Send either noteId or text." };
    }
    return this.run(async () => {
      await checkUsageLimit(owner.workspaceId, "llm");
      countFeature("tracker.entries_extracted");
      const result = body.noteId
        ? await extractFromNote(owner, body.noteId, body.today)
        : await extractFromText(owner, body.text as string, body.today);
      return {
        entries: result.entries.map(entryResponse),
        skipped: result.skipped,
      };
    });
  }

  @Patch("{id}")
  public async updateTracker(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: TrackerInputRequest,
  ): Promise<TrackerResponse> {
    const owner = await this.owner(request);
    return this.run(async () => trackerResponse(await updateTracker(owner, id, body ?? {})));
  }

  /** Deletes the tracker and all its entries. Archive it instead to keep them. */
  @Delete("{id}")
  public async deleteTracker(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<{ success: boolean }> {
    const owner = await this.owner(request);
    await this.run(() => deleteTracker(owner, id));
    return { success: true };
  }

  /** A value the user typed. It counts at once. */
  @Post("{id}/entries")
  public async addTrackerEntry(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: AddEntryRequest,
  ): Promise<TrackerEntryResponse> {
    const owner = await this.owner(request);
    countFeature("tracker.entry_added");
    return this.run(async () => entryResponse(await addEntry(owner, id, body ?? {})));
  }
}
