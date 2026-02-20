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
  ProjectStatus,
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
import { extractTextFromUpload, isSupportedUploadMimeType } from "../utils/documentTextExtractor";

interface ProjectResponse {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  metadata: Prisma.JsonValue | null;
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
  metadata?: Prisma.InputJsonValue | null;
}

interface UpdateProjectRequest {
  title?: string;
  description?: string | null;
  status?: ProjectStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

interface CreateTranscriptRequest {
  content?: string;
  objective?: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  englishLevel?: string;
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
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}
interface TaskResponse {
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

@Route("api/projects")
@Tags("Projects")
export class ProjectsModelController extends Controller {
  @Get()
  @Security("ClientLevel")
  public async listSessions(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() pageSize = 20,
    @Query() status?: ProjectStatus,
  ): Promise<ApiResponse<ProjectListResponse>> {
    const user = await this.getAuthorizedUser(request);

    const currentPage = Math.max(page, 1);
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (currentPage - 1) * take;

    const whereClause = {
      userId: user.id,
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
    @FormField() englishLevel?: string,
  ): Promise<ApiResponse<CreateTranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

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

    const contextPrompt = await this.buildContextPrompt(user.id, contextIds ?? []);

    const result = await projectTranscriptService.createTranscriptForProject({
      projectId,
      userId: user.id,
      content,
      title: title || supportedFiles[0]?.originalname || undefined,
      source: TranscriptSource.UPLOAD,
      recordedAt: recordedAtDate ?? null,
      metadata: metadataValue,
      contextPrompt,
      contextIds: contextIds,
      persona: persona,
      objective: objective,
      englishLevel,
    });

    const tasksWithRelations = await Promise.all(
      result.tasks.map((task: Task) => taskCrudService.getTaskForUser(user.id, task.id)),
    );

    return {
      status: 201,
      message: "Transcript uploaded",
      data: {
        transcript: this.mapTranscriptResponse(result.transcript),
        tasks: tasksWithRelations.map((task: TaskWithRelations) => this.mapTaskResponse(task)),
        analysis: this.mapTranscriptAnalysis(result.analysis),
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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const options: TranscriptListOptions = {
      projectId,
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

  @Get("{projectId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async getProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<TranscriptResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const transcript = await transcriptCrudService.getTranscriptForUser(user.id, transcriptId);

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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const input: CreateTranscriptInput = {
      projectId,
      title: body.title ?? null,
      source: body.source ?? TranscriptSource.MANUAL,
      content: body.content ?? null,
      summary: body.summary ?? null,
      language: body.language ?? null,
      recordedAt: body.recordedAt ?? null,
      metadata: body.metadata ?? null,
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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

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

  @Delete("{projectId}/transcripts/{transcriptId}")
  @Security("ClientLevel")
  public async deleteProjectTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    await transcriptCrudService.deleteTranscriptForUser(user.id, transcriptId);

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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const options: TaskListOptions = {
      projectId,
      status,
      priority,
      page,
      pageSize,
    };
    const { tasks: resultTasks, total } = await taskCrudService.listTasksForUser(user.id, options);

    return {
      status: 200,
      data: {
        tasks: resultTasks.map((task: Task) => this.mapTaskResponse(task)),
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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const task = await taskCrudService.getTaskForUser(user.id, taskId);

    return {
      status: 200,
      data: this.mapTaskResponse(task),
    };
  }

  @Post("{projectId}/tasks")
  @Security("ClientLevel")
  public async createTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Body() body: CreateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const task = await taskCrudService.createTaskForUser(user.id, {
      projectId,
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

  @Put("{projectId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async updateTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
  ): Promise<ApiResponse<TaskResponse>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

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

  @Delete("{projectId}/tasks/{taskId}")
  @Security("ClientLevel")
  public async deleteTask(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
    @Path() taskId: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    await taskCrudService.deleteTaskForUser(user.id, taskId);

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
    const project = await this.getProjectForUser(request, projectId);

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
    const user = await this.getAuthorizedUser(request);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description,
        status: body.status ?? ProjectStatus.ACTIVE,
        startedAt: body.startedAt ?? new Date(),
        ...(body.metadata === undefined ? {} : { metadata: body.metadata ?? Prisma.JsonNull }),
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
    await this.getProjectForUser(request, projectId);

    const project = await prisma.project.update({
      where: { id: projectId },
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
      data: this.mapProjectResponse(project),
    };
  }

  @Delete("{projectId}")
  @Security("ClientLevel")
  public async deleteSession(
    @Request() request: AuthenticatedRequest,
    @Path() projectId: string,
  ): Promise<ApiResponse<null>> {
    await this.getProjectForUser(request, projectId);
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
    const user = await this.getAuthorizedUser(request);
    await this.getProjectForUser(request, projectId);

    const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);

    if (!body.content && !body.objective) {
      this.setStatus(400);
      throw {
        status: 400,
        message: "You must provide either transcript content or an objective.",
      };
    }

    const result = await projectTranscriptService.createTranscriptForProject({
      projectId,
      userId: user.id,
      content: body.content ?? "",
      title: body.title,
      source: body.source,
      recordedAt: body.recordedAt ?? null,
      metadata: body.metadata,
      contextPrompt,
      contextIds: body.contextIds,
      persona: body.persona,
      objective: body.objective,
      englishLevel: body.englishLevel,
    });

    const tasksWithRelations = await Promise.all(
      result.tasks.map((task: Task) => taskCrudService.getTaskForUser(user.id, task.id)),
    );

    return {
      status: 201,
      message: "Transcript created",
      data: {
        transcript: this.mapTranscriptResponse(result.transcript),
        tasks: tasksWithRelations.map((task: TaskWithRelations) => this.mapTaskResponse(task)),
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

  private async getProjectForUser(request: AuthenticatedRequest, projectId: string) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        user: { firebaseUid: request.user.uid },
      },
    });

    if (!project) {
      this.setStatus(404);
      throw { status: 404, message: "Project not found" };
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
    metadata: Prisma.JsonValue | null;
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
    metadata: Prisma.JsonValue | null;
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
    };
  }

  private mapTaskResponse(
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
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private mapTranscriptAnalysis(analysis: TranscriptAnalysis): TranscriptAnalysisResponse {
    return {
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
