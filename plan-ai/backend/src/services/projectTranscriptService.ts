import {
  Prisma,
  TaskPriority,
  TaskStatus,
  TaskType,
  Transcript,
  TranscriptSource,
  Task,
} from "@prisma/client";
import {
  getWorkspaceModel,
  getFallbackProviderOptions,
  DEFAULT_AI_MODEL,
  getMaxContextChunks,
} from "../utils/aiModelUtils";
import { generateObject, generateText, stepCountIs } from "ai";
import { z, type ZodTypeAny } from "zod";
import { DeepgramClient } from "@deepgram/sdk";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts, getFullContextPayloads } from "../vector/contextFileVectorService";
import { aiContextRouter } from "./aiContextRouter";
import { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { jiraIntegrationService } from "./jiraIntegrationService";
import { linearIntegrationService } from "./linearIntegrationService";
import { aiUsageService } from "./aiUsageService";
import type { TaskMetadata } from "./taskMetadataTypes";
import { getPersonaInstructions } from "./personaService";
import { mcpClientService } from "./mcpClientService";

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
  type: z.string().optional(),
  dueDate: z.string().optional(),
  storyPoints: z
    .number()
    .optional()
    .describe("Fibonacci agile story points (1, 2, 3, 5, 8) estimated by complexity."),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("A list of other task titles that this task depends on."),
});

// Since nested self-referencing Zod schemas crash Gemini API JSON_schema generation, we limit it to 1 level of static depth:
const TranscriptTaskRawSchemaWithSubtasks = TranscriptTaskRawSchema.extend({
  subtasks: z.array(TranscriptTaskRawSchema).optional(),
});

const TranscriptAnalysisRawSchema = z.object({
  chainOfThought: z
    .string()
    .describe(
      "Your step-by-step internal reasoning. Think through the transcript context, persona context, and goals out loud before extracting tasks or summaries.",
    ),
  language: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
  sentiment: z
    .string()
    .optional()
    .describe(
      "Analyze the user's emotion or tone. MUST be one of: POSITIVE, NEUTRAL, NEGATIVE, MIXED",
    ),
  sentimentExplanation: z
    .string()
    .optional()
    .describe(
      "A 1-2 sentence text explanation of the overall sentiment, mood, and tone of the transcript.",
    ),
  tasks: z.array(TranscriptTaskRawSchemaWithSubtasks),
});

const transcriptAnalysisSchemaForGeneration: ZodTypeAny = z.object({
  chainOfThought: z
    .string()
    .describe(
      "Your step-by-step internal reasoning. Think through the transcript context, persona context, and goals out loud before extracting tasks or summaries.",
    ),
  language: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
  sentiment: z
    .string()
    .optional()
    .describe(
      "Analyze the user's emotion or tone. MUST be one of: POSITIVE, NEUTRAL, NEGATIVE, MIXED",
    ),
  sentimentExplanation: z
    .string()
    .optional()
    .describe(
      "A 1-2 sentence text explanation of the overall sentiment, mood, and tone of the transcript.",
    ),
  tasks: z.array(TranscriptTaskRawSchemaWithSubtasks),
});

export interface TranscriptAnalysis {
  chainOfThought?: string;
  language: string;
  title?: string;
  summary?: string;
  sentiment?: string;
  sentimentExplanation?: string;
  tasks: TranscriptTask[];
}

export interface TranscriptTask {
  title: string;
  summary?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  type?: TaskType;
  dueDate?: string;
  storyPoints?: number;
  dependencies?: string[];
  subtasks?: TranscriptTask[];
}

export interface CreateTranscriptInput {
  projectId: string;
  userId: string;
  content: string;
  title?: string | null;
  source: string;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  contextPrompt?: string | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER" | null;
  objective?: string | null;
  complexityLevel?: string | null;
  modelKey?: string | null;
  syncToJira?: boolean;
  syncToLinear?: boolean;
  workspaceId: string;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
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
  complexityLevel?: string;
  modelKey?: string | null;
}

export interface CreateStandaloneTranscriptResult {
  transcript: Transcript;
  analysis: TranscriptAnalysis;
}

export interface PendingTranscriptResult {
  transcript: Transcript;
}

export interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
  globalSpeaker?: string;
}

export interface Utterance {
  speaker: string;
  transcript: string;
  words: DeepgramWord[];
  start: number;
  end: number;
}

export class ProjectTranscriptService {
  private async diarizeAudio(
    micUrl: string | null,
    sysUrl: string | null,
  ): Promise<{ combinedText: string; utterances: Utterance[] }> {
    const deepgram = new DeepgramClient({ key: process.env.DEEPGRAM_API_KEY! });

    const resolveDiarization = async (url: string, speakerPrefix: string): Promise<Utterance[]> => {
      console.log(`[Diarization] Starting ${speakerPrefix} | url: ${url.slice(0, 80)}...`);
      try {
        const res = await deepgram.listen.prerecorded.transcribeUrl(
          { url },
          {
            diarize: true,
            model: "nova-3",
            smart_format: true,
            language: "multi",
            utterances: true,
            utt_split: 0.5,
            filler_words: false,
          },
        );
        if (res.error) {
          const e = res.error;
          const errMsg = e.message;
          logger.error(`[Diarization] Deepgram error for ${speakerPrefix}: ${errMsg}`);
          //throw new Error(`Deepgram API error: ${errMsg}`);
        }
        const meta = res.result?.metadata;
        const detectedLang = res.result?.results?.channels?.[0]?.detected_language ?? "?";
        const dgUtterances = res.result?.results?.utterances || [];
        const uniqueSpeakers = new Set(dgUtterances.map((u) => u.speaker)).size;
        console.log(
          `[Diarization] ${speakerPrefix} | lang=${detectedLang} duration=${(meta?.duration as number | undefined)?.toFixed(1) ?? "?"}s utterances=${dgUtterances.length} speakers=${uniqueSpeakers}`,
        );
        return dgUtterances.map((u) => ({
          speaker: `${speakerPrefix} ${u.speaker}`,
          transcript: u.transcript,
          start: u.start,
          end: u.end,
          words: u.words.map((w) => ({
            ...w,
            globalSpeaker: `${speakerPrefix} ${w.speaker}`,
          })),
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        logger.error(`[Diarization] Failed for ${speakerPrefix}: ${err?.message ?? err}`);
        return [];
      }
    };

    let micUtterances: Utterance[] = [];
    let sysUtterances: Utterance[] = [];

    console.log(`[Diarization] mic=${!!micUrl} sys=${!!sysUrl}`);
    if (micUrl) micUtterances = await resolveDiarization(micUrl, "User");
    if (sysUrl) sysUtterances = await resolveDiarization(sysUrl, "Others");

    // Merge chronologically by utterance start time
    const utterances = [...micUtterances, ...sysUtterances].sort((a, b) => a.start - b.start);

    const combinedText = utterances.map((u) => `${u.speaker}: ${u.transcript}`).join("\n");
    return { combinedText, utterances };
  }

  public async createPendingTranscript(
    input: CreateTranscriptInput,
  ): Promise<PendingTranscriptResult> {
    const finalMetadata =
      typeof input.metadata === "undefined" || input.metadata === null
        ? { processingStatus: "PENDING" }
        : { ...(input.metadata as Record<string, unknown>), processingStatus: "PENDING" };

    const transcript = await prisma.transcript.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        projectId: input.projectId || null,
        title: input.title || "Generating Transcript...",
        source: (input.source as TranscriptSource) ?? TranscriptSource.MANUAL,
        language: null,
        summary: null,
        transcript: input.content,
        recordedAt: input.recordedAt ?? null,
        metadata: finalMetadata as unknown as Prisma.JsonObject,
      },
    });

    return { transcript };
  }

