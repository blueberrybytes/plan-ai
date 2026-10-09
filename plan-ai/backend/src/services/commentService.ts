import type { WorkspaceRole } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { recordAudit, type AuditRequestInfo } from "./auditLogService";
import { emailConfigured, sendCommentMentionEmail } from "./emailService";
import { hiddenFromMember } from "./projectAccess";

/**
 * Comments on a task or on a meeting.
 *
 * Every read and write goes through the filtered Prisma client, so a comment
 * on a task or meeting of a restricted project does not exist for a caller
 * who cannot see that project. Before a comment is created the task or the
 * meeting itself is loaded the same way: not found means 404.
 *
 * A mention travels inside the body as `@[Display Name](user:USER_ID)`. The
 * server reads the ids from the body, never from a list sent by the client,
 * and keeps only the members who can see the thing being discussed.
 */

export const COMMENT_MAX_LENGTH = 5000;
const THREAD_LIMIT = 500;

export interface CommentActor {
  userId: string;
  email?: string | null;
  workspaceId: string;
  role: WorkspaceRole;
  request?: AuditRequestInfo;
}

export interface CommentError {
  status: number;
  message: string;
}
const fail = (status: number, message: string): CommentError => ({ status, message });

export interface CommentTarget {
  taskId?: string | null;
  transcriptId?: string | null;
}

export interface CommentAuthor {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface CommentMention {
  userId: string;
  name: string;
}

export interface CommentView {
  id: string;
  taskId: string | null;
  transcriptId: string | null;
  /** Text with mentions as `@[Name](user:ID)`. Empty when deleted. */
  body: string;
  /** True when the comment was removed. It stays so the thread keeps its shape. */
  deleted: boolean;
  /** Seconds into the meeting this comment is about. */
  atSeconds: number | null;
  author: CommentAuthor;
  mentions: CommentMention[];
  /** The text was changed after it was posted. */
  edited: boolean;
  /** The caller wrote it and may change the text. */
  canEdit: boolean;
  /** The caller wrote it, or is an owner or admin of the workspace. */
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Mentions ────────────────────────────────────────────────────────────────

// The name cannot hold brackets or line breaks, the id is a cuid or similar.
const MENTION_PATTERN = /@\[([^[\]\r\n]{1,120})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

/** The user ids mentioned in a body, in order, each one once. */
export function parseMentionIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
}

/**
 * Rewrites the mentions of a body. An allowed mention gets the member's real
 * name, so the client cannot show one person under another's name. A mention
 * that is not allowed becomes plain text.
 */
export function rewriteMentions(body: string, allowed: Map<string, string>): string {
  return body.replace(MENTION_PATTERN, (_all, shown: string, id: string) => {
    const name = allowed.get(id);
    return name ? `@[${name}](user:${id})` : `@${shown}`;
  });
}

/** The body as plain text: `@Name` instead of the stored mention. */
export function plainCommentBody(body: string): string {
  return body.replace(MENTION_PATTERN, (_all, shown: string) => `@${shown}`);
}

const displayName = (user: { name: string | null; email: string }): string =>
  // Brackets would break the stored mention format.
  (user.name?.trim() || user.email.split("@")[0]).replace(/[[\]\r\n]/g, "").slice(0, 120) ||
  "member";

// ── The task or meeting a comment hangs from ────────────────────────────────

interface LoadedTarget {
  kind: "task" | "meeting";
  id: string;
  title: string;
  projectId: string | null;
  contextIds: string[];
  durationSeconds: number | null;
}

function oneTarget(target: CommentTarget): { taskId?: string; transcriptId?: string } {
  const taskId = target.taskId?.trim() || undefined;
  const transcriptId = target.transcriptId?.trim() || undefined;
  if ((taskId ? 1 : 0) + (transcriptId ? 1 : 0) !== 1) {
    throw fail(400, "A comment belongs to one task or to one meeting.");
  }
  return { taskId, transcriptId };
}

/** Loads the task or meeting as the caller sees it. 404 when they cannot. */
async function loadTarget(workspaceId: string, target: CommentTarget): Promise<LoadedTarget> {
  const { taskId, transcriptId } = oneTarget(target);
  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, project: { workspaceId } },
      select: { id: true, title: true, projectId: true },
    });
    if (!task) throw fail(404, "Task not found");
    return {
      kind: "task",
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      contextIds: [],
      durationSeconds: null,
    };
  }
  const meeting = await prisma.transcript.findFirst({
    where: { id: transcriptId, workspaceId },
    select: { id: true, title: true, projectId: true, contextIds: true, durationSeconds: true },
  });
  if (!meeting) throw fail(404, "Meeting not found");
  return {
    kind: "meeting",
    id: meeting.id,
    title: meeting.title?.trim() || "Untitled meeting",
    projectId: meeting.projectId,
    contextIds: meeting.contextIds ?? [],
    durationSeconds: meeting.durationSeconds,
  };
}

