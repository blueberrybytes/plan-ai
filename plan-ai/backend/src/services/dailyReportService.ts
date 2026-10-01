import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  Prisma,
  TaskUpdateKind,
  TaskUpdateProposal,
  TaskUpdateStatus,
  WorkspaceRole,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";
import {
  DEFAULT_AI_MODEL,
  getStructuredProviderOptions,
  getWorkspaceModel,
  privacyProviderPrefs,
} from "../utils/aiModelUtils";
import { aiUsageService } from "./aiUsageService";
import { contextService } from "./contextService";
import { dayKey } from "./trackerService";

/**
 * Daily report (parte diario). A member says at the end of the day what they
 * did, in their day note. The AI reads it next to the member's open tasks and
 * proposes changes: tasks done, moved forward or stuck, and work that was not
 * a task yet. Nothing changes until the member accepts it.
 *
 * What the owner sees later is the tasks and their status, never the text of
 * the note. The note stays private to its author.
 */

const MODEL = DEFAULT_AI_MODEL;
export const MAX_REPORT_CHARS = 8000;
const MAX_OPEN_TASKS = 80;
// Tasks nobody owns yet (the board and meetings do not set an assignee).
const MAX_UNASSIGNED_TASKS = 40;
const MAX_PROJECTS = 40;
const MAX_UPDATES = 20;
export const DAILY_REPORT_CONSENT_VERSION = 1;
export const DEFAULT_REMINDER_TIME = "17:30";
/** Where new tasks go when the AI cannot tell the project. */
export const DAILY_REPORT_PROJECT_TITLE = "Daily report";
const REMINDER_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DailyReportActor {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface DailyReportError {
  status: number;
  message: string;
  code?: string;
}

const fail = (status: number, message: string, code?: string): DailyReportError => ({
  status,
  message,
  ...(code ? { code } : {}),
});

export const canManageDailyReport = (role: WorkspaceRole) => role === "OWNER" || role === "ADMIN";

// ── Settings and consent ───────────────────────────────────────────────────

export interface DailyReportStatus {
  enabled: boolean;
  /** "HH:mm", local time of each member. */
  reminderTime: string;
  /** False for a personal workspace, where the daily report does not exist. */
  available: boolean;
  consentVersion: number;
  consentedVersion: number | null;
  consentedAt: Date | null;
  needsConsent: boolean;
  canManage: boolean;
}

export async function getStatus(actor: DailyReportActor): Promise<DailyReportStatus> {
  const [workspace, member] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: actor.workspaceId },
      select: { kind: true, dailyReportEnabled: true, dailyReportReminderTime: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } },
      select: { dailyReportConsentAt: true, dailyReportConsentVersion: true },
    }),
  ]);
  if (!workspace) throw fail(404, "Workspace not found.");
  const available = workspace.kind === "TEAM";
  const enabled = available && workspace.dailyReportEnabled;
  const consentedVersion = member?.dailyReportConsentAt
    ? (member.dailyReportConsentVersion ?? null)
    : null;
  return {
    enabled,
    reminderTime: workspace.dailyReportReminderTime || DEFAULT_REMINDER_TIME,
    available,
    consentVersion: DAILY_REPORT_CONSENT_VERSION,
    consentedVersion,
    consentedAt: member?.dailyReportConsentAt ?? null,
    needsConsent: enabled && consentedVersion !== DAILY_REPORT_CONSENT_VERSION,
    canManage: canManageDailyReport(actor.role),
  };
}

/**
 * Accepts or withdraws the member's consent. Withdrawing drops the proposals
 * still waiting. Accepted ones already changed tasks and stay as history.
 */
export async function setConsent(actor: DailyReportActor, accept: boolean): Promise<void> {
  if (accept) {
    const status = await getStatus(actor);
    if (!status.enabled) throw fail(400, "The daily report is off in this workspace.");
  }
  // updateMany, so platform staff on support access (not members) get a 404
  // instead of a crash.
  const [updated] = await prisma.$transaction([
    prisma.workspaceMember.updateMany({
      where: { workspaceId: actor.workspaceId, userId: actor.userId },
      data: accept
        ? {
            dailyReportConsentAt: new Date(),
            dailyReportConsentVersion: DAILY_REPORT_CONSENT_VERSION,
          }
        : { dailyReportConsentAt: null, dailyReportConsentVersion: null },
    }),
    ...(accept
      ? []
      : [
          prisma.taskUpdateProposal.deleteMany({
            where: { workspaceId: actor.workspaceId, userId: actor.userId, status: "PROPOSED" },
          }),
        ]),
  ]);
  if (updated.count === 0) throw fail(404, "You are not a member of this workspace.");
}

