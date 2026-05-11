import { BaseWorkspaceController } from "./BaseWorkspaceController";
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
} from "tsoa";
import {
  Prisma,
  ProjectStatus,
  TranscriptSource,
  TaskPriority,
  TaskStatus,
  Task,
  TaskType,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type ApiResponse, type TsoaJsonObject } from "./controllerTypes";
import {
  projectTranscriptService,
  type TranscriptAnalysis,
} from "../services/projectTranscriptService";
import {
  transcriptCrudService,
  type TranscriptListOptions,
  type CreateTranscriptInput,
} from "../services/transcriptCrudService";
import {
  taskCrudService,
  type TaskWithRelations,
  type TaskListOptions,
} from "../services/taskCrudService";
import { transcriptGenerationQueue } from "../queue/transcriptGenerationQueue";
import { extractTextFromUpload, isSupportedUploadMimeType } from "../utils/documentTextExtractor";
import { aiTaskCoachService } from "../services/aiTaskCoachService";

interface ProjectResponse {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  metadata: TsoaJsonObject | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectListResponse {
  projects: ProjectResponse[];
  total: number;
}

interface CreateProjectRequest {
  title: string;
  description?: string;
  status?: ProjectStatus;
  startedAt?: Date | null;
  metadata?: TsoaJsonObject | null;
}

interface UpdateProjectRequest {
  title?: string;
  description?: string | null;
  status?: ProjectStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  metadata?: TsoaJsonObject | null;
}

interface CreateTranscriptRequest {
  content?: string;
  objective?: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: TsoaJsonObject | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  complexityLevel?: string;
  modelKey?: string;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  agenticInvestigation?: boolean;
}

interface TranscriptResponse {
  id: string;
  projectId: string | null;
  userId: string;
  title: string | null;
  source: TranscriptSource;
  language: string | null;
  summary: string | null;
  transcript: string | null;
  recordedAt: Date | null;
  metadata: TsoaJsonObject | null;
  createdAt: Date;
  updatedAt: Date;
  chatThread?: {
    id: string;
    title: string;
    messages: {
      role: "USER" | "ASSISTANT";
      content: string;
      createdAt: Date;
    }[];
  } | null;
}
export interface TaskResponse {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  summary: string | null;
  acceptanceCriteria: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  dependencies: string[];
  metadata: TsoaJsonObject | null;
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
  chainOfThought?: string;
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

interface ImportTranscriptRequest {
  transcriptId: string;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string;
  complexityLevel?: string;
  modelKey?: string;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  syncToJira?: boolean;
  syncToLinear?: boolean;
  syncToTrello?: boolean;
  agenticInvestigation?: boolean;
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
  metadata?: TsoaJsonObject | null;
}

interface UpdateTranscriptRequest {
  title?: string | null;
  source?: TranscriptSource;
  language?: string | null;
  summary?: string | null;
  transcript?: string | null;
  recordedAt?: Date | null;
  metadata?: TsoaJsonObject | null;
  modelKey?: string;
}

interface CreateTaskRequest {
  title: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  /** Format: date-time */
  dueDate?: Date | null;
  metadata?: TsoaJsonObject | null;
  dependencyTaskIds?: string[];
}

interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  /** Format: date-time */
  dueDate?: Date | null;
  metadata?: TsoaJsonObject | null;
  dependencyTaskIds?: string[];
}

interface RefineTaskRequest {
  title: string;
  summary?: string | null;
  description?: string | null;
  acceptanceCriteria?: string | null;
  type: TaskType;
  priority: TaskPriority;
}

interface RefineTaskResponse {
  refinedTitle: string;
  structuredDescription: string;
  acceptanceCriteria?: string;
  storyPoints?: number;
  estimatedMinutes?: number;
}

export function mapTaskResponse(
  task: TaskWithRelations | (Task & { dependants?: { dependsOnTaskId: string }[] }),
): TaskResponse {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    summary: task.summary,
    acceptanceCriteria: task.acceptanceCriteria,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    dependencies: (task.dependants ?? []).map((dependency) => dependency.dependsOnTaskId),
    metadata: (task.metadata as TsoaJsonObject) || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

@Route("api/projects")
@Tags("Projects")
export class ProjectsModelController extends BaseWorkspaceController {
  @Get()
  @Security("ClientLevel")
  public async listSessions(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() pageSize = 20,
    @Query() status?: ProjectStatus,
  ): Promise<ApiResponse<ProjectListResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const currentPage = Math.max(page, 1);
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (currentPage - 1) * take;

    const whereClause = {
      workspaceId,
      ...(status ? { status } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.project.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.project.count({ where: whereClause }),
    ]);

    return {
      status: 200,
      data: {
        projects: sessions.map(this.mapProjectResponse),
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

  @Post("{projectId}/transcripts/upload")
  @Security("ClientLevel")
  public async uploadTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @FormField() title?: string,
    @FormField() recordedAt?: string,
    @FormField() metadata?: string,
    @FormField() persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
    @FormField() objective?: string,
    @FormField() contextIds?: string[],
    @FormField() complexityLevel?: string,
    @FormField() modelKey?: string,
    @FormField() taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT",
    @FormField() taskCount?: number,
    @FormField() syncToJira?: boolean,
    @FormField() syncToLinear?: boolean,
    @FormField() syncToTrello?: boolean,
    @FormField() agenticInvestigation?: boolean,
  ): Promise<ApiResponse<CreateTranscriptResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

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
      const originalNameUtf8 = Buffer.from(file.originalname, "latin1").toString("utf8");
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
          message: `Failed to extract text from ${originalNameUtf8}`,
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

    const contextPrompt = await this.buildContextPrompt(user.id, contextIds ?? []);

    const pendingResult = await projectTranscriptService.createPendingTranscript({
      projectId,
      userId: user.id,
      workspaceId: workspaceId,
      content,
      title:
        title ||
        (supportedFiles[0]
          ? Buffer.from(supportedFiles[0].originalname, "latin1").toString("utf8")
          : undefined),
      source: TranscriptSource.UPLOAD,
      recordedAt: recordedAtDate ?? null,
      metadata: metadataValue,
    });

    const transcript = pendingResult.transcript;

    // Push to BullMQ Worker
    await transcriptGenerationQueue.add("generate-transcript", {
      transcriptId: transcript.id,
      projectId: projectId,
      workspaceId: workspaceId,
      userId: user.id,
      content: content,
      source: TranscriptSource.UPLOAD,
      contextIds: contextIds,
      persona: persona,
      objective: objective,
      complexityLevel,
      modelKey,
      taskStrategy,
      taskCount,
      syncToJira,
      syncToLinear,
      syncToTrello,
      agenticInvestigation,
      contextPrompt: contextPrompt ?? undefined,
    });

    this.setStatus(202);
    return {
      status: 202,
      message: "Transcript queued for processing",
      data: {
        transcript: this.mapTranscriptResponse(transcript),
        tasks: [],
        analysis: { language: "processing", summary: null, tasks: [] },
      },
    };
  }

  @Get("{projectId}/transcripts")
  @Security("ClientLevel")
  public async listProjectTranscripts(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Query() page = 1,
    @Query() pageSize = 20,
  ): Promise<ApiResponse<TranscriptListResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const options: TranscriptListOptions = {
      projectId,
      workspaceId,
      page,
      pageSize,
    };
    const { transcripts, total } = await transcriptCrudService.listTranscriptsForUser(
      user.id,
      options,
    );

    return {
      status: 200,
      data: {
        transcripts: transcripts.map(this.mapTranscriptResponse),
        total,
      },
    };
  }

  @Post("{projectId}/transcripts/import")
  @Security("ClientLevel")
  public async importProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: ImportTranscriptRequest,
  ): Promise<ApiResponse<CreateTranscriptResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const sourceTranscript = await prisma.transcript.findUnique({
      where: {
        id: body.transcriptId,
        userId: user.id,
      },
    });

