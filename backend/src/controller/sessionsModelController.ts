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
  UploadedFiles,
  FormField,
  Controller,
} from "tsoa";
import {
  Prisma,
  SessionStatus,
  TranscriptSource,
  TaskPriority,
  TaskStatus,
  Task,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import {
  sessionTranscriptService,
  type TranscriptAnalysis,
} from "../services/sessionTranscriptService";
import { transcriptCrudService } from "../services/transcriptCrudService";
import { taskCrudService, type TaskWithRelations } from "../services/taskCrudService";
import type { Express } from "express";
import { extractTextFromUpload, isSupportedUploadMimeType } from "../utils/documentTextExtractor";

interface SessionResponse {
  id: string;
  title: string;
  description: string | null;
  status: SessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionListResponse {
  sessions: SessionResponse[];
  total: number;
}

interface CreateSessionRequest {
  title: string;
  description?: string;
  status?: SessionStatus;
  startedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

interface UpdateSessionRequest {
  title?: string;
  description?: string | null;
  status?: SessionStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

interface CreateTranscriptRequest {
  content: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextIds?: string[];
}

interface TranscriptResponse {
  id: string;
  sessionId: string;
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

interface TaskResponse {
  id: string;
  sessionId: string;
  title: string;
  description: string | null;
  summary: string | null;
  acceptanceCriteria: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface TranscriptTaskInsight {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
}

interface TranscriptAnalysisResponse {
  language: string;
  summary: string | null;
  tasks: TranscriptTaskInsight[];
}

interface CreateTranscriptResponse {
  transcript: TranscriptResponse;
  tasks: TaskResponse[];
  analysis: TranscriptAnalysisResponse;
}

interface TranscriptListResponse {
  transcripts: TranscriptResponse[];
  total: number;
}

interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
}

interface ManualTranscriptRequest {
  title?: string | null;
  source?: TranscriptSource;
  language?: string | null;
  summary?: string | null;
  content?: string | null;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

interface UpdateTranscriptRequest {
  title?: string | null;
  source?: TranscriptSource;
  language?: string | null;
  summary?: string | null;
  transcript?: string | null;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

interface CreateTaskRequest {
  title: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Format: date-time */
  dueDate?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  dependencyTaskIds?: string[];
}

interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Format: date-time */
  dueDate?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  dependencyTaskIds?: string[];
}

@Route("api/sessions")
@Tags("Sessions")
export class SessionsModelController extends Controller {
  @Get()
  @Security("ClientLevel")
  public async listSessions(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() pageSize = 20,
    @Query() status?: SessionStatus,
  ): Promise<ApiResponse<SessionListResponse>> {
    const user = await this.getAuthorizedUser(request);

    const currentPage = Math.max(page, 1);
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (currentPage - 1) * take;

    const whereClause = {
      userId: user.id,
      ...(status ? { status } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.session.count({ where: whereClause }),
    ]);

    return {
      status: 200,
      data: {
        sessions: sessions.map(this.mapSessionResponse),
        total,
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

  @Post("{sessionId}/transcripts/upload")
  @Security("ClientLevel")
  public async uploadTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @FormField() title?: string,
    @FormField() recordedAt?: string,
    @FormField() metadata?: string,
    @FormField() language?: string,
    @FormField() summary?: string,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    if (!files || files.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "No files uploaded" };
    }

    const supportedFiles = files.filter((file) => isSupportedUploadMimeType(file.mimetype));

    if (supportedFiles.length === 0) {
      this.setStatus(400);
      throw {
        status: 400,
        message: "No supported files uploaded. Only PDF and DOCX are allowed.",
      };
    }

    const combinedContent: string[] = [];

    for (const file of supportedFiles) {
      try {
        const text = await extractTextFromUpload(file);
        if (text) {
          combinedContent.push(text);
        }
      } catch (error) {
        logger.error("Error extracting text from file:", error);
        this.setStatus(422);
        throw {
          status: 422,
          message: `Failed to extract text from ${file.originalname}`,
        };
      }
    }

    if (combinedContent.length === 0) {
      this.setStatus(422);
      throw {
        status: 422,
        message: "No readable content detected in uploaded files.",
      };
    }

    const content = combinedContent.join("\n\n");

    let recordedAtDate: Date | null | undefined;
    if (typeof recordedAt === "string" && recordedAt.trim().length > 0) {
      const parsed = new Date(recordedAt);
      if (Number.isNaN(parsed.getTime())) {
        this.setStatus(400);
        throw {
          status: 400,
          message: "Invalid recordedAt value. Use a valid ISO date string.",
        };
      }
      recordedAtDate = parsed;
    }

    let metadataValue: Prisma.InputJsonValue | null | undefined = undefined;
    if (typeof metadata === "string" && metadata.trim().length > 0) {
      try {
        metadataValue = JSON.parse(metadata) as Prisma.InputJsonValue;
      } catch (error) {
        logger.error("Failed to parse transcript metadata payload", error);
        this.setStatus(400);
        throw { status: 400, message: "Metadata must be valid JSON." };
      }
    }

    const transcript = await transcriptCrudService.createTranscriptForUser(user.id, {
      sessionId,
      title: title ?? supportedFiles[0]?.originalname ?? null,
      source: TranscriptSource.UPLOAD,
      content,
      summary: summary ?? null,
      language: language ?? null,
      recordedAt: recordedAtDate ?? null,
      metadata: metadataValue ?? null,
    });

    return {
      status: 201,
      message: "Transcript uploaded",
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Get("{sessionId}/transcripts")
  @Security("ClientLevel")
  public async listTranscripts(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Query() page = 1,
    @Query() pageSize = 20,
  ): Promise<ApiResponse<TranscriptListResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const { transcripts, total } = await transcriptCrudService.listTranscriptsForUser(user.id, {
      sessionId,
      page,
      pageSize,
    });

    return {
      status: 200,
      data: {
        transcripts: transcripts.map(this.mapTranscriptResponse),
        total,
      },
    };
  }

  @Get("{sessionId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async getTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const transcript = await transcriptCrudService.getTranscriptForUser(user.id, transcriptId);

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Post("{sessionId}/transcripts/manual")
  @Security("ClientLevel")
  public async createManualTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Body() body: ManualTranscriptRequest,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const transcript = await transcriptCrudService.createTranscriptForUser(user.id, {
      sessionId,
      title: body.title ?? null,
      source: body.source ?? TranscriptSource.MANUAL,
      content: body.content ?? null,
      summary: body.summary ?? null,
      language: body.language ?? null,
      recordedAt: body.recordedAt ?? null,
      metadata: body.metadata ?? null,
    });

    return {
      status: 201,
      message: "Transcript created",
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Put("{sessionId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async updateTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() transcriptId: string,
    @Body() body: UpdateTranscriptRequest,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const transcript = await transcriptCrudService.updateTranscriptForUser(user.id, transcriptId, {
      title: body.title,
      source: body.source,
      language: body.language,
      summary: body.summary,
      transcript: body.transcript,
      recordedAt: body.recordedAt,
      metadata: body.metadata,
    });

    return {
      status: 200,
      message: "Transcript updated",
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Delete("{sessionId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async deleteTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    await transcriptCrudService.deleteTranscriptForUser(user.id, transcriptId);

    return {
      status: 200,
      message: "Transcript deleted",
      data: null,
    };
  }

  @Get("{sessionId}/tasks")
  @Security("ClientLevel")
  public async listTasks(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Query() status?: TaskStatus,
    @Query() priority?: TaskPriority,
    @Query() page = 1,
    @Query() pageSize = 20,
  ): Promise<ApiResponse<TaskListResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const { tasks, total } = await taskCrudService.listTasksForUser(user.id, {
      sessionId,
      status,
      priority,
      page,
      pageSize,
    });

    return {
      status: 200,
      data: {
        tasks: tasks.map((task) => this.mapTaskResponse(task)),
        total,
      },
    };
  }

  @Get("{sessionId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async getTask(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() taskId: string,
  ): Promise<ApiResponse<TaskResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const task = await taskCrudService.getTaskForUser(user.id, taskId);

    return {
      status: 200,
      data: this.mapTaskResponse(task),
    };
  }

  @Post("{sessionId}/tasks")
  @Security("ClientLevel")
  public async createTask(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Body() body: CreateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const task = await taskCrudService.createTaskForUser(user.id, {
      sessionId,
      title: body.title,
      description: body.description ?? null,
      summary: body.summary ?? null,
      acceptanceCriteria: body.acceptanceCriteria ?? null,
      status: body.status,
      priority: body.priority,
      dueDate: body.dueDate ?? null,
      metadata: body.metadata ?? null,
      dependencyTaskIds: body.dependencyTaskIds,
    });

    return {
      status: 201,
      message: "Task created",
      data: this.mapTaskResponse(task),
    };
  }

  @Put("{sessionId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async updateTask(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const task = await taskCrudService.updateTaskForUser(user.id, taskId, {
      title: body.title,
      description: body.description,
      summary: body.summary,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status,
      priority: body.priority,
      dueDate: body.dueDate,
      metadata: body.metadata,
      dependencyTaskIds: body.dependencyTaskIds,
    });

    return {
      status: 200,
      message: "Task updated",
      data: this.mapTaskResponse(task),
    };
  }

  @Delete("{sessionId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async deleteTask(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Path() taskId: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    await taskCrudService.deleteTaskForUser(user.id, taskId);

    return {
      status: 200,
      message: "Task deleted",
      data: null,
    };
  }

  @Get("{sessionId}")
  @Security("ClientLevel")
  public async getSession(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
  ): Promise<ApiResponse<SessionResponse>> {
    const session = await this.getSessionForUser(request, sessionId);

    return {
      status: 200,
      data: this.mapSessionResponse(session),
    };
  }

  @Post()
  @Security("ClientLevel")
  public async createSession(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateSessionRequest,
  ): Promise<ApiResponse<SessionResponse>> {
    const user = await this.getAuthorizedUser(request);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description,
        status: body.status ?? SessionStatus.ACTIVE,
        startedAt: body.startedAt ?? new Date(),
        ...(body.metadata === undefined ? {} : { metadata: body.metadata ?? Prisma.JsonNull }),
      },
    });

    return {
      status: 201,
      message: "Session created",
      data: this.mapSessionResponse(session),
    };
  }

  @Put("{sessionId}")
  @Security("ClientLevel")
  public async updateSession(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Body() body: UpdateSessionRequest,
  ): Promise<ApiResponse<SessionResponse>> {
    await this.getSessionForUser(request, sessionId);

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        title: body.title,
        description: body.description,
        status: body.status,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
        ...(body.metadata === undefined ? {} : { metadata: body.metadata ?? Prisma.JsonNull }),
      },
    });

    return {
      status: 200,
      message: "Session updated",
      data: this.mapSessionResponse(session),
    };
  }

  @Delete("{sessionId}")
  @Security("ClientLevel")
  public async deleteSession(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
  ): Promise<ApiResponse<null>> {
    await this.getSessionForUser(request, sessionId);
    await prisma.session.delete({ where: { id: sessionId } });

    return {
      status: 200,
      message: "Session deleted",
      data: null,
    };
  }

  @Post("{sessionId}/transcripts")
  @Security("ClientLevel")
  public async createTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() sessionId: string,
    @Body() body: CreateTranscriptRequest,
  ): Promise<ApiResponse<CreateTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getSessionForUser(request, sessionId);

    const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);

    const result = await sessionTranscriptService.createTranscriptForSession({
      sessionId,
      content: body.content,
      title: body.title,
      source: body.source,
      recordedAt: body.recordedAt ?? null,
      metadata: body.metadata,
      contextPrompt,
      contextIds: body.contextIds,
    });

    const tasksWithRelations = await Promise.all(
      result.tasks.map((task) => taskCrudService.getTaskForUser(user.id, task.id)),
    );

    return {
      status: 201,
      message: "Transcript created",
      data: {
        transcript: this.mapTranscriptResponse(result.transcript),
        tasks: tasksWithRelations.map((task) => this.mapTaskResponse(task)),
        analysis: this.mapTranscriptAnalysis(result.analysis),
      },
    };
  }

  private async getAuthorizedUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      throw { status: 404, message: "User not found" };
    }

    return user;
  }

  private async getSessionForUser(request: AuthenticatedRequest, sessionId: string) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        user: { firebaseUid: request.user.uid },
      },
    });

    if (!session) {
      this.setStatus(404);
      throw { status: 404, message: "Session not found" };
    }

    return session;
  }

  private mapSessionResponse(session: {
    id: string;
    title: string;
    description: string | null;
    status: SessionStatus;
    startedAt: Date | null;
    endedAt: Date | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): SessionResponse {
    return {
      id: session.id,
      title: session.title,
      description: session.description,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      metadata: session.metadata,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private mapTranscriptResponse(transcript: {
    id: string;
    sessionId: string;
    title: string | null;
    source: TranscriptSource;
    language: string | null;
    summary: string | null;
    transcript: string | null;
    recordedAt: Date | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): TranscriptResponse {
    return {
      id: transcript.id,
      sessionId: transcript.sessionId,
      title: transcript.title,
      source: transcript.source,
      language: transcript.language,
      summary: transcript.summary,
      transcript: transcript.transcript,
      recordedAt: transcript.recordedAt,
      metadata: transcript.metadata,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
    };
  }

  private mapTaskResponse(
    task: TaskWithRelations | (Task & { dependants?: { dependsOnTaskId: string }[] }),
  ): TaskResponse {
    return {
      id: task.id,
      sessionId: task.sessionId,
      title: task.title,
      description: task.description,
      summary: task.summary,
      acceptanceCriteria: task.acceptanceCriteria,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      dependencies: (task.dependants ?? []).map((dependency) => dependency.dependsOnTaskId),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private mapTranscriptAnalysis(analysis: TranscriptAnalysis): TranscriptAnalysisResponse {
    return {
      language: analysis.language,
      summary: analysis.summary ?? null,
      tasks: analysis.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ?? null,
      })),
    };
  }
}
