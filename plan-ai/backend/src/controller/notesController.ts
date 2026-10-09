import { countFeature } from "../services/featureUsageService";
import { Body, Delete, Get, Patch, Path, Post, Query, Request, Route, Security, Tags } from "tsoa";
import type { Note } from "@prisma/client";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  createNote,
  getNote,
  getOrCreatePeriodNote,
  listNotes,
  purgeNote,
  restoreNote,
  trashNote,
  updateNote,
  type NoteActor,
  type NoteError,
  type NoteScope,
} from "../services/noteService";

export type NoteVisibilityValue = "PRIVATE" | "WORKSPACE";
export type NotePeriodValue = "DAY" | "WEEK";
export type NoteSourceValue = "WEB" | "MOBILE" | "RECORDER" | "ASSISTANT";

export interface NoteResponse {
  id: string;
  workspaceId: string;
  /** The author. */
  userId: string;
  /** True when the signed-in user wrote it (and so can edit it). */
  isMine: boolean;
  title: string | null;
  /** Markdown. */
  body: string;
  visibility: NoteVisibilityValue;
  pinned: boolean;
  projectId: string | null;
  transcriptId: string | null;
  periodType: NotePeriodValue | null;
  /** YYYY-MM-DD, the author's local day (the Monday for a weekly note). */
  periodStart: string | null;
  source: NoteSourceValue;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  notes: NoteResponse[];
  nextCursor: string | null;
}

export interface CreateNoteRequest {
  /** Optional id made by the app (16 to 64 of A-Z a-z 0-9 _ -), so a retried create is not duplicated. */
  id?: string;
  title?: string | null;
  body?: string;
  projectId?: string | null;
  transcriptId?: string | null;
  visibility?: NoteVisibilityValue;
  pinned?: boolean;
  source?: NoteSourceValue;
}

export interface UpdateNoteRequest {
  title?: string | null;
  body?: string;
  projectId?: string | null;
  transcriptId?: string | null;
  visibility?: NoteVisibilityValue;
  pinned?: boolean;
  /** The version the app edited. When the server has a newer one the answer is 409 with the current note. */
  baseVersion?: number;
}

const toResponse = (note: Note, userId: string): NoteResponse => ({
  id: note.id,
  workspaceId: note.workspaceId,
  userId: note.userId,
  isMine: note.userId === userId,
  title: note.title,
  body: note.body,
  visibility: note.visibility,
  pinned: note.pinned,
  projectId: note.projectId,
  transcriptId: note.transcriptId,
  periodType: note.periodType,
  periodStart: note.periodStart ? note.periodStart.toISOString().slice(0, 10) : null,
  source: note.source,
  version: note.version,
  deletedAt: note.deletedAt ? note.deletedAt.toISOString() : null,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});

const SCOPES: NoteScope[] = ["all", "inbox", "pinned", "mine", "shared", "trash"];

@Route("api/notes")
@Tags("Notes")
@Security("ClientLevel")
export class NotesController extends BaseWorkspaceController {
  private async actor(request: AuthenticatedRequest): Promise<NoteActor> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    return { userId: user.id, email: user.email, workspaceId, role, request };
  }

  /** Runs a service call and turns its errors into HTTP answers. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const noteError = err as NoteError;
      if (typeof noteError?.status === "number") {
        this.setStatus(noteError.status);
        throw {
          status: noteError.status,
          message: noteError.message,
          ...(noteError.code ? { code: noteError.code } : {}),
        };
      }
      throw err;
    }
  }

  /**
   * Notes the user can read, pinned first, newest first. `scope`: all, inbox
   * (own notes not filed anywhere), pinned, mine, shared, trash (own only).
   */
  @Get("/")
  public async listNotes(
    @Request() request: AuthenticatedRequest,
    @Query() scope?: string,
    @Query() projectId?: string,
    @Query() transcriptId?: string,
    @Query() q?: string,
    @Query() limit?: number,
    @Query() cursor?: string,
  ): Promise<NoteListResponse> {
    const actor = await this.actor(request);
    if (scope !== undefined && !SCOPES.includes(scope as NoteScope)) {
      this.setStatus(400);
      throw { status: 400, message: `scope must be one of ${SCOPES.join(", ")}` };
    }
    const page = await listNotes(actor, {
      scope: scope as NoteScope | undefined,
      projectId,
      transcriptId,
      q,
      limit,
      cursor,
    });
    return {
      notes: page.notes.map((n) => toResponse(n, actor.userId)),
      nextCursor: page.nextCursor,
    };
  }

  /** The user's daily (or weekly) note for a local date, YYYY-MM-DD. Created empty the first time. */
  @Get("/period/{period}/{date}")
  public async getPeriodNote(
    @Request() request: AuthenticatedRequest,
    @Path() period: NotePeriodValue,
    @Path() date: string,
  ): Promise<NoteResponse> {
    const actor = await this.actor(request);
    if (period !== "DAY" && period !== "WEEK") {
      this.setStatus(400);
      throw { status: 400, message: "period must be DAY or WEEK" };
    }
    return this.run(async () =>
      toResponse(await getOrCreatePeriodNote(actor, period, date), actor.userId),
    );
  }

  @Get("{id}")
  public async getNote(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<NoteResponse> {
    const actor = await this.actor(request);
    return this.run(async () => toResponse(await getNote(actor, id), actor.userId));
  }

  /** Creates a note. Sending the same id again returns the note created the first time. */
  @Post("/")
  public async createNote(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateNoteRequest,
  ): Promise<NoteResponse> {
    const actor = await this.actor(request);
    countFeature("note.created");
    return this.run(async () => toResponse(await createNote(actor, body ?? {}), actor.userId));
  }

  @Patch("{id}")
  public async updateNote(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: UpdateNoteRequest,
  ): Promise<NoteResponse> {
    const actor = await this.actor(request);
    try {
      return toResponse(await updateNote(actor, id, body ?? {}), actor.userId);
    } catch (err) {
      const noteError = err as NoteError;
      if (noteError?.code === "note_version_conflict") {
        this.setStatus(409);
        // The app keeps its text as a conflicted copy and shows the server's.
        throw {
          status: 409,
          code: noteError.code,
          message: noteError.message,
          current: noteError.current ? toResponse(noteError.current, actor.userId) : null,
        };
      }
      return this.run(() => Promise.reject(err));
    }
  }

  /** Moves the note to the trash (kept 30 days). */
  @Delete("{id}")
  public async trashNote(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<{ success: boolean }> {
    const actor = await this.actor(request);
    await this.run(() => trashNote(actor, id));
    return { success: true };
  }

  @Post("{id}/restore")
  public async restoreNote(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<NoteResponse> {
    const actor = await this.actor(request);
    return this.run(async () => toResponse(await restoreNote(actor, id), actor.userId));
  }

  /** Deletes a note in the trash for good. */
  @Delete("{id}/permanent")
  public async purgeNote(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<{ success: boolean }> {
    const actor = await this.actor(request);
    await this.run(() => purgeNote(actor, id));
    return { success: true };
  }
}
