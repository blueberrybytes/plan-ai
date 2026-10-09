import { countFeature } from "../services/featureUsageService";
import { Body, Delete, Get, Patch, Path, Post, Query, Request, Route, Security, Tags } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
  type CommentActor,
  type CommentError,
  type CommentView,
} from "../services/commentService";

export interface CommentAuthorResponse {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface CommentMentionResponse {
  userId: string;
  name: string;
}

export interface CommentResponse {
  id: string;
  taskId: string | null;
  transcriptId: string | null;
  /** Text with mentions written as `@[Name](user:ID)`. Empty when deleted. */
  body: string;
  /** True when the comment was removed. It stays so the thread keeps its shape. */
  deleted: boolean;
  /** Seconds into the meeting this comment is about. */
  atSeconds: number | null;
  author: CommentAuthorResponse;
  /** The members mentioned in the body. */
  mentions: CommentMentionResponse[];
  /** The text was changed after it was posted. */
  edited: boolean;
  /** The signed-in user wrote it and may change the text. */
  canEdit: boolean;
  /** The signed-in user wrote it, or is an owner or admin of the workspace. */
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentListResponse {
  comments: CommentResponse[];
}

export interface CreateCommentRequest {
  /** The task the comment is on. Send this or `transcriptId`, not both. */
  taskId?: string | null;
  /** The meeting the comment is on. */
  transcriptId?: string | null;
  /** 1 to 5000 characters. A mention is written `@[Name](user:ID)`. */
  body: string;
  /** Seconds into the meeting. Only with `transcriptId`. */
  atSeconds?: number | null;
}

export interface UpdateCommentRequest {
  body: string;
}

const toResponse = (view: CommentView): CommentResponse => ({ ...view });

@Route("api/comments")
@Tags("Comments")
@Security("ClientLevel")
export class CommentController extends BaseWorkspaceController {
  private async actor(request: AuthenticatedRequest): Promise<CommentActor> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    return { userId: user.id, email: user.email, workspaceId, role, request };
  }

  /** Runs a service call and turns its errors into HTTP answers. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const commentError = err as CommentError;
      if (typeof commentError?.status === "number") {
        this.setStatus(commentError.status);
        throw { status: commentError.status, message: commentError.message };
      }
      throw err;
    }
  }

  /** The thread of one task or one meeting, oldest first. */
  @Get("/")
  public async listComments(
    @Request() request: AuthenticatedRequest,
    @Query() taskId?: string,
    @Query() transcriptId?: string,
  ): Promise<CommentListResponse> {
    const actor = await this.actor(request);
    return this.run(async () => ({
      comments: (await listComments(actor, { taskId, transcriptId })).map(toResponse),
    }));
  }

  /** Posts a comment. The people mentioned in it get an email. */
  @Post("/")
  public async createComment(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateCommentRequest,
  ): Promise<CommentResponse> {
    const actor = await this.actor(request);
    countFeature("comment.created");
    return this.run(async () =>
      toResponse(
        await createComment(actor, {
          taskId: body?.taskId,
          transcriptId: body?.transcriptId,
          body: body?.body,
          atSeconds: body?.atSeconds,
        }),
      ),
    );
  }

  /** Changes the text. Only the author. */
  @Patch("{id}")
  public async updateComment(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: UpdateCommentRequest,
  ): Promise<CommentResponse> {
    const actor = await this.actor(request);
    return this.run(async () => toResponse(await updateComment(actor, id, { body: body?.body })));
  }

  /** Removes a comment: its author, or an owner or admin of the workspace. */
  @Delete("{id}")
  public async deleteComment(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<{ success: boolean }> {
    const actor = await this.actor(request);
    await this.run(() => deleteComment(actor, id));
    return { success: true };
  }
}