  private async identifySpeaker(
    workspaceId: string,
    voiceProfileUrl: string,
    micUrl: string,
    utterances: Utterance[],
  ): Promise<string | null> {
    if (!voiceProfileUrl || voiceProfileUrl.startsWith("local://")) {
      logger.warn("[Voice AI] Skipping — voice profile not uploaded (old local:// profile).");
      return null;
    }

    logger.info(`[Voice AI] Identifying speaker via Gemini multimodal...`);

    try {
      const uniqueSpeakers = Array.from(new Set(utterances.map((u) => u.speaker)));
      if (uniqueSpeakers.length < 2) return uniqueSpeakers[0] ?? null;

      const [profileRes, meetingRes] = await Promise.all([fetch(voiceProfileUrl), fetch(micUrl)]);

      const profileBuffer = Buffer.from(await profileRes.arrayBuffer());
      const meetingBuffer = Buffer.from(await meetingRes.arrayBuffer());

      if (meetingBuffer.length > 10 * 1024 * 1024) {
        logger.warn(
          `[Voice AI] Meeting audio too large (${(meetingBuffer.length / 1024 / 1024).toFixed(1)}MB), skipping.`,
        );
        return null;
      }

      const profileMime = voiceProfileUrl.match(/\.(webm|ogg)/) ? "audio/webm" : "audio/mp4";
      const speakerList = uniqueSpeakers.join(", ");

      const { object } = await generateObject({
        model: await getWorkspaceModel(workspaceId),
        providerOptions: getFallbackProviderOptions(),
        schema: z.object({ matchedSpeaker: z.string() }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `File 1 is a short voice profile of a specific person. File 2 is a meeting recording with speakers labeled: ${speakerList}. Identify which speaker label in File 2 matches the voice in File 1. Reply with only the exact speaker label string.`,
              },
              { type: "file", data: profileBuffer, mediaType: profileMime },
              { type: "file", data: meetingBuffer, mediaType: "audio/wav" },
            ],
          },
        ],
      });

      const matched = String(object.matchedSpeaker).trim();
      if (uniqueSpeakers.includes(matched)) {
        logger.info(`[Voice AI] Matched: ${matched}`);
        return matched;
      }
      const fuzzy = uniqueSpeakers.find((s) => matched.includes(s) || s.includes(matched));
      logger.info(`[Voice AI] Fuzzy matched: ${fuzzy ?? "none"}`);
      return fuzzy ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      logger.error(`[Voice AI] Identification failed: ${e?.message ?? e}`);
      return null;
    }
  }

  public async processPendingTranscript(
    transcriptId: string,
    input: CreateTranscriptInput,
  ): Promise<CreateTranscriptResult> {
    const existing = await prisma.transcript.findUnique({ where: { id: transcriptId } });
    if (!existing) throw new Error("Transcript not found");

    let processedContent = input.content;
    let utterancesJson: Utterance[] | null = null;
    let durationSeconds: number | null = null;
    let speakerCount: number | null = null;

    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    let principalSpeaker: string | undefined;

    if (existing.rawMicUrl || existing.rawSysUrl) {
      logger.info(`Starting batch diarization for ${existing.id}...`);
      let { combinedText, utterances } = await this.diarizeAudio(
        existing.rawMicUrl,
        existing.rawSysUrl,
      );
      console.log(
        `[Diarization] Result: ${utterances.length} utterances, ${combinedText.length} chars`,
      );

      // Check for Voice Profile to enforce Speaker Identification
      if (existing.rawMicUrl && user?.voiceProfileUrl) {
        const matchedSpeaker = await this.identifySpeaker(
          input.workspaceId,
          user.voiceProfileUrl,
          existing.rawMicUrl,
          utterances,
        );

        if (matchedSpeaker && user.name) {
          logger.info(
            `[Voice AI] Overwriting matched speaker '${matchedSpeaker}' with verified identity '${user.name}'`,
          );

          principalSpeaker = user.name;

          // Replace in Utterances
          utterances = utterances.map((u) => ({
            ...u,
            speaker: u.speaker === matchedSpeaker ? user.name! : u.speaker,
          }));

          // Re-generate combined text
          combinedText = utterances.map((u) => `${u.speaker}: ${u.transcript}`).join("\n");
        }
      }

      if (!principalSpeaker && utterances.length > 0) {
        // Fallback to the first microphone speaker or the first speaker overall
        principalSpeaker =
          utterances.find((u) => u.speaker.toLowerCase().startsWith("user "))?.speaker ??
          utterances[0].speaker;
      }

      if (combinedText && utterances.length > 0) {
        processedContent = combinedText;
        utterancesJson = utterances;
        speakerCount = new Set(utterances.map((u) => u.speaker)).size;
        durationSeconds = Math.ceil(utterances[utterances.length - 1].end);
      }
    }

    const analysisRaw = await this.analyzeTranscript(
      input.userId,
      input.workspaceId,
      processedContent,
      input.contextPrompt ?? "",
      input.contextIds,
      input.persona ?? undefined,
      input.objective ?? undefined,
      input.complexityLevel ?? undefined,
      input.modelKey ?? undefined,
      input.taskStrategy ?? undefined,
      input.taskCount ?? undefined,
    );

    const result = await prisma.$transaction(async (tx) => {
      const currentMetadata = (existing.metadata as Record<string, unknown>) || {};
      const newMetadata = {
        ...currentMetadata,
        processingStatus: "COMPLETED",
        rawTasks: analysisRaw.tasks,
        sentimentExplanation: analysisRaw.sentimentExplanation,
        principalSpeaker,
      };

      const transcript = await tx.transcript.update({
        where: { id: transcriptId },
        data: {
          title:
            existing.title === "Generating Transcript..."
              ? analysisRaw.title || existing.title
              : existing.title,
          language: analysisRaw.language,
          summary: analysisRaw.summary ?? null,
          sentiment: analysisRaw.sentiment ?? null,
          durationSeconds: durationSeconds ?? null,
          speakerCount: speakerCount ?? null,
          metadata: newMetadata as unknown as Prisma.InputJsonValue,
          transcript: processedContent,
          utterances: (utterancesJson as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
        },
      });

      const createdTasks: Task[] = [];

      if (input.projectId) {
        for (const [index, taskCandidate] of analysisRaw.tasks.entries()) {
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
              type: this.resolveTaskType(taskCandidate.type),
              position: index,
              startDate,
              dueDate,
              storyPoints: taskCandidate.storyPoints ?? null,
              metadata: {
                generatedFromTranscriptId: transcript.id,
                generatorVersion: "session-transcript-service@2",
              } satisfies Prisma.JsonObject,
            },
          });
          createdTasks.push(createdTask);

          // Save Subtasks Hierarchically
          if (taskCandidate.subtasks && taskCandidate.subtasks.length > 0) {
            for (const [subIndex, subTaskCandidate] of taskCandidate.subtasks.entries()) {
              const subStartDate = this.resolveStartDate(input.recordedAt);
              const subDueDate = this.resolveDueDate(
                subTaskCandidate.dueDate,
                subTaskCandidate.priority,
                subStartDate,
              );
              const createdSubTask = await tx.task.create({
                data: {
                  projectId: input.projectId!,
                  parentId: createdTask.id,
                  title: subTaskCandidate.title,
                  description: subTaskCandidate.description ?? null,
                  summary: subTaskCandidate.summary ?? null,
                  acceptanceCriteria: subTaskCandidate.acceptanceCriteria ?? null,
                  priority: this.resolveTaskPriority(subTaskCandidate.priority),
                  status: this.resolveTaskStatus(subTaskCandidate.status),
                  type: this.resolveTaskType(subTaskCandidate.type),
                  position: subIndex,
                  startDate: subStartDate,
                  dueDate: subDueDate,
                  storyPoints: subTaskCandidate.storyPoints ?? null,
                  metadata: {
                    generatedFromTranscriptId: transcript.id,
                    generatorVersion: "session-transcript-service@2",
                  } satisfies Prisma.JsonObject,
                },
              });
              createdTasks.push(createdSubTask);
            }
          }
        }

        if (createdTasks.length > 0) {
          await tx.taskTranscriptLink.createMany({
            data: createdTasks.map((task) => ({
              taskId: task.id,
              transcriptId: transcript.id,
            })),
          });

          // Resolve string-based dependencies to actual created Task IDs
          for (let i = 0; i < analysisRaw.tasks.length; i++) {
            const candidateDeps = analysisRaw.tasks[i].dependencies;
            if (candidateDeps && candidateDeps.length > 0) {
              const currentTaskId = createdTasks[i].id;
              const validDependantIds = candidateDeps
                .map(
                  (depTitle: string) =>
                    createdTasks.find((ct) => ct.title.toLowerCase() === depTitle.toLowerCase())
                      ?.id,
                )
                .filter((id: string | undefined): id is string => Boolean(id));

              if (validDependantIds.length > 0) {
                await tx.taskDependency.createMany({
                  data: validDependantIds.map((depId: string) => ({
                    taskId: currentTaskId,
                    dependsOnTaskId: depId,
                    type: "BLOCKS",
                  })),
                });
              }
            }
          }
        }
      }

      return { transcript, createdTasks };
    });

    // Auto-Sync extraction to active integrations (if defaults exist)
    if (result.createdTasks.length > 0) {
      this.autoSyncTasks(input.userId, result.createdTasks, {
        syncToJira: input.syncToJira,
        syncToLinear: input.syncToLinear,
      }).catch((err) => {
        logger.warn("Failed to auto-sync tasks for transcript import", err);
      });
    }

    return {
      transcript: result.transcript,
      tasks: result.createdTasks,
      analysis: analysisRaw,
    };
  }

  public async analyzeTranscript(
    userId: string,
    workspaceId: string,
    content: string,
    contextPrompt: string,
    contextIds?: string[],
    persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
    objective?: string,
    complexityLevel?: string,
    modelKey?: string,
    taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT",
    taskCount?: number,
  ): Promise<TranscriptAnalysis> {
    const activeModel = modelKey || DEFAULT_AI_MODEL;
    const model = await getWorkspaceModel(workspaceId, activeModel);
    const todayIso = new Date().toISOString().split("T")[0];

    // RAG vs Fast-Track Router
    let dynamicContext = "";
    if (contextIds && contextIds.length > 0) {
      try {
        const routerResult = await aiContextRouter.decideStrategy(contextIds, activeModel);

        if (routerResult.strategy === "FULL_INJECTION") {
          logger.info(
            `ContextRouter bypassed RAG. Using FULL_INJECTION for ${routerResult.estimatedTokens} estimated tokens.`,
          );
          const fullChunks = await getFullContextPayloads(contextIds);
          if (fullChunks.length > 0) {
            dynamicContext = `\n[FULL CONTEXT INJECTED]:\n${fullChunks.join("\n\n")}\n`;
          }
        } else {
          logger.info(
            `ContextRouter triggered RAG for ${routerResult.estimatedTokens} estimated tokens.`,
          );
          // RAG: Query context vectors using 500 chars as query
          const query = content.slice(0, 500);
          const maxChunks = getMaxContextChunks(activeModel);
          const chunks = await queryContexts(contextIds, query, maxChunks);
          if (chunks.length > 0) {
            dynamicContext = `\nRetrieved targeted context snippets from knowledge base:\n${chunks.join("\n\n")}\n`;
          }
        }
      } catch (error) {
        logger.warn("Failed to retrieve dynamic context for transcript", error);
      }
    }

    let finalContextSection =
      (contextPrompt ? `Relevant context:\n${contextPrompt}\n\n` : "") + dynamicContext;

    // Step 1: Optional Agentic Investigation via MCP
    const tools = mcpClientService.getAiTools();
    if (tools) {
      try {
        logger.info(`Starting Two-Step Agentic Investigation for Transcript`);
        const investigation = await generateText({
          model,
          providerOptions: getFallbackProviderOptions(activeModel),
          tools,
          stopWhen: stepCountIs(3),
          system:
            "You are an AI Software Architect. The user is generating Agile task tickets from a transcript or request. Use your tools to query the codebase knowledge graph and gather relevant structural context (e.g. affected components, database models, related execution flows). Summarize your findings so the task generator can write highly accurate, technically specific acceptance criteria.",
          prompt: `Transcript/Request:\n${content}\n\nObjective: ${objective ?? "Extract tasks"}\n\nPlease investigate the codebase to gather any missing structural context.`,
        });

        if (investigation.text) {
          finalContextSection += `\n\n### Codebase Investigation Context:\n${investigation.text}\n`;
        }
      } catch (err) {
        logger.error("Failed during MCP agentic investigation step for transcript", err);
      }
    }

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

    // Inject Custom User Personas and Instructions
    personaInstructions += await getPersonaInstructions(userId, workspaceId);

    const objectiveSection = objective
      ? `\nPRIMARY OBJECTIVE / MAIN PROMPT:\n"${objective}"\n\nIMPORTANT: The user has provided the above objective. This is the MOST IMPORTANT instruction. Prioritize this objective over the transcript content. If the transcript implies 3 tasks but the objective says "create one task", you MUST follow the objective.`
      : "";

    let strategyInstruction = "";
    if (taskStrategy === "AUTO" || !taskStrategy) {
      strategyInstruction = `\nAGILE SLICE & DICE (AUTO MODE): If the transcript covers a large complex feature, decompose it into 1 macro "EPIC" Task. Place 3 to 6 specialized sub-tasks inside that Epic's 'subtasks' array (e.g., Frontend, Backend, DevOps tasks). Ensure you assign fibonacci storyPoints (1, 2, 3, 5, 8) based on technical complexity (e.g. database schema changes = 5 pts, simple UI tweak = 1 pt).`;
    } else if (taskStrategy === "SINGLE_TICKET") {
      strategyInstruction = `\nAGILE MEGA-TICKET MODE: You MUST extract exactly ONE single macro ticket (type: "EPIC" or "STORY") that houses all notes and acceptance criteria inside its description. DO NOT generate subtasks.`;
    } else if (taskStrategy === "SPECIFIC_COUNT") {
      const count = taskCount || 5;
      strategyInstruction = `\nAGILE FIXED MODE: You MUST extract EXACTLY ${count} standalone task tickets (type: "TASK" or "STORY"). DO NOT generate subtasks. DO NOT generate an Epic.`;
    }

    let complexityLevelInstruction = "";
    if (complexityLevel) {
      complexityLevelInstruction = `\nIMPORTANT: Adjust the grammatical complexity of the validation steps and descriptions to match a "${complexityLevel}" level.`;
    }

    const prompt = `Today is ${todayIso}. ${personaInstructions}

Analyze the following transcript/request and the provided codebase context.

1. Detect the predominant human language (ISO name, e.g. "english" or "spanish").
2. GENERATE a short, representative title for the transcript (max 10 words).
3. Provide a succinct summary (max 80 words).
4. Extract or GENERATE actionable tasks:
   - Each task MUST have a clear title.
   - **summary**: REQUIRED. A concise, 1-sentence overview of the task (max 20 words).
   - **description**: Detailed technical steps or context.
   - **acceptanceCriteria**: REQUIRED. A markdown list of verifiable conditions for success.
   - status (${TASK_STATUS_LIST}) and priority (${TASK_PRIORITY_LIST}).
   - **type**: Evaluate the nature of the work and assign it either "TASK", "BUG", or "STORY".

CRITICAL LANGUAGE RULE: The generated title, summary, task titles, descriptions, and acceptance criteria MUST be written entirely in the detected predominant human language of the transcript. If the transcript is spoken in Spanish, ALL output fields must be in Spanish!


Do NOT guess due dates. Only populate dueDate if explicitly mentioned.
${complexityLevelInstruction}
${strategyInstruction}

${objectiveSection}

${finalContextSection}

Transcript/Request:
${content}`;

    try {
      const { object, usage } = await generateObject({
        model,
        providerOptions: getFallbackProviderOptions(activeModel),
        schema: transcriptAnalysisSchemaForGeneration,
        prompt,

        temperature: 0.2,
        maxRetries: 3,
        maxOutputTokens: 8192,
      });

      if (usage) {
        aiUsageService
          .logUsage({
            userId,
            workspaceId,
            feature: "TRANSCRIPT",
            provider: "openrouter",
            model: activeModel,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
          })
          .catch(() => {});
      }

      const parsed = TranscriptAnalysisRawSchema.parse(object);

      // Log the AI's internal reasoning block to trace logic execution
      logger.info(`[AI Thinking Mode]: ${parsed.chainOfThought}`);

      return {
        chainOfThought: parsed.chainOfThought,
        language: parsed.language,
        title: parsed.title,
        summary: parsed.summary,
        sentiment: parsed.sentiment,
        sentimentExplanation: parsed.sentimentExplanation,
        tasks: parsed.tasks.map((task) => ({
          title: task.title,
          summary: task.summary,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          priority: this.normalizeTaskPriority(task.priority),
          status: this.normalizeTaskStatus(task.status),
          type: this.normalizeTaskType(task.type),
          dueDate: task.dueDate,
          storyPoints: task.storyPoints,
          dependencies: task.dependencies,
          subtasks: task.subtasks?.map((subtask) => ({
            title: subtask.title,
            summary: subtask.summary,
            description: subtask.description,
            acceptanceCriteria: subtask.acceptanceCriteria,
            priority: this.normalizeTaskPriority(subtask.priority),
            status: this.normalizeTaskStatus(subtask.status),
            type: this.normalizeTaskType(subtask.type),
            dueDate: subtask.dueDate,
            storyPoints: subtask.storyPoints,
            dependencies: subtask.dependencies,
          })),
        })),
      } satisfies TranscriptAnalysis;
    } catch (error: unknown) {
      logger.error("Failed to analyse transcript with OpenAI", error);
      return {
        chainOfThought:
          "Fallback: AI failed to parse the transcript natively due to schema violations or maxToken aborts.",
        title: "Processing Error (Incomplete AI Output)",
        summary:
          "The AI encountered an error while formatting tasks (Unterminated JSON String). Please try again or provide a shorter audio clip.",
        sentiment: "NEUTRAL",
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

  private resolveTaskType(type?: string): TaskType {
    if (!type) return TaskType.TASK;
    const normalized = type.toUpperCase().replace(/\s+/g, "_");
    if (Object.values(TaskType).includes(normalized as TaskType)) {
      return normalized as TaskType;
    }
    return TaskType.TASK;
  }

  private normalizeTaskType(type?: string): TaskType | undefined {
    if (!type) return undefined;
    const normalized = type.toUpperCase().replace(/\s+/g, "_");
    if (Object.values(TaskType).includes(normalized as TaskType)) {
      return normalized as TaskType;
    }
    return undefined;
  }

  private async autoSyncTasks(
    userId: string,
    tasks: Task[],
    options?: { syncToJira?: boolean; syncToLinear?: boolean },
  ): Promise<void> {
    const integrations = await prisma.userIntegration.findMany({
      where: {
        userId,
        status: IntegrationStatus.CONNECTED,
      },
    });

    if (integrations.length === 0) return;

    for (const integration of integrations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata: any = integration.metadata || {};
      if (!metadata) continue;

      try {
        if (
          integration.provider === IntegrationProvider.JIRA &&
          metadata.defaultProjectId &&
          options?.syncToJira !== false
        ) {
          for (const task of tasks) {
            const syncResult = await jiraIntegrationService.createJiraIssue(
              userId,
              task.id,
              metadata.defaultProjectId,
            );
            await this.updateTaskTargetMetadata(task.id, "jira", {
              issueId: syncResult.issueId,
              issueKey: syncResult.issueKey,
              url: syncResult.url,
            });
          }
        } else if (
          integration.provider === IntegrationProvider.LINEAR &&
          metadata.defaultTeamId &&
          options?.syncToLinear !== false
        ) {
          for (const task of tasks) {
            const syncResult = await linearIntegrationService.createLinearIssue(
              userId,
              task.id,
              metadata.defaultTeamId,
            );
            await this.updateTaskTargetMetadata(task.id, "linear", {
              issueId: syncResult.issueId,
              identifier: syncResult.identifier,
              url: syncResult.url,
            });
          }
        }
      } catch (error) {
        logger.error(`Auto-sync failed for ${integration.provider}`, error);
      }
    }
  }

  private async updateTaskTargetMetadata(
    taskId: string,
    provider: "jira" | "linear",
    payload: unknown,
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { metadata: true },
    });
    if (!task) return;

    const existingMetadata = (task.metadata as unknown as TaskMetadata) || {};

    if (provider === "jira") {
      existingMetadata.jira = payload as TaskMetadata["jira"];
    } else if (provider === "linear") {
      existingMetadata.linear = payload as TaskMetadata["linear"];
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: existingMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export const projectTranscriptService = new ProjectTranscriptService();
