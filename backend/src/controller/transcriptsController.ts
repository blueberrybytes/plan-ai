import {
  Route,
  Tags,
  Security,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Path,
  Query,
  Request,
  Controller,
} from "tsoa";
import { Prisma, Transcript, TranscriptSource } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import {
  transcriptCrudService,
  type TranscriptListOptions,
  type CreateTranscriptInput,
  type UpdateTranscriptInput,
} from "../services/transcriptCrudService";

interface StandaloneTranscriptResponse {
  id: string;
  projectId: string | null;
  userId: string;
  title: string | null;
  source: TranscriptSource;
  language: string | null;
  summary: string | null;
  transcript: string | null;
  recordedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StandaloneTranscriptListResponse {
  transcripts: StandaloneTranscriptResponse[];
  total: number;
}

@Route("api/transcripts")
@Tags("Transcripts")
export class TranscriptsController extends Controller {
  private async getAuthorizedUser(request: AuthenticatedRequest) {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user!.uid },
    });
    if (!user) {
      throw { status: 401, message: "User not found" };
    }
    return user;
  }

  private mapTranscriptResponse(t: Transcript): StandaloneTranscriptResponse {
    return {
      id: t.id,
      projectId: t.projectId,
      userId: t.userId,
      title: t.title,
      source: t.source,
      language: t.language,
      summary: t.summary,
      transcript: t.transcript,
      recordedAt: t.recordedAt,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  @Get()
  @Security("ClientLevel")
  public async listTranscripts(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() pageSize = 20,
    @Query() source?: TranscriptSource,
  ): Promise<ApiResponse<StandaloneTranscriptListResponse>> {
    const user = await this.getAuthorizedUser(request);
    const options: TranscriptListOptions = { page, pageSize, source };

    console.log(
      `[DEBUG] GET /api/transcripts - fetching for user ${user.id} (email: ${user.email})`,
      options,
    );

    const result = await transcriptCrudService.listTranscriptsForUser(user.id, options);

    console.log(
      `[DEBUG] GET /api/transcripts - Found ${result.transcripts.length} items (Total: ${result.total})`,
    );

    return {
      status: 200,
      data: {
        transcripts: result.transcripts.map(this.mapTranscriptResponse),
        total: result.total,
      },
    };
  }

  @Post()
  @Security("ClientLevel")
  public async createTranscript(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateTranscriptInput,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);

    const transcript = await transcriptCrudService.createTranscriptForUser(user.id, body);

    return {
      status: 201,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Get("{id}")
  @Security("ClientLevel")
  public async getTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);

    const transcript = await transcriptCrudService.getTranscriptForUser(user.id, id);

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Put("{id}")
  @Security("ClientLevel")
  public async updateTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: UpdateTranscriptInput,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);

    const transcript = await transcriptCrudService.updateTranscriptForUser(user.id, id, body);

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Delete("{id}")
  @Security("ClientLevel")
  public async deleteTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const user = await this.getAuthorizedUser(request);

    await transcriptCrudService.deleteTranscriptForUser(user.id, id);

    return {
      status: 200,
      data: { success: true },
    };
  }
}
