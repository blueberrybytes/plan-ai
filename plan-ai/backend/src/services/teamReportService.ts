import { generateText, Output } from "ai";
import { z } from "zod";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import {
  DEFAULT_AI_MODEL,
  getStructuredProviderOptions,
  getWorkspaceModel,
  privacyProviderPrefs,
} from "../utils/aiModelUtils";
import { aiUsageService } from "./aiUsageService";
import { addDays, dayKey, mondayOf } from "./trackerService";
import { DAILY_REPORT_CONSENT_VERSION } from "./dailyReportService";
import { emailConfigured, sendTeamReportEmail } from "./emailService";

/**
 * The weekly team report for owners and admins: per member, the tasks closed
 * in the week, the ones stuck and the ones past due. It is built from tasks,
 * never from the text of daily reports, which stay private to their author.
 *
 * Measures what was delivered, not time. There is no ranking between people.
 */

const MODEL = DEFAULT_AI_MODEL;
const MAX_LISTED = 15;
const OPEN_STATUSES = ["BACKLOG", "IN_PROGRESS", "BLOCKED"] as const;

export interface TeamReportTask {
  id: string;
  title: string;
  projectTitle: string;
  /** Completed: when. Overdue: the due date. */
  date: Date | null;
  /** Blocked: the reason the member gave in their daily report. */
  reason: string | null;
}

export interface TeamReportMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  /** Accepted the current daily report text. */
  usesDailyReport: boolean;
  completedCount: number;
  completed: TeamReportTask[];
  inProgressCount: number;
  blocked: TeamReportTask[];
  overdueCount: number;
  overdue: TeamReportTask[];
  /** Days of the week with a daily report. Null when the member does not use it. */
  reportDays: number | null;
  /** One or two sentences written by AI. Null until asked for. */
  summary: string | null;
}

export interface TeamReport {
  workspaceId: string;
  workspaceName: string;
  dailyReportEnabled: boolean;
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Sunday, YYYY-MM-DD. */
  weekEnd: string;
  members: TeamReportMember[];
}

export interface TeamReportError {
  status: number;
  message: string;
}

/** Monday of the given day, or of last week when no day is given. */
export function resolveWeekStart(value: string | undefined, now = new Date()): Date {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw { status: 400, message: "Use a week like 2026-09-28." } as TeamReportError;
    }
    return mondayOf(new Date(`${value}T00:00:00Z`));
  }
  const today = new Date(`${dayKey(now)}T00:00:00Z`);
  return addDays(mondayOf(today), -7);
}

const taskRef = (t: {
  id: string;
  title: string;
  project: { title: string };
}): Omit<TeamReportTask, "date" | "reason"> => ({
  id: t.id,
  title: t.title,
  projectTitle: t.project.title,
});

