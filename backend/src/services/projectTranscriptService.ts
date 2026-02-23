import {
  Prisma,
  TaskPriority,
  TaskStatus,
  Transcript,
  TranscriptSource,
  Task,
} from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z, type ZodTypeAny } from "zod";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";

const TASK_STATUS_VALUES = ["BACKLOG", "IN_PROGRESS", "BLOCKED", "COMPLETED", "ARCHIVED"] as const;
const TASK_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const TASK_STATUS_LIST = TASK_STATUS_VALUES.join(", ");
const TASK_PRIORITY_LIST = TASK_PRIORITY_VALUES.join(", ");

const TASK_STATUS_SET = new Set<string>(TASK_STATUS_VALUES);
const TASK_PRIORITY_SET = new Set<string>(TASK_PRIORITY_VALUES);

const TranscriptTaskRawSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().optional(),
  acceptanceCriteria: z.string().min(1),
  priority: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.string().optional(),
});

const TranscriptAnalysisRawSchema = z.object({
  language: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
  tasks: z.array(TranscriptTaskRawSchema),
});

const transcriptAnalysisSchemaForGeneration: ZodTypeAny = TranscriptAnalysisRawSchema;

export interface TranscriptAnalysis {
  language: string;
  title?: string;
  summary?: string;
  tasks: TranscriptTask[];
}

export interface TranscriptTask {
  title: string;
  summary?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
}

const generateObjectLoose = generateObject as unknown as (args: {
  model: unknown;
  schema: ZodTypeAny;
  prompt: string;
  temperature?: number;
}) => Promise<{ object: unknown }>;

export interface CreateTranscriptInput {
  userId: string;
  projectId: string;
  content: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextPrompt?: string | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string | null;
  englishLevel?: string;
}

export interface CreateTranscriptResult {
  transcript: Transcript;
  tasks: Task[];
  analysis: TranscriptAnalysis;
}

export interface CreateStandaloneTranscriptInput {
  userId: string;
  content: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextPrompt?: string | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string | null;
  englishLevel?: string;
}

export interface CreateStandaloneTranscriptResult {
  transcript: Transcript;
  analysis: TranscriptAnalysis;
}

