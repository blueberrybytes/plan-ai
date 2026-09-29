import {
  Prisma,
  type Note,
  type NotePeriod,
  type NoteSource,
  type WorkspaceRole,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { recordAudit, type AuditRequestInfo } from "./auditLogService";

/**
 * Notes a member writes down. The rules, in one place:
 * - a PRIVATE note is seen by its author only, owners and admins included;
 * - a WORKSPACE note is seen by every member of its workspace;
 * - only the author edits a note, shares it or moves it to the trash;
 * - an owner or admin may also delete a shared note;
 * - the trash keeps a note 30 days, then it is gone.
 */

export const MAX_NOTE_BODY_CHARS = 100_000;
export const MAX_NOTE_TITLE_CHARS = 200;
export const NOTE_TRASH_DAYS = 30;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface NoteActor {
  userId: string;
  email?: string | null;
  workspaceId: string;
  role: WorkspaceRole;
  request?: AuditRequestInfo;
}

export interface NoteError {
  status: number;
  message: string;
  code?: string;
  /** The server's copy, sent back on a version conflict. */
  current?: Note;
}

const fail = (status: number, message: string, extra: Partial<NoteError> = {}): NoteError => ({
  status,
  message,
  ...extra,
});

export const canReadNote = (note: Pick<Note, "userId" | "visibility">, userId: string) =>
  note.userId === userId || note.visibility === "WORKSPACE";

export const canEditNote = (note: Pick<Note, "userId">, userId: string) => note.userId === userId;

export const canDeleteNote = (
  note: Pick<Note, "userId" | "visibility">,
  userId: string,
  role: WorkspaceRole,
) =>
  note.userId === userId ||
  (note.visibility === "WORKSPACE" && (role === "OWNER" || role === "ADMIN"));

/** Notes this user may read in the workspace, trash excluded. */
const readableWhere = (workspaceId: string, userId: string): Prisma.NoteWhereInput => ({
  workspaceId,
  deletedAt: null,
  OR: [{ userId }, { visibility: "WORKSPACE" }],
});

const cleanTitle = (title: string | null | undefined): string | null | undefined => {
  if (title === undefined || title === null) return title;
  const trimmed = title.trim();
  if (trimmed.length > MAX_NOTE_TITLE_CHARS) {
    throw fail(400, `The title can have at most ${MAX_NOTE_TITLE_CHARS} characters.`);
  }
  return trimmed || null;
};

const checkBody = (body: string | undefined): void => {
  if (body !== undefined && body.length > MAX_NOTE_BODY_CHARS) {
    throw fail(400, `A note can have at most ${MAX_NOTE_BODY_CHARS} characters.`);
  }
};

/** Project and meeting links must point inside the workspace. */
const checkLinks = async (
  workspaceId: string,
  links: { projectId?: string | null; transcriptId?: string | null },
): Promise<void> => {
  if (links.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: links.projectId, workspaceId },
      select: { id: true },
    });
    if (!project) throw fail(400, "Project not found in this workspace.");
  }
  if (links.transcriptId) {
    const transcript = await prisma.transcript.findFirst({
      where: { id: links.transcriptId, workspaceId },
      select: { id: true },
    });
    if (!transcript) throw fail(400, "Meeting not found in this workspace.");
  }
};

const auditVisibility = async (actor: NoteActor, note: Note, visibility: string) =>
  recordAudit({
    workspaceId: actor.workspaceId,
    actor: { id: actor.userId, email: actor.email },
    action: visibility === "WORKSPACE" ? "note.shared" : "note.unshared",
    targetType: "note",
    targetId: note.id,
    metadata: { title: note.title ?? null },
    request: actor.request,
  });

export type NoteScope = "all" | "inbox" | "pinned" | "mine" | "shared" | "trash";

export interface ListNotesOptions {
  scope?: NoteScope;
  projectId?: string;
  transcriptId?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

export async function listNotes(
  actor: NoteActor,
  options: ListNotesOptions = {},
): Promise<{ notes: Note[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const scope = options.scope ?? "all";
  const q = options.q?.trim();

  // The trash only ever shows the user's own notes.
  const base: Prisma.NoteWhereInput =
    scope === "trash"
      ? { workspaceId: actor.workspaceId, userId: actor.userId, deletedAt: { not: null } }
      : readableWhere(actor.workspaceId, actor.userId);

  const where: Prisma.NoteWhereInput = {
    AND: [
      base,
      scope === "inbox"
        ? {
            userId: actor.userId,
            projectId: null,
            transcriptId: null,
            periodType: null,
            pinned: false,
          }
        : {},
      scope === "pinned" ? { pinned: true } : {},
      scope === "mine" ? { userId: actor.userId } : {},
      scope === "shared" ? { visibility: "WORKSPACE" } : {},
      options.projectId ? { projectId: options.projectId } : {},
      options.transcriptId ? { transcriptId: options.transcriptId } : {},
      q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const rows = await prisma.note.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const notes = hasMore ? rows.slice(0, limit) : rows;
  return { notes, nextCursor: hasMore ? notes[notes.length - 1].id : null };
}

/** A note this user may read. 404 otherwise, so ids of private notes are not confirmed. */
export async function getNote(actor: NoteActor, id: string): Promise<Note> {
  const note = await prisma.note.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!note) throw fail(404, "Note not found");
  const ownTrash = note.deletedAt && note.userId === actor.userId;
  if ((!note.deletedAt || ownTrash) && canReadNote(note, actor.userId)) return note;
  throw fail(404, "Note not found");
}

export interface CreateNoteInput {
  id?: string;
  title?: string | null;
  body?: string;
  projectId?: string | null;
  transcriptId?: string | null;
  visibility?: "PRIVATE" | "WORKSPACE";
  pinned?: boolean;
  source?: NoteSource;
}

/**
 * Creates a note. With a client id it is idempotent: sending the same create
 * twice (a retry from a phone that lost the answer) returns the first note.
 */
export async function createNote(actor: NoteActor, input: CreateNoteInput): Promise<Note> {
  if (input.id !== undefined && !CLIENT_ID_PATTERN.test(input.id)) {
    throw fail(400, "Invalid note id.");
  }
  checkBody(input.body);
  const title = cleanTitle(input.title);
  await checkLinks(actor.workspaceId, input);

  if (input.id) {
    const existing = await prisma.note.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.userId === actor.userId && existing.workspaceId === actor.workspaceId) {
        return existing;
      }
      throw fail(409, "A note with this id already exists.");
    }
  }

  const note = await prisma.note.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      title: title ?? null,
      body: input.body ?? "",
      projectId: input.projectId ?? null,
      transcriptId: input.transcriptId ?? null,
      visibility: input.visibility ?? "PRIVATE",
      pinned: input.pinned ?? false,
      source: input.source ?? "WEB",
    },
  });
  if (note.visibility === "WORKSPACE") await auditVisibility(actor, note, "WORKSPACE");
  return note;
}