export interface DailyReportSettingsInput {
  enabled?: boolean;
  /** "HH:mm". Null goes back to the default. */
  reminderTime?: string | null;
}

export async function updateSettings(
  actor: DailyReportActor,
  input: DailyReportSettingsInput,
): Promise<DailyReportStatus> {
  if (!canManageDailyReport(actor.role)) {
    throw fail(403, "Only owners and admins can change the daily report.");
  }
  const data: Prisma.WorkspaceUpdateInput = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") throw fail(400, "enabled must be true or false.");
    data.dailyReportEnabled = input.enabled;
  }
  if (input.reminderTime !== undefined) {
    if (input.reminderTime !== null && !REMINDER_PATTERN.test(input.reminderTime)) {
      throw fail(400, "Use a reminder time like 17:30.");
    }
    data.dailyReportReminderTime = input.reminderTime;
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: actor.workspaceId },
    select: { kind: true },
  });
  if (!workspace) throw fail(404, "Workspace not found.");
  if (workspace.kind !== "TEAM" && input.enabled) {
    throw fail(400, "The daily report is for team workspaces.");
  }
  await prisma.workspace.update({ where: { id: actor.workspaceId }, data });
  return getStatus(actor);
}

/** Throws unless the daily report is on and the member accepted its text. */
export async function requireActive(actor: DailyReportActor): Promise<void> {
  const status = await getStatus(actor);
  if (!status.enabled) {
    throw fail(403, "The daily report is off in this workspace.", "daily_report_disabled");
  }
  if (status.needsConsent) {
    throw fail(403, "Accept the daily report text first.", "daily_report_consent_required");
  }
}

// ── Reading the report with AI ─────────────────────────────────────────────

const KINDS = ["COMPLETED", "PROGRESS", "BLOCKED", "NEW", "DONE"] as const;
const EXISTING_TASK_KINDS = new Set<TaskUpdateKind>(["COMPLETED", "PROGRESS", "BLOCKED"]);

// Every field required and nullable: strict json_schema providers reject
// optional properties (see aiTaskCoachService).
const ExtractionSchema = z.object({
  updates: z.array(
    z.object({
      kind: z.enum(KINDS),
      taskId: z
        .string()
        .nullable()
        .describe(
          "Id of the task from the list for COMPLETED, PROGRESS and BLOCKED. Null otherwise.",
        ),
      projectId: z
        .string()
        .nullable()
        .describe(
          "For NEW and DONE: id of the project from the list it clearly belongs to, else null.",
        ),
      title: z
        .string()
        .describe("For NEW and DONE: a short task title. For the others: the task title."),
      detail: z
        .string()
        .nullable()
        .describe("PROGRESS: what moved. BLOCKED: why it is stuck. Otherwise null."),
    }),
  ),
});

type Extracted = z.infer<typeof ExtractionSchema>["updates"][number];

const SYSTEM_PROMPT = `You read a work report that a team member wrote or dictated at the end of their day, and propose changes to their task list.
Kinds:
- COMPLETED: a task from the list is finished. Use its id.
- PROGRESS: a task from the list moved forward but is not finished. Use its id. "detail" says what moved.
- BLOCKED: a task from the list is stuck. Use its id. "detail" says why.
- DONE: work finished that matches no task in the list. "title" names it.
- NEW: something still to do that matches no task in the list, such as a follow-up, a promise to a client or a next step. "title" names it.
Rules:
- Use an id only when the report clearly talks about that task. When unsure, use DONE or NEW instead of guessing.
- One update per task. Skip anything listed under "Already reviewed".
- For DONE and NEW, "projectId" is the id of the project it clearly belongs to, or null.
- Titles are short (under 10 words) and start with a verb. Details are under 20 words. Both in the language of the report.
- Wishes without a commitment, small talk and feelings are not tasks.
- At most ${MAX_UPDATES} updates.`;

interface OpenTask {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  projectTitle: string;
}

interface ProjectRef {
  id: string;
  title: string;
}