    if (!sourceTranscript) {
      this.setStatus(404);
      throw { status: 404, message: "Recording not found" };
    }

    if (!sourceTranscript.transcript) {
      this.setStatus(400);
      throw { status: 400, message: "Selected recording has no transcript content" };
    }

    const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);

    const pendingResult = await projectTranscriptService.createPendingTranscript({
      projectId,
      userId: user.id,
      workspaceId: workspaceId,
      content: sourceTranscript.transcript,
      title: sourceTranscript.title ?? undefined,
      source: sourceTranscript.source,
      recordedAt: sourceTranscript.recordedAt,
      metadata:
        sourceTranscript.metadata === null
          ? null
          : (sourceTranscript.metadata as Prisma.InputJsonValue),
    });

    const transcript = pendingResult.transcript;

    // Push to BullMQ Worker
    await transcriptGenerationQueue.add("generate-transcript", {
      transcriptId: transcript.id,
      projectId: projectId,
      workspaceId: workspaceId,
      userId: user.id,
      content: sourceTranscript.transcript,
      source: sourceTranscript.source,
      contextIds: body.contextIds,
      persona: body.persona,
      objective: body.objective,
      complexityLevel: body.complexityLevel,
      modelKey: body.modelKey,
      taskStrategy: body.taskStrategy,
      taskCount: body.taskCount,
      syncToJira: body.syncToJira,
      syncToLinear: body.syncToLinear,
      syncToTrello: body.syncToTrello,
      agenticInvestigation: body.agenticInvestigation,
      contextPrompt: contextPrompt ?? undefined,
    });

    this.setStatus(202);
    return {
      status: 202,
      message: "Recording queued for processing",
      data: {
        transcript: this.mapTranscriptResponse(transcript),
        tasks: [],
        analysis: { language: "processing", summary: null, tasks: [] },
      },
    };
  }

  @Get("{projectId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async getProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const transcript = await transcriptCrudService.getTranscriptForWorkspace(
      workspaceId,
      transcriptId,
    );

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Post("{projectId}/transcripts/manual")
  @Security("ClientLevel")
  public async createManualTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: ManualTranscriptRequest,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const input: CreateTranscriptInput & { workspaceId: string } = {
      projectId,
      workspaceId,
      title: body.title ?? null,
      source: body.source ?? TranscriptSource.MANUAL,
      content: body.content ?? null,
      summary: body.summary ?? null,
      language: body.language ?? null,
      recordedAt: body.recordedAt ?? null,
      metadata: (body.metadata as Prisma.InputJsonValue) ?? null,
    };
    const transcript = await transcriptCrudService.createTranscriptForUser(user.id, input);

    return {
      status: 201,
      message: "Transcript created",
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Put("{projectId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async updateProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() transcriptId: string,
    @Body() body: UpdateTranscriptRequest,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const transcript = await transcriptCrudService.updateTranscriptForWorkspace(
      workspaceId,
      transcriptId,
      {
        title: body.title,
        source: body.source,
        language: body.language,
        summary: body.summary,
        transcript: body.transcript,
        recordedAt: body.recordedAt,
        metadata:
          body.metadata === undefined ? undefined : (body.metadata as Prisma.InputJsonValue),
      },
    );

    return {
      status: 200,
      message: "Transcript updated",
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Delete("{projectId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async deleteProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    await transcriptCrudService.deleteTranscriptForWorkspace(workspaceId, transcriptId);

    return {
      status: 200,
      message: "Transcript deleted",
      data: null,
    };
  }

  @Get("{projectId}/tasks")
  @Security("ClientLevel")
  public async listTasks(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Query() status?: TaskStatus,
    @Query() priority?: TaskPriority,
    @Query() page = 1,
    @Query() pageSize = 20,
  ): Promise<ApiResponse<TaskListResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const options: TaskListOptions = {
      projectId,
      status,
      priority,
      page,
      pageSize,
    };
    const { tasks: resultTasks, total } = await taskCrudService.listTasksForWorkspace(
      workspaceId,
      options,
    );

    return {
      status: 200,
      data: {
        tasks: resultTasks.map((task) => mapTaskResponse(task as TaskWithRelations)),
        total,
      },
    };
  }

  @Get("{projectId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async getTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() taskId: string,
  ): Promise<ApiResponse<TaskResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const task = await taskCrudService.getTaskForWorkspace(workspaceId, taskId);

    return {
      status: 200,
      data: mapTaskResponse(task),
    };
  }

  @Post("{projectId}/tasks")
  @Security("ClientLevel")
  public async createTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: CreateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const task = await taskCrudService.createTaskForWorkspace(workspaceId, {
      projectId,
      title: body.title,
      description: body.description ?? null,
      summary: body.summary ?? null,
      acceptanceCriteria: body.acceptanceCriteria ?? null,
      status: body.status,
      priority: body.priority,
      dueDate: body.dueDate ?? null,
      metadata: (body.metadata as Prisma.InputJsonValue) ?? null,
      dependencyTaskIds: body.dependencyTaskIds,
    });

    return {
      status: 201,
      message: "Task created",
      data: mapTaskResponse(task),
    };
  }

  @Put("{projectId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async updateTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const task = await taskCrudService.updateTaskForWorkspace(workspaceId, taskId, {
      title: body.title,
      description: body.description,
      summary: body.summary,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status,
      priority: body.priority,
      type: body.type,
      dueDate: body.dueDate,
      metadata: body.metadata as Prisma.InputJsonValue,
      dependencyTaskIds: body.dependencyTaskIds,
    });

    return {
      status: 200,
      message: "Task updated",
      data: mapTaskResponse(task),
    };
  }

  @Post("{projectId}/tasks/refine")
  @Security("ClientLevel")
  public async refineTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: RefineTaskRequest,
  ): Promise<ApiResponse<RefineTaskResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const refined = await aiTaskCoachService.refineTask({
      title: body.title,
      summary: body.summary,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      type: body.type,
      priority: body.priority,
      workspaceId,
      userId: request.user!.uid,
    });

    return {
      status: 200,
      message: "Task refined",
      data: refined,
    };
  }

  @Delete("{projectId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async deleteTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() taskId: string,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    await taskCrudService.deleteTaskForWorkspace(workspaceId, taskId);

    return {
      status: 200,
      message: "Task deleted",
      data: null,
    };
  }

  @Get("{projectId}")
  @Security("ClientLevel")
  public async getSession(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
  ): Promise<ApiResponse<ProjectResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const project = await this.getProjectForWorkspace(request, projectId, workspaceId);

    return {
      status: 200,
      data: this.mapProjectResponse(project),
    };
  }

  @Post()
  @Security("ClientLevel")
  public async createSession(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateProjectRequest,
  ): Promise<ApiResponse<ProjectResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        workspaceId: workspaceId,
        title: body.title,
        description: body.description,
        status: body.status ?? ProjectStatus.ACTIVE,
        startedAt: body.startedAt ?? new Date(),
        ...(body.metadata === undefined
          ? {}
          : { metadata: (body.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull }),
      },
    });

    return {
      status: 201,
      message: "Session created",
      data: this.mapProjectResponse(project),
    };
  }

  @Put("{projectId}")
  @Security("ClientLevel")
  public async updateSession(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: UpdateProjectRequest,
  ): Promise<ApiResponse<ProjectResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        title: body.title,
        description: body.description,
        status: body.status,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
        ...(body.metadata === undefined
          ? {}
          : { metadata: (body.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull }),
      },
    });

    return {
      status: 200,
      message: "Session updated",
      data: this.mapProjectResponse(project),
    };
  }

  @Delete("{projectId}")
  @Security("ClientLevel")
  public async deleteSession(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);
    await prisma.project.delete({ where: { id: projectId } });

    return {
      status: 200,
      message: "Session deleted",
      data: null,
    };
  }

  @Post("{projectId}/transcripts")
  @Security("ClientLevel")
  public async createProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: CreateTranscriptRequest,
  ): Promise<ApiResponse<CreateTranscriptResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await this.getProjectForWorkspace(request, projectId, workspaceId);

    const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);

    if (!body.content && !body.objective) {
      this.setStatus(400);
      throw {
        status: 400,
        message: "You must provide either transcript content or an objective.",
      };
    }

    const pendingResult = await projectTranscriptService.createPendingTranscript({
      projectId,
      userId: user.id,
      workspaceId: workspaceId,
      content: body.content ?? "",
      title: body.title,
      source: body.source ?? "WEB",
      recordedAt: body.recordedAt ?? null,
      metadata: body.metadata === undefined ? undefined : (body.metadata as Prisma.InputJsonValue),
    });

    const transcript = pendingResult.transcript;

    // Push to BullMQ Worker
    await transcriptGenerationQueue.add("generate-transcript", {
      transcriptId: transcript.id,
      projectId: projectId,
      userId: user.id,
      workspaceId: workspaceId,
      content: body.content ?? "",
      source: body.source ?? "WEB",
      contextIds: body.contextIds,
      persona: body.persona,
      objective: body.objective,
      complexityLevel: body.complexityLevel,
      modelKey: body.modelKey,
      taskStrategy: body.taskStrategy,
      taskCount: body.taskCount,
      contextPrompt: contextPrompt ?? undefined,
    });

    this.setStatus(202);
    return {
      status: 202,
      message: "Transcript queued for processing",
      data: {
        transcript: this.mapTranscriptResponse(transcript),
        tasks: [],
        analysis: { language: "processing", summary: null, tasks: [] },
      },
    };
  }

  private async getProjectForWorkspace(
    request: AuthenticatedRequest,
    projectId: string,
    workspaceId: string,
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId: workspaceId,
      },
    });

    if (!project) {
      this.setStatus(404);
      throw { status: 404, message: "Project not found in this workspace" };
    }

    return project;
  }

  private mapProjectResponse(project: {
    id: string;
    title: string;
    description: string | null;
    status: ProjectStatus;
    startedAt: Date | null;
    endedAt: Date | null;
    metadata: TsoaJsonObject | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProjectResponse {
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      startedAt: project.startedAt,
      endedAt: project.endedAt,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private mapTranscriptResponse(transcript: {
    id: string;
    projectId: string | null;
    userId: string;
    title: string | null;
    source: TranscriptSource;
    language: string | null;
    summary: string | null;
    transcript: string | null;
    recordedAt: Date | null;
    metadata: TsoaJsonObject | null;
    createdAt: Date;
    updatedAt: Date;
  }): TranscriptResponse {
    return {
      id: transcript.id,
      projectId: transcript.projectId,
      userId: transcript.userId,
      title: transcript.title,
      source: transcript.source,
      language: transcript.language,
      summary: transcript.summary,
      transcript: transcript.transcript,
      recordedAt: transcript.recordedAt,
      metadata: transcript.metadata,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chatThread: (transcript as any).chatThread
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            id: (transcript as any).chatThread.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            title: (transcript as any).chatThread.title,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: (transcript as any).chatThread.messages.map((m: any) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            })),
          }
        : null,
    };
  }

  private mapTranscriptAnalysis(analysis: TranscriptAnalysis): TranscriptAnalysisResponse {
    return {
      chainOfThought: analysis.chainOfThought,
      language: analysis.language,
      summary: analysis.summary ?? null,
      tasks: analysis.tasks.map((task: TranscriptTaskInsight) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ?? null,
      })),
    };
  }
}
