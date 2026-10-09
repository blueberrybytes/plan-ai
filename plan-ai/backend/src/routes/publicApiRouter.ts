import { countApiRequest } from "../services/featureUsageService";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { validateMcpToken } from "../services/mcpTokenService";
import { scopeToMember } from "../services/tokenScope";
import { hiddenFromCaller } from "../services/accessScope";
import { taskCrudService } from "../services/taskCrudService";
import { recordMeetingAccess } from "../services/meetingAccessAudit";
import { logger } from "../utils/logger";
import { publicApiOpenApi } from "../publicApi/openapi";
import {
  MEETING_DETAIL_SELECT,
  MEETING_SELECT,
  PROJECT_SELECT,
  TASK_DETAIL_SELECT,
  TASK_SELECT,
  toApiMeeting,
  toApiMeetingDetail,
  toApiProject,
  toApiTask,
  toApiTaskDetail,
} from "../publicApi/mappers";

/**
 * The public REST API, at /api/v1. A small, documented surface for a
 * customer's own systems. It is separate from the internal API on purpose:
 * only these routes accept a personal token (the same tokens MCP uses).
 *
 * Every request acts as the token's user in the token's workspace. Queries go
 * through the default Prisma client after scopeToMember, so the restricted
 * projects that user does not see are not there. Every query also carries the
 * workspace id: a row of another workspace is a 404.
 *
 * The description customers read is in publicApi/openapi.ts. A test checks
 * that it lists every route of this router.
 */

const publicApiRouter = Router();

// ── Errors ──────────────────────────────────────────────────────────────────

type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "internal_error";

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);
const invalid = (message: string) => new ApiError(400, "invalid_request", message);

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
};

function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** Services here throw `{ status, message }`. Anything else is a 500 with no detail. */
function handleError(err: unknown, req: Request, res: Response): void {
  if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
  const thrown = err as { status?: unknown; message?: unknown } | null;
  const status = typeof thrown?.status === "number" ? thrown.status : 500;
  const code = CODE_BY_STATUS[status];
  if (code && typeof thrown?.message === "string") {
    return sendError(res, status, code, thrown.message);
  }
  logger.error(`[public-api] ${req.method} ${req.path} failed`, err);
  sendError(res, 500, "internal_error", "Something went wrong on our side.");
}

// ── Auth ────────────────────────────────────────────────────────────────────

interface ApiAuth {
  userId: string;
  workspaceId: string;
}

const authOf = (res: Response): ApiAuth => res.locals.auth as ApiAuth;

type Handler = (req: Request, res: Response, auth: ApiAuth) => Promise<void>;

const route =
  (handler: Handler) =>
  (req: Request, res: Response): void => {
    handler(req, res, authOf(res)).catch((err) => handleError(err, req, res));
  };

// ── Query helpers ───────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const queryString = (req: Request, name: string): string | undefined => {
  const value = req.query[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw invalid(`"${name}" must be given once.`);
  return value;
};

