import { countFeature } from "../services/featureUsageService";
import { Body, Get, Patch, Post, Query, Request, Route, Security, Tags } from "tsoa";
import type { TaskUpdateStatus } from "@prisma/client";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { checkUsageLimit } from "../services/usageLimitGuard";
import { requireActiveSubscription } from "../services/subscriptionGuard";
import { recordAudit } from "../services/auditLogService";
import { MissingApiKeyError } from "../utils/aiModelUtils";
import {
  canManageDailyReport,
  extractFromDayNote,
  getStatus,
  listProposals,
  reviewProposals,
  setConsent,
  updateSettings,
  type DailyReportActor,
  type DailyReportError,
  type DailyReportStatus,
  type ProposalWithNames,
} from "../services/dailyReportService";
import {
  buildTeamReport,
  resolveWeekStart,
  summarizeTeamReport,
  type TeamReport,
  type TeamReportTask,
} from "../services/teamReportService";

export type TaskUpdateKindValue = "COMPLETED" | "PROGRESS" | "BLOCKED" | "NEW" | "DONE";
export type TaskUpdateStatusValue = "PROPOSED" | "ACCEPTED" | "REJECTED";

export interface DailyReportStatusResponse {
  /** On for this workspace. */
  enabled: boolean;
  /** "HH:mm", local time of each member, when the apps remind them. */
  reminderTime: string;
  /** False in a personal workspace. */
  available: boolean;
  /** Version of the consent text the member has to accept. */
  consentVersion: number;
  consentedVersion: number | null;
  consentedAt: string | null;
  /** On, but the member has not accepted the current text. */
  needsConsent: boolean;
  /** Owner or admin: can change the settings and read the team report. */
  canManage: boolean;
}

export interface DailyReportSettingsRequest {
  enabled?: boolean;
  /** "HH:mm". Null goes back to 17:30. */
  reminderTime?: string | null;
}

export interface DailyReportConsentRequest {
  /** True accepts the text, false withdraws the consent. */
  accept: boolean;
}

export interface DailyReportExtractRequest {
  /** The member's day note. */
  noteId: string;
}

