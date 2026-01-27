import {
  Prisma,
  TaskPriority,
  TaskStatus,
  Transcript,
  TranscriptSource,
  Task,
} from "@prisma/client";
import { createOpenAI } from "@ai-sdk/openai";
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
  description: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.string().optional(),
});

const TranscriptAnalysisRawSchema = z.object({
  language: z.string().min(1),
  summary: z.string().optional(),
  tasks: z.array(TranscriptTaskRawSchema),
});

const transcriptAnalysisSchemaForGeneration: ZodTypeAny = TranscriptAnalysisRawSchema;

export interface TranscriptAnalysis {
  language: string;
  summary?: string;
  tasks: TranscriptTask[];
}

export interface TranscriptTask {
  title: string;
  description?: string;
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
  sessionId: string;
  content: string;
  title?: string;
  source?: TranscriptSource;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextPrompt?: string | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
}

export interface CreateTranscriptResult {
  transcript: Transcript;
  tasks: Task[];
  analysis: TranscriptAnalysis;
}

export class SessionTranscriptService {
  private readonly openAI = createOpenAI({
    apiKey: EnvUtils.get("OPENAI_API_KEY"),
  });

  private readonly modelName = "gpt-o5";

  public async createTranscriptForSession(
    input: CreateTranscriptInput,
  ): Promise<CreateTranscriptResult> {
    const analysis = await this.analyzeTranscript(
      input.content,
      input.contextPrompt ?? null,
      input.contextIds,
      input.persona ?? "ARCHITECT",
    );

    const result = await prisma.$transaction(async (tx) => {
      const transcript = await tx.transcript.create({
        data: {
          sessionId: input.sessionId,
          title: input.title ?? null,
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
            sessionId: input.sessionId,
            title: taskCandidate.title,
            description: taskCandidate.description ?? null,
            summary: taskCandidate.description ?? null,
            acceptanceCriteria: null,
            priority: this.resolveTaskPriority(taskCandidate.priority),
            status: this.resolveTaskStatus(taskCandidate.status),
            position: index,
            startDate,
            dueDate,
            metadata: {
              generatedFromTranscriptId: transcript.id,
              generatorVersion: "session-transcript-service@1",
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

  private async analyzeTranscript(
    content: string,
    contextPrompt: string | null,
    contextIds: string[] | undefined,
    persona: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
  ): Promise<TranscriptAnalysis> {
    const model = this.openAI(this.modelName);
    const todayIso = new Date().toISOString().split("T")[0];

    // RAG: Query context vectors if contextIds are provided
    let dynamicContext = "";
    if (contextIds && contextIds.length > 0) {
      try {
        // Use the first 500 characters of the transcript as the query
        const query = content.slice(0, 500);
        const chunks = await queryContexts(contextIds, query, 100);
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

    const prompt = `Today is ${todayIso}. ${personaInstructions}

Analyze the following transcript/request and the provided codebase context.

1. Detect the predominant human language (ISO name, e.g. "english").
2. Provide a succinct summary (max 80 words).
3. Extract or GENERATE actionable tasks:
   - Each task must have a clear title, technical description, status (${TASK_STATUS_LIST}), and priority (${TASK_PRIORITY_LIST}).

Do NOT guess due dates. Only populate dueDate if explicitly mentioned.

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
        summary: parsed.summary,
        tasks: parsed.tasks.map((task) => ({
          title: task.title,
          description: task.description,
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

export const sessionTranscriptService = new SessionTranscriptService();