function limitOf(req: Request): number {
  const raw = queryString(req, "limit");
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalid(`"limit" must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
}

function dateOf(req: Request, name: string): Date | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw invalid(`"${name}" must be an ISO 8601 date.`);
  return date;
}

function enumOf<T extends string>(req: Request, name: string, values: readonly T[]): T | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) return undefined;
  if (!values.includes(raw as T)) {
    throw invalid(`"${name}" must be one of: ${values.join(", ")}.`);
  }
  return raw as T;
}

/**
 * Lists are newest first, by creation date and then id. The cursor is the
 * position of the last row of the page, so a row deleted between two pages
 * does not break the next one.
 */
interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  const [date, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const createdAt = new Date(date ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) throw invalid('"cursor" is not valid.');
  return { createdAt, id };
}

function cursorOf(req: Request): Cursor | undefined {
  const raw = queryString(req, "cursor");
  return raw === undefined ? undefined : decodeCursor(raw);
}

/** The rows after the cursor, for `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`. */
const afterCursor = (cursor: Cursor | undefined) =>
  cursor
    ? [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ]
    : [];

const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/** Rows were read with `take: limit + 1`: the extra one says there is a next page. */
function page<Row extends { createdAt: Date; id: string }, Out>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Out,
): { data: Out[]; nextCursor: string | null } {
  const shown = rows.slice(0, limit);
  const last = shown[shown.length - 1];
  return {
    data: shown.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

// ── Open routes ─────────────────────────────────────────────────────────────

publicApiRouter.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(publicApiOpenApi);
});

// ── Everything below needs a token ──────────────────────────────────────────

publicApiRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const auth = raw ? await validateMcpToken(raw) : null;
    if (!auth) {
      sendError(res, 401, "unauthorized", "Missing or invalid Authorization: Bearer <token>.");
      return;
    }
    // The token sees what its user sees. Before any query.
    await scopeToMember(auth.userId, auth.workspaceId);
    res.locals.auth = { userId: auth.userId, workspaceId: auth.workspaceId } satisfies ApiAuth;
    countApiRequest(auth.userId, auth.workspaceId);
    next();
  } catch (err) {
    handleError(err, req, res);
  }
});

publicApiRouter.get(
  "/me",
  route(async (_req, res, { userId, workspaceId }) => {
    const [user, workspace, member] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      }),
    ]);
    if (!user || !workspace) throw notFound("User");
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name },
      role: member?.role ?? null,
    });
  }),
);

// ── Projects ────────────────────────────────────────────────────────────────

publicApiRouter.get(
  "/projects",
  route(async (req, res, { workspaceId }) => {
    const limit = limitOf(req);
    const rows = await prisma.project.findMany({
      where: { workspaceId, AND: afterCursor(cursorOf(req)) },
      select: PROJECT_SELECT,
      orderBy: NEWEST_FIRST,
      take: limit + 1,
    });
    res.json(page(rows, limit, toApiProject));
  }),
);

publicApiRouter.get(
  "/projects/:id",
  route(async (req, res, { workspaceId }) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, workspaceId },
      select: PROJECT_SELECT,
    });
    if (!project) throw notFound("Project");
    res.json(toApiProject(project));
  }),
);

// ── Meetings ────────────────────────────────────────────────────────────────

publicApiRouter.get(
  "/meetings",
  route(async (req, res, { workspaceId }) => {
    const limit = limitOf(req);
    const projectId = queryString(req, "projectId");
    const since = dateOf(req, "since");
    const rows = await prisma.transcript.findMany({
      where: {
        workspaceId,
        ...(projectId ? { projectId } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
        AND: afterCursor(cursorOf(req)),
      },
      select: MEETING_SELECT,
      orderBy: NEWEST_FIRST,
      take: limit + 1,
    });
    res.json(page(rows, limit, toApiMeeting));
  }),
);

publicApiRouter.get(
  "/meetings/:id",
  route(async (req, res, { userId, workspaceId }) => {
    const meeting = await prisma.transcript.findFirst({
      where: { id: req.params.id, workspaceId },
      select: MEETING_DETAIL_SELECT,
    });
    if (!meeting) throw notFound("Meeting");
    void recordMeetingAccess({
      workspaceId,
      actor: { id: userId },
      transcriptId: meeting.id,
      kind: "viewed",
      channel: "api",
      title: meeting.title,
      request: req,
    });
    res.json(toApiMeetingDetail(meeting, hiddenFromCaller()?.projectIds ?? []));
  }),
);

// ── Tasks ───────────────────────────────────────────────────────────────────

const TASK_STATUSES = Object.values(TaskStatus);
const TASK_PRIORITIES = Object.values(TaskPriority);
const TASK_TYPES = Object.values(TaskType);

publicApiRouter.get(
  "/tasks",
  route(async (req, res, { workspaceId }) => {
    const limit = limitOf(req);
    const projectId = queryString(req, "projectId");
    const status = enumOf(req, "status", TASK_STATUSES);
    const assignee = queryString(req, "assignee");
    const updatedSince = dateOf(req, "updatedSince");
    const where: Prisma.TaskWhereInput = {
      project: { workspaceId },
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(assignee ? { assignee: { email: { equals: assignee, mode: "insensitive" } } } : {}),
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      AND: afterCursor(cursorOf(req)),
    };
    const rows = await prisma.task.findMany({
      where,
      select: TASK_SELECT,
      orderBy: NEWEST_FIRST,
      take: limit + 1,
    });
    res.json(page(rows, limit, toApiTask));
  }),
);

async function readTask(workspaceId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { workspaceId } },
    select: TASK_DETAIL_SELECT,
  });
  if (!task) throw notFound("Task");
  return toApiTaskDetail(task);
}

publicApiRouter.get(
  "/tasks/:id",
  route(async (req, res, { workspaceId }) => {
    res.json(await readTask(workspaceId, req.params.id));
  }),
);

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "must be an ISO 8601 date");

const taskFields = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).nullable(),
  acceptanceCriteria: z.string().max(20_000).nullable(),
  status: z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]),
  priority: z.enum(TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  type: z.enum(TASK_TYPES as [TaskType, ...TaskType[]]),
  dueDate: isoDate.nullable(),
  assigneeEmail: z.string().email().nullable(),
};

const createTaskBody = z
  .object({
    projectId: z.string().min(1),
    title: taskFields.title,
    description: taskFields.description.optional(),
    acceptanceCriteria: taskFields.acceptanceCriteria.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    type: taskFields.type.optional(),
    dueDate: taskFields.dueDate.optional(),
    assigneeEmail: taskFields.assigneeEmail.optional(),
  })
  .strict();

const updateTaskBody = z
  .object({
    title: taskFields.title.optional(),
    description: taskFields.description.optional(),
    acceptanceCriteria: taskFields.acceptanceCriteria.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    type: taskFields.type.optional(),
    dueDate: taskFields.dueDate.optional(),
    assigneeEmail: taskFields.assigneeEmail.optional(),
  })
  .strict();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join(".");
  throw invalid(field ? `"${field}": ${issue.message}` : (issue?.message ?? "Invalid body."));
}

const dueDateOf = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/** The member with this email, undefined to leave the assignee alone, null to clear it. */
async function assigneeIdOf(
  workspaceId: string,
  email: string | null | undefined,
): Promise<string | null | undefined> {
  if (email === undefined || email === null) return email;
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, user: { email: { equals: email, mode: "insensitive" } } },
    select: { userId: true },
  });
  if (!member) throw invalid("The assignee is not a member of this workspace.");
  return member.userId;
}

publicApiRouter.post(
  "/tasks",
  route(async (req, res, { workspaceId }) => {
    const body = parseBody(createTaskBody, req.body);
    const created = await taskCrudService.createTaskForWorkspace(workspaceId, {
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status,
      priority: body.priority,
      type: body.type,
      dueDate: dueDateOf(body.dueDate),
      assigneeId: await assigneeIdOf(workspaceId, body.assigneeEmail),
    });
    res.status(201).json(await readTask(workspaceId, created.id));
  }),
);

publicApiRouter.patch(
  "/tasks/:id",
  route(async (req, res, { workspaceId }) => {
    const body = parseBody(updateTaskBody, req.body);
    if (Object.keys(body).length === 0) throw invalid("The body has no field to change.");
    await taskCrudService.updateTaskForWorkspace(workspaceId, req.params.id, {
      title: body.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status,
      priority: body.priority,
      type: body.type,
      dueDate: dueDateOf(body.dueDate),
      assigneeId: await assigneeIdOf(workspaceId, body.assigneeEmail),
    });
    res.json(await readTask(workspaceId, req.params.id));
  }),
);

// Unknown path under /api/v1: answer in the API's own error shape.
publicApiRouter.use((req: Request, res: Response) => {
  sendError(res, 404, "not_found", `No such endpoint: ${req.method} ${req.path}`);
});

export { publicApiRouter };