export class ProjectTranscriptService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });

  private readonly modelName = "google/gemini-2.0-flash-001";

  public async createTranscriptForProject(
    input: CreateTranscriptInput,
  ): Promise<CreateTranscriptResult> {
    const analysis = await this.analyzeTranscript(
      input.content,
      input.contextPrompt ?? null,
      input.contextIds,
      input.persona ?? "ARCHITECT",
      input.objective ?? null,
      input.englishLevel,
    );

    const result = await prisma.$transaction(async (tx) => {
      const transcript = await tx.transcript.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          title: input.title || analysis.title || null,
          source: input.source ?? TranscriptSource.MANUAL,
          language: analysis.language,
          summary: analysis.summary ?? null,
          transcript: input.content,
          recordedAt: input.recordedAt ?? null,
          ...(typeof input.metadata === "undefined"
            ? {}
            : input.metadata === null
              ? { metadata: Prisma.JsonNull }
              : { metadata: input.metadata }),
        },
      });

      const createdTasks: Task[] = [];

      for (const [index, taskCandidate] of analysis.tasks.entries()) {
        const startDate = this.resolveStartDate(input.recordedAt);
        const dueDate = this.resolveDueDate(
          taskCandidate.dueDate,
          taskCandidate.priority,
          startDate,
        );
        const createdTask = await tx.task.create({
          data: {
            projectId: input.projectId,
            title: taskCandidate.title,
            description: taskCandidate.description ?? null,
            summary: taskCandidate.summary ?? null,
            acceptanceCriteria: taskCandidate.acceptanceCriteria ?? null,
            priority: this.resolveTaskPriority(taskCandidate.priority),
            status: this.resolveTaskStatus(taskCandidate.status),
            position: index,
            startDate,
            dueDate,
            metadata: {
              generatedFromTranscriptId: transcript.id,
              generatorVersion: "session-transcript-service@2",
            } satisfies Prisma.JsonObject,
          },
        });
        createdTasks.push(createdTask);
      }

      if (createdTasks.length > 0) {
        await tx.taskTranscriptLink.createMany({
          data: createdTasks.map((task) => ({
            taskId: task.id,
            transcriptId: transcript.id,
          })),
        });
      }

      return { transcript, createdTasks };
    });

    return {
      transcript: result.transcript,
      tasks: result.createdTasks,
      analysis,
    };
  }

  public async createStandaloneTranscript(
    input: CreateStandaloneTranscriptInput,
  ): Promise<CreateStandaloneTranscriptResult> {
    const analysis = await this.analyzeTranscript(
      input.content,
      input.contextPrompt ?? null,
      input.contextIds,
      input.persona ?? "SECRETARY", // Defaulting to SECRETARY for standalone meetings
      input.objective ?? null,
      input.englishLevel,
    );

    const transcript = await prisma.transcript.create({
      data: {
        userId: input.userId,
        projectId: null,
        title: input.title || analysis.title || null,
        source: input.source ?? TranscriptSource.MANUAL,
        language: analysis.language,
        summary: analysis.summary ?? null,
        transcript: input.content,
        recordedAt: input.recordedAt ?? null,
        ...(typeof input.metadata === "undefined"
          ? {}
          : input.metadata === null
            ? { metadata: Prisma.JsonNull }
            : { metadata: input.metadata }),
      },
    });

    return {
      transcript,
      analysis,
    };
  }

  private async analyzeTranscript(
    content: string,
    contextPrompt: string | null,
    contextIds: string[] | undefined,
    persona: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
    objective: string | null,
    englishLevel?: string,
  ): Promise<TranscriptAnalysis> {
    const model = this.openrouter(this.modelName);
    const todayIso = new Date().toISOString().split("T")[0];

    // RAG: Query context vectors if contextIds are provided
    let dynamicContext = "";
    if (contextIds && contextIds.length > 0) {
      try {
        // Use the first 500 characters of the transcript as the query
        const query = content.slice(0, 500);
        const chunks = await queryContexts(contextIds, query, 1000);
        if (chunks.length > 0) {
          dynamicContext = `\nRetrieved context from knowledge base:\n${chunks.join("\n\n")}\n`;
        }
      } catch (error) {
        logger.warn("Failed to retrieve dynamic context for transcript", error);
      }
    }

    const contextSection =
      (contextPrompt ? `Relevant context:\n${contextPrompt}\n\n` : "") + dynamicContext;

    let personaInstructions = "";
    switch (persona) {
      case "SECRETARY":
        personaInstructions = `You are a meticulous Secretary.
Focus on extreme precision. Only extract tasks and requirements explicitly mentioned in the transcript.
Do NOT guess technical details or generate new tasks. If the user hasn't explicitly said it, don't include it.`;
        break;
      case "ARCHITECT":
        personaInstructions = `You are an AI Senior Architect.
Use the provided codebase context to DECOMPOSE high-level goals into a detailed technical execution plan.
Create specific tasks for different components, files, or database changes needed based on the actual code found in the context.`;
        break;
      case "PRODUCT_MANAGER":
        personaInstructions = `You are a Product Manager.
Focus on user value, feature scope, and roadmap. Turn goals into actionable user stories and milestones.
Identify potential risks or dependencies from a product perspective.`;
        break;
      case "DEVELOPER":
        personaInstructions = `You are a Senior Full-Stack Developer.
Focus on implementation details, refactoring opportunities, and coding best practices.
Break down goals into specific coding tasks, PRs, and technical improvements.`;
        break;
    }

    const objectiveSection = objective
      ? `\nPRIMARY OBJECTIVE / MAIN PROMPT:\n"${objective}"\n\nIMPORTANT: The user has provided the above objective. This is the MOST IMPORTANT instruction. Prioritize this objective over the transcript content. If the transcript implies 3 tasks but the objective says "create one task", you MUST follow the objective.`
      : "";

    let englishLevelInstruction = "";
    if (englishLevel) {
      englishLevelInstruction = `\nIMPORTANT: Adjust the language complexity of the validation steps and descriptions to a "${englishLevel}" English level.`;
    }

    const prompt = `Today is ${todayIso}. ${personaInstructions}

Analyze the following transcript/request and the provided codebase context.

1. Detect the predominant human language (ISO name, e.g. "english").
2. GENERATE a short, representative title for the transcript (max 10 words).
3. Provide a succinct summary (max 80 words).
4. Extract or GENERATE actionable tasks:
   - Each task MUST have a clear title.
   - **summary**: REQUIRED. A concise, 1-sentence overview of the task (max 20 words).
   - **description**: Detailed technical steps or context.
   - **acceptanceCriteria**: REQUIRED. A markdown list of verifiable conditions for success.
   - status (${TASK_STATUS_LIST}) and priority (${TASK_PRIORITY_LIST}).


Do NOT guess due dates. Only populate dueDate if explicitly mentioned.
${englishLevelInstruction}

${objectiveSection}

${contextSection}

Transcript/Request:
${content}`;

    try {
      const { object } = await generateObjectLoose({
        model,
        schema: transcriptAnalysisSchemaForGeneration,
        prompt,
        temperature: 0.2,
      });

      const parsed = TranscriptAnalysisRawSchema.parse(object);
      return {
        language: parsed.language,
        title: parsed.title,
        summary: parsed.summary,
        tasks: parsed.tasks.map((task) => ({
          title: task.title,
          summary: task.summary,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          priority: this.normalizeTaskPriority(task.priority),
          status: this.normalizeTaskStatus(task.status),
          dueDate: task.dueDate,
        })),
      } satisfies TranscriptAnalysis;
    } catch (error: unknown) {
      logger.error("Failed to analyse transcript with OpenAI", error);
      return {
        language: "unknown",
        tasks: [],
      } satisfies TranscriptAnalysis;
    }
  }

  private parseDueDate(raw: string | undefined): Date | null {
    if (!raw) {
      return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveTaskPriority(priority?: TaskPriority | undefined): TaskPriority {
    if (!priority) {
      return TaskPriority.MEDIUM;
    }

    return priority;
  }

  private resolveTaskStatus(status?: TaskStatus | undefined): TaskStatus {
    if (!status) {
      return TaskStatus.BACKLOG;
    }

    return status;
  }

  private resolveStartDate(recordedAt?: Date | null): Date {
    if (recordedAt) {
      return recordedAt;
    }

    return new Date();
  }

  private resolveDueDate(
    rawDueDate: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    priority: TaskPriority | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startDate: Date,
  ): Date | null {
    const parsedDueDate = this.parseDueDate(rawDueDate);
    if (parsedDueDate) {
      return parsedDueDate;
    }

    return null;
  }

  private normalizeTaskPriority(priority?: string): TaskPriority | undefined {
    if (!priority) {
      return undefined;
    }

    const normalized = priority.toUpperCase();
    if (TASK_PRIORITY_SET.has(normalized)) {
      return normalized as TaskPriority;
    }

    return undefined;
  }

  private normalizeTaskStatus(status?: string): TaskStatus | undefined {
    if (!status) {
      return undefined;
    }

    const normalized = status.toUpperCase();
    if (TASK_STATUS_SET.has(normalized)) {
      return normalized as TaskStatus;
    }

    return undefined;
  }
}

export const projectTranscriptService = new ProjectTranscriptService();