export interface TaskUpdateProposalResponse {
  id: string;
  kind: TaskUpdateKindValue;
  status: TaskUpdateStatusValue;
  /** The task title, or the proposed title of a new task. */
  title: string;
  /** What moved forward, or why it is stuck. */
  detail: string | null;
  /** YYYY-MM-DD, the day of the report. */
  day: string;
  noteId: string | null;
  taskId: string | null;
  /** Current status of the existing task. */
  taskStatus: string | null;
  projectId: string | null;
  /** The project of the task, or where a new task will go. Null lets the server pick. */
  projectTitle: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface DailyReportExtractResponse {
  proposals: TaskUpdateProposalResponse[];
  /** Why the AI was not called: unchanged (already read) or empty. */
  skipped: "unchanged" | "empty" | null;
}

export interface ReviewProposalItem {
  id: string;
  status: "ACCEPTED" | "REJECTED";
  /** For NEW and DONE: the title after the member edited it. */
  title?: string;
  /** For NEW and DONE: the project the member picked. */
  projectId?: string | null;
}

export interface ReviewProposalsRequest {
  items: ReviewProposalItem[];
}

export interface ReviewProposalsResponse {
  updated: number;
  failed: { id: string; message: string }[];
}

export interface TeamReportTaskResponse {
  id: string;
  title: string;
  projectTitle: string;
  /** Completed: when. Past due: the due date. */
  date: string | null;
  /** Stuck: the reason the member gave. */
  reason: string | null;
}

export interface TeamReportMemberResponse {
  userId: string;
  name: string;
  email: string;
  role: string;
  usesDailyReport: boolean;
  completedCount: number;
  completed: TeamReportTaskResponse[];
  inProgressCount: number;
  blocked: TeamReportTaskResponse[];
  overdueCount: number;
  overdue: TeamReportTaskResponse[];
  /** Days of the week with a daily report. Null when the member does not use it. */
  reportDays: number | null;
  summary: string | null;
}

export interface TeamReportResponse {
  workspaceName: string;
  dailyReportEnabled: boolean;
  weekStart: string;
  weekEnd: string;
  members: TeamReportMemberResponse[];
}

const statusResponse = (s: DailyReportStatus): DailyReportStatusResponse => ({
  enabled: s.enabled,
  reminderTime: s.reminderTime,
  available: s.available,
  consentVersion: s.consentVersion,
  consentedVersion: s.consentedVersion,
  consentedAt: s.consentedAt ? s.consentedAt.toISOString() : null,
  needsConsent: s.needsConsent,
  canManage: s.canManage,
});

const proposalResponse = (p: ProposalWithNames): TaskUpdateProposalResponse => ({
  id: p.id,
  kind: p.kind,
  status: p.status,
  title: p.title,
  detail: p.detail,
  day: p.day.toISOString().slice(0, 10),
  noteId: p.noteId,
  taskId: p.taskId,
  taskStatus: p.task?.status ?? null,
  projectId: p.projectId,
  projectTitle: p.task?.project.title ?? p.project?.title ?? null,
  createdAt: p.createdAt.toISOString(),
  reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
});

const taskResponse = (t: TeamReportTask): TeamReportTaskResponse => ({
  id: t.id,
  title: t.title,
  projectTitle: t.projectTitle,
  date: t.date ? t.date.toISOString() : null,
  reason: t.reason,
});

const teamResponse = (r: TeamReport): TeamReportResponse => ({
  workspaceName: r.workspaceName,
  dailyReportEnabled: r.dailyReportEnabled,
  weekStart: r.weekStart,
  weekEnd: r.weekEnd,
  members: r.members.map((m) => ({
    ...m,
    completed: m.completed.map(taskResponse),
    blocked: m.blocked.map(taskResponse),
    overdue: m.overdue.map(taskResponse),
  })),
});

const STATUSES: TaskUpdateStatusValue[] = ["PROPOSED", "ACCEPTED", "REJECTED"];

/**
 * Daily report: a member says what they did today, the AI proposes changes to
 * their tasks, and the member accepts or refuses each one. Owners and admins
 * get a weekly report built from tasks, never from the text of the reports.
 */
@Route("api/daily-report")
@Tags("Daily report")
@Security("ClientLevel")
export class DailyReportController extends BaseWorkspaceController {
  private async actor(request: AuthenticatedRequest) {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    const actor: DailyReportActor = { userId: user.id, workspaceId, role };
    return { actor, user };
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
          message: "Add an OpenRouter key to this workspace to read daily reports with AI.",
        };
      }
      const e = err as DailyReportError;
      // Kept whole, so the subscription and usage errors keep their fields.
      if (typeof e?.status === "number") this.setStatus(e.status);
      throw err;
    }
  }

  /** Whether the daily report is on and whether this member accepted its text. */
  @Get("/status")
  public async getDailyReportStatus(
    @Request() request: AuthenticatedRequest,
  ): Promise<DailyReportStatusResponse> {
    const { actor } = await this.actor(request);
    return this.run(async () => statusResponse(await getStatus(actor)));
  }

  /** Turns the daily report on or off and sets the reminder time. Owners and admins. */
  @Patch("/settings")
  public async updateDailyReportSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: DailyReportSettingsRequest,
  ): Promise<DailyReportStatusResponse> {
    const { actor, user } = await this.actor(request);
    const status = await this.run(() => updateSettings(actor, body ?? {}));
    await recordAudit({
      workspaceId: actor.workspaceId,
      actor: user,
      action: "workspace.daily_report_settings",
      targetType: "workspace",
      targetId: actor.workspaceId,
      metadata: { enabled: status.enabled, reminderTime: status.reminderTime },
      request,
    });
    return statusResponse(status);
  }

  /** Accepts or withdraws the member's consent. Withdrawing drops waiting proposals. */
  @Post("/consent")
  public async setDailyReportConsent(
    @Request() request: AuthenticatedRequest,
    @Body() body: DailyReportConsentRequest,
  ): Promise<DailyReportStatusResponse> {
    const { actor, user } = await this.actor(request);
    if (typeof body?.accept !== "boolean") {
      this.setStatus(400);
      throw { status: 400, message: "accept must be true or false." };
    }
    await this.run(() => setConsent(actor, body.accept));
    await recordAudit({
      workspaceId: actor.workspaceId,
      actor: user,
      action: body.accept ? "daily_report.consent_given" : "daily_report.consent_withdrawn",
      targetType: "user",
      targetId: actor.userId,
      request,
    });
    return this.run(async () => statusResponse(await getStatus(actor)));
  }

  /**
   * Reads the member's day note with AI and proposes task changes. Nothing
   * changes until they are accepted. A note is read once per version.
   */
  @Post("/extract")
  public async extractDailyReport(
    @Request() request: AuthenticatedRequest,
    @Body() body: DailyReportExtractRequest,
  ): Promise<DailyReportExtractResponse> {
    const { actor } = await this.actor(request);
    if (!body?.noteId) {
      this.setStatus(400);
      throw { status: 400, message: "Send the noteId of the day note." };
    }
    return this.run(async () => {
      await requireActiveSubscription(actor.workspaceId);
      await checkUsageLimit(actor.workspaceId, "llm");
      const result = await extractFromDayNote(actor, body.noteId);
      countFeature("daily_report.submitted");
      // The service returns rows without names; read them back with names.
      const withNames = result.proposals.length
        ? await listProposals(actor, { noteId: body.noteId, status: "PROPOSED" })
        : [];
      return { proposals: withNames.map(proposalResponse), skipped: result.skipped };
    });
  }

  /** The member's proposals, newest day first. status=PROPOSED for what waits. */
  @Get("/proposals")
  public async listDailyReportProposals(
    @Request() request: AuthenticatedRequest,
    @Query() status?: string,
    @Query() noteId?: string,
  ): Promise<TaskUpdateProposalResponse[]> {
    const { actor } = await this.actor(request);
    if (status !== undefined && !STATUSES.includes(status as TaskUpdateStatusValue)) {
      this.setStatus(400);
      throw { status: 400, message: `status must be one of ${STATUSES.join(", ")}` };
    }
    return this.run(async () =>
      (await listProposals(actor, { status: status as TaskUpdateStatus | undefined, noteId })).map(
        proposalResponse,
      ),
    );
  }

  /** Accepts or refuses proposals. Accepting changes or creates the tasks. */
  @Post("/proposals/review")
  public async reviewDailyReportProposals(
    @Request() request: AuthenticatedRequest,
    @Body() body: ReviewProposalsRequest,
  ): Promise<ReviewProposalsResponse> {
    const { actor } = await this.actor(request);
    return this.run(() => reviewProposals(actor, body?.items));
  }

  /**
   * The team's week for owners and admins: per member, tasks closed, stuck and
   * past due. `week` is any day of the week (default: last week). With
   * summary=true the AI adds one or two sentences per member.
   */
  @Get("/team")
  public async getTeamReport(
    @Request() request: AuthenticatedRequest,
    @Query() week?: string,
    @Query() summary?: boolean,
    @Query() language?: string,
  ): Promise<TeamReportResponse> {
    const { actor } = await this.actor(request);
    if (!canManageDailyReport(actor.role)) {
      this.setStatus(403);
      throw { status: 403, message: "Only owners and admins can read the team report." };
    }
    countFeature("team_report.viewed");
    return this.run(async () => {
      let report = await buildTeamReport(actor.workspaceId, resolveWeekStart(week));
      if (summary === true) {
        await requireActiveSubscription(actor.workspaceId);
        await checkUsageLimit(actor.workspaceId, "llm");
        report = await summarizeTeamReport(
          report,
          actor.userId,
          language ? language.slice(0, 20) : undefined,
        );
      }
      return teamResponse(report);
    });
  }
}