export async function buildTeamReport(
  workspaceId: string,
  weekStart: Date,
  now = new Date(),
): Promise<TeamReport> {
  const start = mondayOf(weekStart);
  const end = addDays(start, 7); // exclusive
  // In the current week a task due on Friday is not late on Wednesday.
  const overdueBefore = Math.min(end.getTime(), now.getTime());
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, dailyReportEnabled: true, kind: true },
  });
  if (!workspace) throw { status: 404, message: "Workspace not found." } as TeamReportError;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      role: true,
      dailyReportConsentAt: true,
      dailyReportConsentVersion: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  const userIds = members.map((m) => m.user.id);
  const taskSelect = {
    id: true,
    title: true,
    assigneeId: true,
    dueDate: true,
    completedAt: true,
    updatedAt: true,
    project: { select: { title: true } },
  } as const;

  const [completed, open, noteDays, blockReasons] = await Promise.all([
    // Tasks closed before completedAt was stamped (October 2026), or by a
    // path that still does not stamp it, fall back to their last change.
    prisma.task.findMany({
      where: {
        assigneeId: { in: userIds },
        project: { workspaceId },
        status: "COMPLETED",
        OR: [
          { completedAt: { gte: start, lt: end } },
          { completedAt: null, updatedAt: { gte: start, lt: end } },
        ],
      },
      select: taskSelect,
      orderBy: { updatedAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: { in: userIds },
        project: { workspaceId },
        status: { in: [...OPEN_STATUSES] },
      },
      select: { ...taskSelect, status: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.note.groupBy({
      by: ["userId"],
      where: {
        workspaceId,
        userId: { in: userIds },
        periodType: "DAY",
        periodStart: { gte: start, lt: end },
        body: { not: "" },
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.taskUpdateProposal.findMany({
      where: { workspaceId, kind: "BLOCKED", status: "ACCEPTED", taskId: { not: null } },
      select: { taskId: true, detail: true },
      orderBy: { reviewedAt: "desc" },
      take: 500,
    }),
  ]);

  const reasonByTask = new Map<string, string | null>();
  for (const r of blockReasons) {
    if (r.taskId && !reasonByTask.has(r.taskId)) reasonByTask.set(r.taskId, r.detail);
  }
  const daysByUser = new Map(noteDays.map((n) => [n.userId, n._count._all]));

  const result: TeamReportMember[] = members.map((m) => {
    const uid = m.user.id;
    const usesDailyReport =
      !!m.dailyReportConsentAt && m.dailyReportConsentVersion === DAILY_REPORT_CONSENT_VERSION;
    const done = completed.filter((t) => t.assigneeId === uid);
    const mine = open.filter((t) => t.assigneeId === uid);
    const overdue = mine.filter((t) => t.dueDate && t.dueDate.getTime() < overdueBefore);
    const blocked = mine.filter((t) => t.status === "BLOCKED");
    return {
      userId: uid,
      name: m.user.name || m.user.email,
      email: m.user.email,
      role: m.role,
      usesDailyReport,
      completedCount: done.length,
      completed: done.slice(0, MAX_LISTED).map((t) => ({
        ...taskRef(t),
        date: t.completedAt ?? t.updatedAt,
        reason: null,
      })),
      inProgressCount: mine.filter((t) => t.status === "IN_PROGRESS").length,
      blocked: blocked.slice(0, MAX_LISTED).map((t) => ({
        ...taskRef(t),
        date: null,
        reason: reasonByTask.get(t.id) ?? null,
      })),
      overdueCount: overdue.length,
      overdue: overdue.slice(0, MAX_LISTED).map((t) => ({
        ...taskRef(t),
        date: t.dueDate,
        reason: null,
      })),
      reportDays: usesDailyReport ? (daysByUser.get(uid) ?? 0) : null,
      summary: null,
    };
  });
  result.sort((a, b) => a.name.localeCompare(b.name));

  return {
    workspaceId,
    workspaceName: workspace.name,
    dailyReportEnabled: workspace.kind === "TEAM" && workspace.dailyReportEnabled,
    weekStart: dayKey(start),
    weekEnd: dayKey(addDays(start, 6)),
    members: result,
  };
}

const hasActivity = (m: TeamReportMember) =>
  m.completedCount > 0 || m.inProgressCount > 0 || m.blocked.length > 0 || m.overdueCount > 0;

const SummarySchema = z.object({
  summaries: z.array(
    z.object({
      userId: z.string(),
      summary: z.string().describe("One or two short sentences."),
    }),
  ),
});

const SUMMARY_PROMPT = `You write one or two short sentences per team member for their manager, about the member's week.
Rules:
- Only facts from the data: what was closed, what is stuck and why, what is past due.
- No judgement of effort, attitude or character. No comparison between people.
- Plain words, no praise, no marketing words.
- Write in the requested language, or in the language most task titles use when none is given.`;

/**
 * Adds the AI sentences to the report, in one call for the whole team.
 * The data sent is task titles and counts only.
 */
export async function summarizeTeamReport(
  report: TeamReport,
  requestedBy: string,
  language?: string,
): Promise<TeamReport> {
  const active = report.members.filter(hasActivity);
  if (active.length === 0) return report;
  const data = active.map((m) => ({
    userId: m.userId,
    name: m.name.split(" ")[0],
    closed: m.completed.map((t) => t.title),
    closedCount: m.completedCount,
    inProgressCount: m.inProgressCount,
    blocked: m.blocked.map((t) => (t.reason ? `${t.title} (${t.reason})` : t.title)),
    overdue: m.overdue.map((t) => t.title),
    overdueCount: m.overdueCount,
  }));
  const model = await getWorkspaceModel(report.workspaceId, MODEL);
  const structured = getStructuredProviderOptions(MODEL);
  let response;
  try {
    response = await generateText({
      model,
      providerOptions: {
        openrouter: {
          ...structured.openrouter,
          provider: { ...privacyProviderPrefs(), data_collection: "deny" },
        },
      },
      output: Output.object({
        name: "TeamSummaries",
        description: "One short summary per team member.",
        schema: SummarySchema,
      }),
      system: SUMMARY_PROMPT,
      prompt: [
        language ? `Language: ${language}.` : "",
        `Week ${report.weekStart} to ${report.weekEnd}.`,
        `Members:\n${JSON.stringify(data)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      temperature: 0.2,
    });
  } catch (err) {
    const e = err as { name?: string; statusCode?: number };
    throw Object.assign(
      new Error(
        `Team report AI call failed: ${e?.name ?? "Error"}${e?.statusCode ? ` ${e.statusCode}` : ""}`,
      ),
      { name: "TeamReportAiError" },
    );
  }
  if (response.totalUsage) {
    await aiUsageService.logUsage({
      userId: requestedBy,
      workspaceId: report.workspaceId,
      feature: "TEAM_REPORT",
      provider: "OPENROUTER",
      model: MODEL,
      inputTokens: response.totalUsage.inputTokens || 0,
      outputTokens: response.totalUsage.outputTokens || 0,
    });
  }
  const byUser = new Map(
    (response.output?.summaries ?? []).map((s) => [s.userId, s.summary.trim().slice(0, 400)]),
  );
  return {
    ...report,
    members: report.members.map((m) => ({ ...m, summary: byUser.get(m.userId) || m.summary })),
  };
}

export interface TeamReportRunResult {
  workspaces: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Monday run: last week's report to the owners and admins of every workspace
 * with the daily report on. Owners who turned off the weekly email do not
 * get it. A workspace with no task activity sends nothing.
 */
export async function runTeamWeeklyReport(now = new Date()): Promise<TeamReportRunResult> {
  const result: TeamReportRunResult = { workspaces: 0, sent: 0, skipped: 0, failed: 0 };
  if (!emailConfigured()) {
    logger.warn("[TeamReport] RESEND_API_KEY not set, nothing sent");
    return result;
  }
  const workspaces = await prisma.workspace.findMany({
    where: { kind: "TEAM", dailyReportEnabled: true },
    select: {
      id: true,
      members: {
        where: {
          role: { in: ["OWNER", "ADMIN"] },
          user: { weeklyDigestEmail: true, role: { not: "PENDING" } },
        },
        select: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  const weekStart = resolveWeekStart(undefined, now);
  for (const ws of workspaces) {
    result.workspaces += 1;
    if (ws.members.length === 0) {
      result.skipped += 1;
      continue;
    }
    try {
      let report = await buildTeamReport(ws.id, weekStart);
      if (!report.members.some(hasActivity)) {
        result.skipped += 1;
        continue;
      }
      try {
        report = await summarizeTeamReport(report, ws.members[0].user.id);
      } catch (err) {
        // The numbers are worth sending without the sentences.
        logger.warn(`[TeamReport] No summaries for workspace ${ws.id}: ${(err as Error).message}`);
      }
      for (const { user } of ws.members) {
        try {
          await sendTeamReportEmail(user.email, { userName: user.name, report });
          result.sent += 1;
        } catch (err) {
          result.failed += 1;
          logger.error(`[TeamReport] Email failed for user ${user.id} / workspace ${ws.id}`, err);
        }
      }
    } catch (err) {
      result.failed += 1;
      logger.error(`[TeamReport] Failed for workspace ${ws.id}`, err);
    }
  }
  logger.info(
    `[TeamReport] workspaces=${result.workspaces} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
  );
  return result;
}
