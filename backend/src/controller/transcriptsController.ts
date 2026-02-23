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
  type UpdateTranscriptInput,
} from "../services/transcriptCrudService";
import { projectTranscriptService } from "../services/projectTranscriptService";

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

interface CreateStandaloneTranscriptBody {
  projectId?: string | null;
  title?: string | null;
  source?: TranscriptSource;
  content?: string | null;
  language?: string | null;
  summary?: string | null;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string | null;
  englishLevel?: string;
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

  private async buildContextPrompt(userId: string, contextIds: string[]): Promise<string | null> {
    if (!contextIds || contextIds.length === 0) {
      return null;
    }

    const sanitizedIds = Array.from(
      new Set(contextIds.map((id) => id.trim()).filter((id): id is string => id.length > 0)),
    );

    if (sanitizedIds.length === 0) {
      return null;
    }

    const contexts = await prisma.context.findMany({
      where: {
        id: {
          in: sanitizedIds,
        },
        userId,
      },
      include: {
        files: {
          select: {
            id: true,
            fileName: true,
          },
        },
      },
    });

    if (contexts.length !== sanitizedIds.length) {
      this.setStatus(404);
      throw { status: 404, message: "One or more contexts were not found" };
    }

    const sections = contexts.map((context) => {
      const details: string[] = [];

      if (context.description) {
        details.push(`Description: ${context.description}`);
      }

      const fileNames = context.files
        .map((file) => file.fileName)
        .filter((name): name is string => Boolean(name));

      if (fileNames.length > 0) {
        const limited = fileNames.slice(0, 5).join(", ");
        details.push(`Files: ${limited}`);
      }

      const detailsText = details.length > 0 ? ` - ${details.join(" | ")}` : "";
      return `• ${context.name}${detailsText}`;
    });

    return `Use the following context when analyzing the transcript:\n${sections.join("\n")}`;
  }

  @Post()
  @Security("ClientLevel")
  public async createTranscript(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateStandaloneTranscriptBody,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);

    let transcript: Transcript;

    if (body.content) {
      const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);
      const result = await projectTranscriptService.createStandaloneTranscript({
        userId: user.id,
        content: body.content,
        title: body.title ?? undefined,
        source: body.source,
        recordedAt: body.recordedAt ?? null,
        metadata: body.metadata,
        contextPrompt,
        contextIds: body.contextIds,
        persona: body.persona,
        objective: body.objective,
        englishLevel: body.englishLevel,
      });
      transcript = result.transcript;
    } else {
      transcript = await transcriptCrudService.createTranscriptForUser(user.id, body);
    }

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