interface MentionedMember {
  userId: string;
  name: string;
  email: string;
}

/**
 * The mentioned people who are members of the workspace and can see the task
 * or meeting. Someone outside a restricted project is not mentioned: the
 * email would tell them about something they must not know exists.
 */
async function allowedMentions(
  workspaceId: string,
  target: LoadedTarget,
  body: string,
): Promise<MentionedMember[]> {
  const ids = parseMentionIds(body);
  if (ids.length === 0) return [];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: ids } },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
  });
  const allowed: MentionedMember[] = [];
  for (const id of ids) {
    const member = members.find((m) => m.userId === id);
    if (!member) continue;
    const hidden = await hiddenFromMember(workspaceId, member.userId, member.role);
    const projectHidden = !!target.projectId && hidden.projectIds.includes(target.projectId);
    const contextHidden = target.contextIds.some((c) => hidden.contextIds.includes(c));
    if (projectHidden || contextHidden) continue;
    allowed.push({ userId: id, name: displayName(member.user), email: member.user.email });
  }
  return allowed;
}

function cleanBody(raw: unknown): string {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (body.length === 0) throw fail(400, "A comment cannot be empty.");
  if (body.length > COMMENT_MAX_LENGTH) {
    throw fail(400, `A comment can have ${COMMENT_MAX_LENGTH} characters at most.`);
  }
  return body;
}

// ── Reading ─────────────────────────────────────────────────────────────────

const AUTHOR_SELECT = { id: true, name: true, email: true, avatarUrl: true } as const;

interface CommentRow {
  id: string;
  authorId: string;
  taskId: string | null;
  transcriptId: string | null;
  body: string;
  mentions: string[];
  atSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author: CommentAuthor;
}

const isAdmin = (role: WorkspaceRole): boolean => role === "OWNER" || role === "ADMIN";

function toView(row: CommentRow, actor: CommentActor, names: Map<string, string>): CommentView {
  const deleted = row.deletedAt !== null;
  const mine = row.authorId === actor.userId;
  return {
    id: row.id,
    taskId: row.taskId,
    transcriptId: row.transcriptId,
    body: deleted ? "" : row.body,
    deleted,
    atSeconds: deleted ? null : row.atSeconds,
    author: {
      id: row.author.id,
      name: row.author.name,
      email: row.author.email,
      avatarUrl: row.author.avatarUrl,
    },
    mentions: deleted
      ? []
      : row.mentions.flatMap((userId) => {
          const name = names.get(userId);
          return name ? [{ userId, name }] : [];
        }),
    // The two dates of a new row are set apart by a few milliseconds.
    edited: !deleted && row.updatedAt.getTime() - row.createdAt.getTime() > 1000,
    canEdit: !deleted && mine,
    canDelete: !deleted && (mine || isAdmin(actor.role)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, displayName(u)]));
}

/**
 * The thread of a task or a meeting, oldest first. With `newest`, only that
 * many of the most recent comments.
 */