export interface UpdateNoteInput {
  title?: string | null;
  body?: string;
  projectId?: string | null;
  transcriptId?: string | null;
  visibility?: "PRIVATE" | "WORKSPACE";
  pinned?: boolean;
  /** The version the client edited. A newer one on the server means a conflict. */
  baseVersion?: number;
}

export async function updateNote(
  actor: NoteActor,
  id: string,
  input: UpdateNoteInput,
): Promise<Note> {
  const note = await getNote(actor, id);
  if (!canEditNote(note, actor.userId)) throw fail(403, "Only the author can edit this note.");
  if (note.deletedAt) throw fail(409, "Restore the note from the trash before editing it.");
  checkBody(input.body);
  const title = cleanTitle(input.title);
  await checkLinks(actor.workspaceId, input);

  const data: Prisma.NoteUncheckedUpdateManyInput = {
    ...(title !== undefined ? { title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.transcriptId !== undefined ? { transcriptId: input.transcriptId } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    version: { increment: 1 },
  };

  // The version check and the write in one statement: two devices saving at
  // the same moment cannot both win.
  const expected = input.baseVersion ?? note.version;
  const { count } = await prisma.note.updateMany({
    where: { id, version: expected, deletedAt: null },
    data,
  });
  if (count === 0) {
    const current = await prisma.note.findUnique({ where: { id } });
    throw fail(409, "This note changed on another device.", {
      code: "note_version_conflict",
      current: current ?? undefined,
    });
  }

  const updated = await prisma.note.findUniqueOrThrow({ where: { id } });
  if (input.visibility !== undefined && input.visibility !== note.visibility) {
    await auditVisibility(actor, updated, input.visibility);
  }
  return updated;
}

/** Moves a note to the trash. */
export async function trashNote(actor: NoteActor, id: string): Promise<void> {
  const note = await getNote(actor, id);
  if (note.deletedAt) return;
  if (!canDeleteNote(note, actor.userId, actor.role)) {
    throw fail(403, "Only the author or a workspace admin can delete this note.");
  }
  await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
  if (note.visibility === "WORKSPACE") {
    await recordAudit({
      workspaceId: actor.workspaceId,
      actor: { id: actor.userId, email: actor.email },
      action: "note.deleted",
      targetType: "note",
      targetId: id,
      metadata: { title: note.title ?? null, author: note.userId },
      request: actor.request,
    });
  }
}

export async function restoreNote(actor: NoteActor, id: string): Promise<Note> {
  const note = await getNote(actor, id);
  if (!canEditNote(note, actor.userId)) throw fail(403, "Only the author can restore this note.");
  if (!note.deletedAt) return note;
  return prisma.note.update({
    where: { id },
    data: { deletedAt: null, version: { increment: 1 } },
  });
}

/** Deletes a note in the author's trash for good. */
export async function purgeNote(actor: NoteActor, id: string): Promise<void> {
  const note = await getNote(actor, id);
  if (!canEditNote(note, actor.userId)) throw fail(403, "Only the author can delete this note.");
  if (!note.deletedAt) throw fail(409, "Move the note to the trash first.");
  await prisma.note.delete({ where: { id } });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The author's note for one day (or the week starting that Monday), created
 * empty the first time. `date` is the author's local calendar day.
 */
export async function getOrCreatePeriodNote(
  actor: NoteActor,
  period: NotePeriod,
  date: string,
): Promise<Note> {
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw fail(400, "Use a date like 2026-09-29.");
  }
  let start = new Date(`${date}T00:00:00Z`);
  if (period === "WEEK") {
    const weekday = (start.getUTCDay() + 6) % 7; // Monday = 0
    start = new Date(start.getTime() - weekday * 86_400_000);
  }
  const key = {
    workspaceId_userId_periodType_periodStart: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      periodType: period,
      periodStart: start,
    },
  };
  try {
    return await prisma.note.upsert({
      where: key,
      update: {},
      create: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        periodType: period,
        periodStart: start,
      },
    });
  } catch (err) {
    // Two first opens at the same time: the other request created it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.note.findUniqueOrThrow({ where: key });
    }
    throw err;
  }
}

/** Empties trash older than NOTE_TRASH_DAYS. Run by the daily cleanup job. */
export async function purgeOldTrash(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - NOTE_TRASH_DAYS * 86_400_000);
  const { count } = await prisma.note.deleteMany({ where: { deletedAt: { lt: before } } });
  return count;
}