async function callModel(
  actor: DailyReportActor,
  day: Date,
  text: string,
  tasks: OpenTask[],
  projects: ProjectRef[],
  alreadyReviewed: string[],
): Promise<Extracted[]> {
  const model = await getWorkspaceModel(actor.workspaceId, MODEL);
  const structured = getStructuredProviderOptions(MODEL);
  const taskLines = tasks.map((t) => {
    const due = t.dueDate ? `, due=${dayKey(t.dueDate)}` : "";
    return `- id=${t.id}, title="${t.title}", status=${t.status}, project="${t.projectTitle}"${due}`;
  });
  const prompt = [
    `Report of ${dayKey(day)}.`,
    `Open tasks of this member:\n${taskLines.length ? taskLines.join("\n") : "(none)"}`,
    `Projects:\n${projects.length ? projects.map((p) => `- id=${p.id}, title="${p.title}"`).join("\n") : "(none)"}`,
    alreadyReviewed.length
      ? `Already reviewed from this report:\n${alreadyReviewed.join("\n")}`
      : "",
    `Report:\n"""\n${text}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");

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
        name: "TaskUpdates",
        description: "Changes to the member's tasks found in their daily report.",
        schema: ExtractionSchema,
      }),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0,
    });
  } catch (err) {
    // The provider's error can carry the report. Only its kind and status go on.
    const e = err as { name?: string; statusCode?: number };
    throw Object.assign(
      new Error(
        `Daily report AI call failed: ${e?.name ?? "Error"}${e?.statusCode ? ` ${e.statusCode}` : ""}`,
      ),
      { name: "DailyReportAiError" },
    );
  }

  if (response.totalUsage) {
    await aiUsageService.logUsage({
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      feature: "DAILY_REPORT",
      provider: "OPENROUTER",
      model: MODEL,
      inputTokens: response.totalUsage.inputTokens || 0,
      outputTokens: response.totalUsage.outputTokens || 0,
    });
  }
  return response.output?.updates ?? [];
}

const clean = (value: string | null | undefined, max: number): string =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Checks the model's answer against the member's tasks and builds the rows. */
export function toProposalRows(
  actor: DailyReportActor,
  extracted: Extracted[],
  tasks: OpenTask[],
  projects: ProjectRef[],
  day: Date,
  noteId: string,
  reviewedTaskIds: Set<string>,
): Prisma.TaskUpdateProposalCreateManyInput[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectIds = new Set(projects.map((p) => p.id));
  const seenTasks = new Set<string>();
  const seenTitles = new Set<string>();
  const rows: Prisma.TaskUpdateProposalCreateManyInput[] = [];
  for (const u of extracted.slice(0, MAX_UPDATES)) {
    if (!KINDS.includes(u.kind)) continue;
    const kind = u.kind as TaskUpdateKind;
    const detail = clean(u.detail, 500) || null;
    if (EXISTING_TASK_KINDS.has(kind)) {
      const task = u.taskId ? taskById.get(u.taskId) : undefined;
      if (!task || seenTasks.has(task.id) || reviewedTaskIds.has(task.id)) continue;
      seenTasks.add(task.id);
      rows.push({
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        noteId,
        taskId: task.id,
        projectId: null,
        kind,
        title: clean(task.title, 300),
        detail: kind === "COMPLETED" ? null : detail,
        day,
      });
    } else {
      const title = clean(u.title, 200);
      const key = title.toLowerCase();
      if (!title || seenTitles.has(key)) continue;
      seenTitles.add(key);
      rows.push({
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        noteId,
        taskId: null,
        projectId: u.projectId && projectIds.has(u.projectId) ? u.projectId : null,
        kind,
        title,
        detail,
        day,
      });
    }
  }
  return rows;
}

export interface ExtractionResult {
  proposals: TaskUpdateProposal[];
  /** Why the AI was not called: the note was already read, or it is empty. */
  skipped: "unchanged" | "empty" | null;
}

const pendingFor = (actor: DailyReportActor, noteId: string) =>
  prisma.taskUpdateProposal.findMany({
    where: { noteId, userId: actor.userId, status: "PROPOSED" },
    orderBy: { createdAt: "asc" },
  });

/**
 * Proposes task changes from the member's day note. The same note version is
 * read once. When the note changed, waiting proposals are replaced and the
 * reviewed ones are shown to the AI so it does not propose them again.
 */
export async function extractFromDayNote(
  actor: DailyReportActor,
  noteId: string,
): Promise<ExtractionResult> {
  await requireActive(actor);
  const note = await prisma.note.findFirst({
    where: { id: noteId, workspaceId: actor.workspaceId, userId: actor.userId, deletedAt: null },
  });
  if (!note) throw fail(404, "Note not found.");
  if (note.periodType !== "DAY" || !note.periodStart) {
    throw fail(400, "Only a day note can be read as a daily report.");
  }
  const text = [note.title, note.body].filter(Boolean).join("\n").trim();
  if (!text) return { proposals: [], skipped: "empty" };

  // Claim this version, so two devices closing the same note do not both pay
  // for it. The note's updatedAt is kept: this is not an edit.
  const claimed = await prisma.note.updateMany({
    where: {
      id: note.id,
      version: note.version,
      OR: [{ tasksExtractedVersion: null }, { tasksExtractedVersion: { not: note.version } }],
    },
    data: { tasksExtractedVersion: note.version, updatedAt: note.updatedAt },
  });
  if (claimed.count === 0)
    return { proposals: await pendingFor(actor, note.id), skipped: "unchanged" };

  try {
    const taskQuery = (assigneeId: string | null, take: number) =>
      prisma.task.findMany({
        where: {
          assigneeId,
          status: { in: ["BACKLOG", "IN_PROGRESS", "BLOCKED"] },
          project: { workspaceId: actor.workspaceId, status: "ACTIVE" },
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: { select: { title: true } },
        },
        orderBy: { updatedAt: "desc" },
        take,
      });
    // The member's tasks, plus open tasks nobody owns: accepting a change
    // on one of those makes it theirs. Tasks of other members are never sent.
    const [ownTasks, unassignedTasks, projects, reviewed] = await Promise.all([
      taskQuery(actor.userId, MAX_OPEN_TASKS),
      taskQuery(null, MAX_UNASSIGNED_TASKS),
      prisma.project.findMany({
        where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PROJECTS,
      }),
      prisma.taskUpdateProposal.findMany({
        where: { noteId: note.id, userId: actor.userId, status: { in: ["ACCEPTED", "REJECTED"] } },
        select: { kind: true, title: true, taskId: true },
      }),
    ]);
    const tasks: OpenTask[] = [...ownTasks, ...unassignedTasks].map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      projectTitle: t.project.title,
    }));
    const extracted = await callModel(
      actor,
      note.periodStart,
      text.slice(0, MAX_REPORT_CHARS),
      tasks,
      projects,
      reviewed.map((r) => `- ${r.kind}: "${r.title}"`),
    );
    const reviewedTaskIds = new Set(
      reviewed.map((r) => r.taskId).filter((id): id is string => !!id),
    );
    const rows = toProposalRows(
      actor,
      extracted,
      tasks,
      projects,
      note.periodStart,
      note.id,
      reviewedTaskIds,
    );
    await prisma.$transaction([
      prisma.taskUpdateProposal.deleteMany({
        where: { noteId: note.id, userId: actor.userId, status: "PROPOSED" },
      }),
      prisma.taskUpdateProposal.createMany({ data: rows }),
    ]);
  } catch (err) {
    // Let the next call try again.
    await prisma.note.updateMany({
      where: { id: note.id, tasksExtractedVersion: note.version },
      data: { tasksExtractedVersion: note.tasksExtractedVersion, updatedAt: note.updatedAt },
    });
    throw err;
  }
  return { proposals: await pendingFor(actor, note.id), skipped: null };
}

// ── Reviewing proposals ────────────────────────────────────────────────────

export type ProposalWithNames = TaskUpdateProposal & {
  project: { title: string } | null;
  task: { title: string; status: string; project: { title: string } } | null;
};

const PROPOSAL_INCLUDE = {
  project: { select: { title: true } },
  task: { select: { title: true, status: true, project: { select: { title: true } } } },
} as const;

export async function listProposals(
  actor: DailyReportActor,
  query: { status?: TaskUpdateStatus; noteId?: string },
): Promise<ProposalWithNames[]> {
  return prisma.taskUpdateProposal.findMany({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.noteId ? { noteId: query.noteId } : {}),
    },
    include: PROPOSAL_INCLUDE,
    orderBy: [{ day: "desc" }, { createdAt: "asc" }],
    take: 100,
  });
}

export interface ReviewItem {
  id: string;
  status: "ACCEPTED" | "REJECTED";
  /** For NEW and DONE: the title the member wants, when they edited it. */
  title?: string;
  /** For NEW and DONE: the project the member picked. */
  projectId?: string | null;
}

/** The project for tasks the AI could not place. Made the first time it is needed. */
async function dailyReportProjectId(
  tx: Prisma.TransactionClient,
  actor: DailyReportActor,
): Promise<string> {
  const existing = await tx.project.findFirst({
    where: { workspaceId: actor.workspaceId, title: DAILY_REPORT_PROJECT_TITLE, status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;
  const created = await tx.project.create({
    data: {
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      title: DAILY_REPORT_PROJECT_TITLE,
      description: "Tasks that came from daily reports and fit no other project.",
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
  await contextService.createContextForProject(
    actor.userId,
    actor.workspaceId,
    created.id,
    created.title,
    tx,
  );
  return created.id;
}

async function applyProposal(
  tx: Prisma.TransactionClient,
  actor: DailyReportActor,
  proposal: TaskUpdateProposal,
  item: ReviewItem,
  now: Date,
): Promise<void> {
  if (item.status === "REJECTED") {
    await tx.taskUpdateProposal.update({
      where: { id: proposal.id },
      data: { status: "REJECTED", reviewedAt: now },
    });
    return;
  }

  if (EXISTING_TASK_KINDS.has(proposal.kind)) {
    const task = proposal.taskId
      ? await tx.task.findFirst({
          where: { id: proposal.taskId, project: { workspaceId: actor.workspaceId } },
          select: { id: true, status: true, assigneeId: true },
        })
      : null;
    if (!task) throw fail(409, `The task "${proposal.title}" no longer exists.`, "task_gone");
    if (task.assigneeId && task.assigneeId !== actor.userId) {
      throw fail(
        409,
        `The task "${proposal.title}" is now assigned to someone else.`,
        "task_taken",
      );
    }
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (proposal.kind === "COMPLETED" && task.status !== "COMPLETED") {
      data.status = "COMPLETED";
      data.completedAt = now;
    } else if (
      proposal.kind === "PROGRESS" &&
      (task.status === "BACKLOG" || task.status === "BLOCKED")
    ) {
      data.status = "IN_PROGRESS";
    } else if (proposal.kind === "BLOCKED" && task.status !== "COMPLETED") {
      data.status = "BLOCKED";
    }
    // Reporting on a task nobody owned makes it the member's.
    if (!task.assigneeId) data.assigneeId = actor.userId;
    if (Object.keys(data).length > 0) await tx.task.update({ where: { id: task.id }, data });
    await tx.taskUpdateProposal.update({
      where: { id: proposal.id },
      data: { status: "ACCEPTED", reviewedAt: now },
    });
    return;
  }

  // NEW or DONE: the task is made now.
  const title = clean(item.title ?? proposal.title, 200);
  if (!title) throw fail(400, "A task needs a title.");
  let projectId = item.projectId !== undefined ? item.projectId : proposal.projectId;
  if (projectId) {
    const project = await tx.project.findFirst({
      where: { id: projectId, workspaceId: actor.workspaceId },
      select: { id: true },
    });
    if (!project) throw fail(404, "Project not found.");
  } else {
    projectId = await dailyReportProjectId(tx, actor);
  }
  const done = proposal.kind === "DONE";
  const task = await tx.task.create({
    data: {
      projectId,
      title,
      description: proposal.detail,
      status: done ? "COMPLETED" : "BACKLOG",
      completedAt: done ? now : null,
      assigneeId: actor.userId,
      metadata: { source: "daily_report", proposalId: proposal.id },
    },
  });
  await tx.taskUpdateProposal.update({
    where: { id: proposal.id },
    data: { status: "ACCEPTED", reviewedAt: now, taskId: task.id, projectId, title },
  });
}

/**
 * Accepts or refuses proposals. Each one is applied in its own transaction,
 * so one task deleted in the meantime does not block the rest. Returns what
 * could not be applied.
 */
export async function reviewProposals(
  actor: DailyReportActor,
  items: ReviewItem[],
): Promise<{ updated: number; failed: { id: string; message: string }[] }> {
  if (!Array.isArray(items) || items.length === 0) throw fail(400, "Send at least one proposal.");
  if (items.length > 100) throw fail(400, "Send at most 100 proposals at once.");
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !["ACCEPTED", "REJECTED"].includes(item.status)) {
      throw fail(400, "Each item needs an id and a status of ACCEPTED or REJECTED.");
    }
  }
  await requireActive(actor);
  const proposals = await prisma.taskUpdateProposal.findMany({
    where: {
      id: { in: items.map((i) => i.id) },
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      status: "PROPOSED",
    },
  });
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const now = new Date();
  let updated = 0;
  const failed: { id: string; message: string }[] = [];
  for (const item of items) {
    const proposal = byId.get(item.id);
    if (!proposal) {
      failed.push({ id: item.id, message: "Not found or already reviewed." });
      continue;
    }
    try {
      await prisma.$transaction((tx) => applyProposal(tx, actor, proposal, item, now));
      updated += 1;
    } catch (err) {
      const e = err as DailyReportError;
      if (typeof e?.status !== "number") throw err;
      failed.push({ id: item.id, message: e.message });
    }
  }
  return { updated, failed };
}