export async function listComments(
  actor: CommentActor,
  target: CommentTarget,
  options: { newest?: number } = {},
): Promise<CommentView[]> {
  const loaded = await loadTarget(actor.workspaceId, target);
  const take = Math.min(Math.max(options.newest ?? THREAD_LIMIT, 1), THREAD_LIMIT);
  const rows = await prisma.comment.findMany({
    where: {
      workspaceId: actor.workspaceId,
      ...(loaded.kind === "task" ? { taskId: loaded.id } : { transcriptId: loaded.id }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { author: { select: AUTHOR_SELECT } },
  });
  rows.reverse();
  const names = await namesOf(rows.flatMap((r) => (r.deletedAt ? [] : r.mentions)));
  return rows.map((row) => toView(row, actor, names));
}

// ── Writing ─────────────────────────────────────────────────────────────────

export interface CreateCommentInput extends CommentTarget {
  body: string;
  atSeconds?: number | null;
}

const appUrl = (): string =>
  (process.env.FRONTEND_URL || process.env.APP_URL || "https://plan-ai.blueberrybytes.com").replace(
    /\/+$/,
    "",
  );

const linkTo = (target: LoadedTarget): string =>
  target.kind === "task"
    ? `${appUrl()}/projects/${target.projectId}?tab=board`
    : `${appUrl()}/recordings/${target.id}`;

/**
 * Emails each mentioned person once, never the author. Never throws: a mail
 * that fails is logged and the comment stays posted.
 */
export async function notifyMentions(input: {
  authorId: string;
  authorName: string;
  mentioned: MentionedMember[];
  target: { kind: "task" | "meeting"; title: string; url: string };
  body: string;
}): Promise<void> {
  if (!emailConfigured()) return;
  const sent = new Set<string>();
  for (const person of input.mentioned) {
    if (person.userId === input.authorId || sent.has(person.userId)) continue;
    sent.add(person.userId);
    try {
      await sendCommentMentionEmail(person.email, {
        authorName: input.authorName,
        targetKind: input.target.kind,
        targetTitle: input.target.title,
        text: plainCommentBody(input.body),
        url: input.target.url,
      });
    } catch (err) {
      logger.error("[Comments] Could not send a mention email", err);
    }
  }
}

export async function createComment(
  actor: CommentActor,
  input: CreateCommentInput,
): Promise<CommentView> {
  const target = await loadTarget(actor.workspaceId, input);
  const body = cleanBody(input.body);

  let atSeconds: number | null = null;
  if (input.atSeconds !== undefined && input.atSeconds !== null) {
    if (target.kind !== "meeting") {
      throw fail(400, "Only a comment on a meeting can point at a moment.");
    }
    const inRange =
      Number.isFinite(input.atSeconds) &&
      input.atSeconds >= 0 &&
      // The player can report a fraction past the stored whole seconds.
      (target.durationSeconds === null || input.atSeconds <= target.durationSeconds + 1);
    if (!inRange) throw fail(400, "That moment is outside the meeting.");
    atSeconds = input.atSeconds;
  }

  const mentioned = await allowedMentions(actor.workspaceId, target, body);
  const names = new Map(mentioned.map((m) => [m.userId, m.name]));
  const row = await prisma.comment.create({
    data: {
      workspaceId: actor.workspaceId,
      authorId: actor.userId,
      taskId: target.kind === "task" ? target.id : null,
      transcriptId: target.kind === "meeting" ? target.id : null,
      body: rewriteMentions(body, names),
      mentions: mentioned.map((m) => m.userId),
      atSeconds,
    },
    include: { author: { select: AUTHOR_SELECT } },
  });

  // Not awaited: the answer does not wait for the mail server.
  void notifyMentions({
    authorId: actor.userId,
    authorName: displayName(row.author),
    mentioned,
    target: { kind: target.kind, title: target.title, url: linkTo(target) },
    body: row.body,
  });

  return toView(row, actor, names);
}

/** A comment the caller can see, deleted ones left out. */
async function loadComment(actor: CommentActor, id: string) {
  const row = await prisma.comment.findFirst({
    where: { id, workspaceId: actor.workspaceId, deletedAt: null },
    include: { author: { select: AUTHOR_SELECT } },
  });
  if (!row) throw fail(404, "Comment not found");
  return row;
}

/** Changes the text. Only the author. Nobody is emailed about an edit. */
export async function updateComment(
  actor: CommentActor,
  id: string,
  input: { body: string },
): Promise<CommentView> {
  const existing = await loadComment(actor, id);
  if (existing.authorId !== actor.userId) {
    throw fail(403, "Only the author can edit a comment.");
  }
  const body = cleanBody(input.body);
  const target = await loadTarget(actor.workspaceId, existing);
  const mentioned = await allowedMentions(actor.workspaceId, target, body);
  const names = new Map(mentioned.map((m) => [m.userId, m.name]));
  const row = await prisma.comment.update({
    where: { id: existing.id },
    data: { body: rewriteMentions(body, names), mentions: mentioned.map((m) => m.userId) },
    include: { author: { select: AUTHOR_SELECT } },
  });
  return toView(row, actor, names);
}

/**
 * Removes a comment: its author, or an owner or admin of the workspace. The
 * row and its text stay in the database, the text is no longer returned.
 */
export async function deleteComment(actor: CommentActor, id: string): Promise<void> {
  const existing = await loadComment(actor, id);
  const mine = existing.authorId === actor.userId;
  if (!mine && !isAdmin(actor.role)) {
    throw fail(403, "Only the author, an owner or an admin can delete a comment.");
  }
  await prisma.comment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  if (!mine) {
    await recordAudit({
      workspaceId: actor.workspaceId,
      actor: { id: actor.userId, email: actor.email },
      action: "comment.deleted_by_admin",
      targetType: "comment",
      targetId: existing.id,
      metadata: {
        authorId: existing.authorId,
        ...(existing.taskId ? { taskId: existing.taskId } : {}),
        ...(existing.transcriptId ? { transcriptId: existing.transcriptId } : {}),
      },
      request: actor.request,
    });
  }
}
