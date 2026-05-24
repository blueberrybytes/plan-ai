/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { generateText, generateObject, stepCountIs } from "ai";
import { z, type ZodTypeAny } from "zod";
import { DeepgramClient } from "@deepgram/sdk";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts, getFullContextPayloads } from "../vector/contextFileVectorService";
import { aiContextRouter } from "./aiContextRouter";
import { resolveProjectIdsToContextIds } from "./projectContextResolver";
import { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { jiraIntegrationService } from "./jiraIntegrationService";
import { linearIntegrationService } from "./linearIntegrationService";
import { trelloIntegrationService } from "./trelloIntegrationService";
import { notionIntegrationService } from "./notionIntegrationService";
import { asanaIntegrationService } from "./asanaIntegrationService";
import { googleIntegrationService } from "./googleIntegrationService";
import { microsoftIntegrationService } from "./microsoftIntegrationService";
import { DocumentGenerator } from "../utils/documentGenerator";
import { docGenerationService } from "./docGenerationService";
import { slideGenerationService } from "./slideGenerationService";
import { aiUsageService } from "./aiUsageService";
import type { TaskMetadata } from "./taskMetadataTypes";
import type {
  PostMeetingTaskKind,
  PostMeetingTaskStatus,
  PostMeetingTasksRecord,
  SpeakerInsight,
} from "./transcriptMetadataTypes";
import type {
  JiraIntegrationMetadata,
  LinearIntegrationMetadata,
  TrelloIntegrationMetadata,
  AsanaIntegrationMetadata,
} from "./integrationMetadataTypes";
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
  description: z.string().min(1),
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
  keyPoints: z
    .array(z.string())
    .optional()
    .describe(
      "A list of 3-7 key points, pain points, or critical insights discussed in the meeting.",
    ),
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
  keyPoints: z
    .array(z.string())
    .optional()
    .describe(
      "A list of 3-7 key points, pain points, or critical insights discussed in the meeting.",
    ),
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
  keyPoints?: string[];
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
  syncToTrello?: boolean;
  syncToNotion?: boolean;
  syncToAsana?: boolean;
  exportToGoogleDrive?: boolean;
  exportToOneDrive?: boolean;
  workspaceId: string;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  agenticInvestigation?: boolean;
  createDoc?: boolean;
  createSlides?: boolean;
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
  ): Promise<{ combinedText: string; utterances: Utterance[]; totalSeconds: number }> {
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
    const totalSeconds =
      utterances.length > 0 ? Math.ceil(utterances[utterances.length - 1].end) : 0;

    return { combinedText, utterances, totalSeconds };
  }

  public async createPendingTranscript(
    input: CreateTranscriptInput,
  ): Promise<PendingTranscriptResult> {
    const finalMetadata =
      typeof input.metadata === "undefined" || input.metadata === null
        ? { processingStatus: "PENDING" }
        : { ...(input.metadata as Record<string, unknown>), processingStatus: "PENDING" };

    // Auto-derive contextIds from the projectId if the caller didn't supply
    // any. After the Context→Project refactor most callers only know the
    // project; the project's paired Context is what feeds RAG and AI tasks.
    let contextIds = input.contextIds ?? [];
    if (contextIds.length === 0 && input.projectId) {
      contextIds = await resolveProjectIdsToContextIds([input.projectId]);
    }

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
        contextIds,
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
      logger.warn(
        "[Voice Biometrics] Skipping — voice profile not uploaded (old local:// profile).",
      );
      return null;
    }

    logger.info(`[Voice Biometrics] Identifying speaker via SpeechBrain microservice...`);

    try {
      const uniqueSpeakers = Array.from(new Set(utterances.map((u) => u.speaker)));
      if (uniqueSpeakers.length < 2) return uniqueSpeakers[0] ?? null;

      const formData = new FormData();
      formData.append("profile_url", voiceProfileUrl);
      formData.append("meeting_url", micUrl);

      // Call the Python Microservice
      const voiceAiUrl = process.env.VOICE_AI_URL || "http://localhost:8001";
      const verifyRes = await fetch(`${voiceAiUrl}/verify`, {
        method: "POST",
        body: formData,
      });

      if (!verifyRes.ok) {
        const errorText = await verifyRes.text();
        throw new Error(`Python service returned ${verifyRes.status}: ${errorText}`);
      }

      const result = await verifyRes.json();
      logger.info(
        `[Voice Biometrics] Result: Match=${result.match}, Score=${result.score.toFixed(3)}`,
      );

      if (result.match) {
        // Since the current SpeechBrain model only compares Profile vs Whole Meeting,
        // and returns a boolean if the profile voice is present in the meeting.
        // We need to match it to a specific speaker.
        // Wait, the meetingUrl is the RAW meeting url (mixed speakers).
        // Let's fallback to assigning the principal speaker based on the first "User " utterance,
        // since the Python service currently only tells us IF the user is in the meeting.
        // To be precise, we'd need to send the individual speaker clips to the Python service.
        // For now, if the Python service confirms the voice is in the meeting,
        // we'll assign it to the primary microphone user.
        const likelySpeaker =
          uniqueSpeakers.find((s) => s.toLowerCase().startsWith("user ")) ?? uniqueSpeakers[0];
        logger.info(`[Voice Biometrics] Assigned verified profile to: ${likelySpeaker}`);
        return likelySpeaker;
      }

      return null;
    } catch (e: any) {
      logger.error(`[Voice Biometrics] Identification failed: ${e?.message ?? e}`);
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
      const diarizationResult = await this.diarizeAudio(existing.rawMicUrl, existing.rawSysUrl);
      let { combinedText, utterances } = diarizationResult;
      const { totalSeconds } = diarizationResult;

      // Log Deepgram Usage
      if (totalSeconds > 0) {
        aiUsageService
          .logUsage({
            userId: input.userId,
            workspaceId: input.workspaceId,
            feature: "RECORDER",
            provider: "DEEPGRAM",
            model: "nova-3-prerecorded",
            inputTokens: totalSeconds,
            outputTokens: 0,
          })
          .catch((err) => logger.warn("Failed to log Deepgram diarization usage:", err));
      }

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

    // PHASE 1: Fast Summary to Unlock UI Early
    try {
      const fastModel = await getWorkspaceModel(input.workspaceId, "openai/gpt-4o-mini");
      const { object: fastParsed, usage } = await generateObject({
        model: fastModel,
        providerOptions: getFallbackProviderOptions("openai/gpt-4o-mini"),
        schema: z.object({
          title: z.string(),
          language: z.string(),
          summary: z.string(),
        }),
        system:
          "Extract a short title (max 6 words), language (e.g. 'english'), and a 2-sentence summary.",
        prompt: `Transcript:\n${processedContent.slice(0, 8000)}`,
        maxRetries: 1,
      });

      if (usage) {
        aiUsageService
          .logUsage({
            userId: input.userId,
            workspaceId: input.workspaceId,
            feature: "TASK_EXTRACTION",
            provider: "openrouter", // or get fallback provider
            model: "openai/gpt-4o-mini",
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
          })
          .catch(() => {});
      }

      const currentMetadata = (existing.metadata as Record<string, unknown>) || {};
      await prisma.transcript.update({
        where: { id: transcriptId },
        data: {
          title: existing.title === "Generating Transcript..." ? fastParsed.title : existing.title,
          language: fastParsed.language,
          summary: fastParsed.summary,
          transcript: processedContent,
          durationSeconds: durationSeconds ?? null,
          speakerCount: speakerCount ?? null,
          utterances: (utterancesJson as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
          metadata: {
            ...currentMetadata,
            processingStatus: "EXTRACTING_TASKS",
            principalSpeaker,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      logger.info(`Fast summary generated and UI unlocked for ${existing.id}`);
    } catch (err) {
      logger.warn(`Fast summary failed, falling back to basic UI unlock for ${existing.id}`, err);
      const currentMetadata = (existing.metadata as Record<string, unknown>) || {};
      await prisma.transcript.update({
        where: { id: transcriptId },
        data: {
          transcript: processedContent,
          durationSeconds: durationSeconds ?? null,
          speakerCount: speakerCount ?? null,
          utterances: (utterancesJson as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
          metadata: {
            ...currentMetadata,
            processingStatus: "EXTRACTING_TASKS",
            principalSpeaker,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // PHASE 2: Heavy Task Extraction + Speaker Insights (in parallel).
    // Both reads from the same transcript, both ~30s LLM calls — racing them
    // shaves the worst-case latency in half.
    const [analysisRaw, speakerInsights] = await Promise.all([
      this.analyzeTranscript(
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
        input.agenticInvestigation ?? true,
        transcriptId,
      ),
      this.extractSpeakerInsights(
        input.workspaceId,
        utterancesJson ?? [],
        processedContent,
        principalSpeaker,
        input.modelKey ?? undefined,
      ),
    ]);

    const result = await prisma.$transaction(async (tx) => {
      const currentMetadata = (existing.metadata as Record<string, unknown>) || {};

      // Build transcript-level graph trace: AI → Recording → all tasks
      const transcriptGraphNodes: Prisma.JsonArray = [
        { id: "ai", name: "Plan AI Extractor", group: "function", val: 30 },
        { id: "recording", name: existing.title || "Recording", group: "database", val: 25 },
      ];
      const transcriptGraphLinks: Prisma.JsonArray = [{ source: "ai", target: "recording" }];
      for (const [idx, taskCandidate] of analysisRaw.tasks.entries()) {
        const taskId = `task-${idx}`;
        const taskName =
          taskCandidate.title.length > 25
            ? taskCandidate.title.substring(0, 25) + "..."
            : taskCandidate.title;
        transcriptGraphNodes.push({ id: taskId, name: taskName, group: "ticket", val: 18 });
        transcriptGraphLinks.push({ source: "recording", target: taskId });
      }

      const newMetadata = {
        ...currentMetadata,
        processingStatus: "COMPLETED",
        rawTasks: analysisRaw.tasks,
        keyPoints: analysisRaw.keyPoints,
        sentimentExplanation: analysisRaw.sentimentExplanation,
        principalSpeaker,
        // Speakers tab fuel — empty array when there are no diarized
        // utterances (text-only transcripts).
        speakers: speakerInsights,
        aiGraphTrace: {
          nodes: transcriptGraphNodes,
          links: transcriptGraphLinks,
        },
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
                aiGraphTrace: {
                  nodes: [
                    { id: "ai", name: "Plan AI Extractor", group: "function" as const, val: 30 },
                    {
                      id: "transcript",
                      name: transcript.title || "Recording",
                      group: "database" as const,
                      val: 25,
                    },
                    {
                      id: `task-${index}`,
                      name:
                        taskCandidate.title.length > 25
                          ? taskCandidate.title.substring(0, 25) + "..."
                          : taskCandidate.title,
                      group: "ticket" as const,
                      val: 20,
                    },
                  ],
                  links: [
                    { source: "ai", target: "transcript" },
                    { source: "transcript", target: `task-${index}` },
                  ],
                },
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

    if (result.createdTasks.length > 0) {
      this.autoSyncTasks(input.workspaceId, result.transcript, result.createdTasks, {
        syncToJira: input.syncToJira,
        syncToLinear: input.syncToLinear,
        syncToTrello: input.syncToTrello,
        syncToNotion: input.syncToNotion,
        syncToAsana: input.syncToAsana,
      }).catch((err) => {
        logger.error(
          `Failed to auto-sync tasks for transcript ${result.transcript.id}`,
          err,
        );
      });
    }

    // Auto-Export Document to Cloud Storage
    if (input.exportToGoogleDrive || input.exportToOneDrive) {
      this.autoExportDocument(input.workspaceId, result.transcript, analysisRaw, {
        exportToGoogleDrive: input.exportToGoogleDrive,
        exportToOneDrive: input.exportToOneDrive,
      }).catch((err) => {
        logger.error(
          `Failed to auto-export document to cloud storage for transcript ${result.transcript.id}`,
          err,
        );
      });
    }

    // Auto-Generate Document
    if (input.createDoc) {
      void this.setPostMeetingTaskStatus(result.transcript.id, "doc", { status: "PENDING" });
      // Seed the doc with the best available title. The transcript title may
      // still be the "Generating Transcript..." placeholder if the AI summary
      // step couldn't derive one — in that case fall back to the summary
      // snippet so the doc doesn't inherit the placeholder.
      const transcriptTitle = result.transcript.title?.trim();
      const isPlaceholderTitle =
        !transcriptTitle || transcriptTitle === "Generating Transcript...";
      const summarySnippet = analysisRaw?.summary?.trim().slice(0, 80);
      const seedTitle = !isPlaceholderTitle
        ? transcriptTitle
        : summarySnippet && summarySnippet.length > 3
          ? summarySnippet
          : "Meeting Document";
      docGenerationService
        .startGeneration(input.userId, input.workspaceId, {
          title: seedTitle,
          prompt: `Generate a comprehensive meeting document based on the following transcript summary and extracted tasks. Ensure the language and style are highly corporate, formal, and professional.`,
          transcriptIds: [result.transcript.id],
          contextIds: input.contextIds,
        })
        .then(async (doc) => {
          logger.info(`Auto-generated document ${doc.id} for transcript ${result.transcript.id}`);
          const publicUrl = `/doc/public/${doc.id}`;
          await this.setPostMeetingTaskStatus(result.transcript.id, "doc", {
            status: "OK",
            url: `/docs/view/${doc.id}`,
          });

          for (const task of result.createdTasks) {
            const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
            if (currentTask) {
              const metadata: TaskMetadata = (currentTask.metadata as TaskMetadata) ?? {};
              metadata.publicDocUrl = publicUrl;
              await prisma.task.update({
                where: { id: task.id },
                data: { metadata: metadata as Prisma.InputJsonObject }
              });
            }
          }
        })
        .catch(async (err) => {
          logger.error(
            `Failed to auto-generate document for transcript ${result.transcript.id}`,
            err,
          );
          await this.setPostMeetingTaskStatus(result.transcript.id, "doc", {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    // Auto-Generate Slides
    if (input.createSlides) {
      void this.setPostMeetingTaskStatus(result.transcript.id, "slides", { status: "PENDING" });
      slideGenerationService
        .startPresentationGeneration(
          input.userId,
          input.workspaceId,
          undefined, // templateId
          undefined, // themeId
          input.contextIds ?? [],
          [result.transcript.id], // transcriptIds
          `Create a presentation summarizing the key points, decisions, and action items from the meeting.`,
          result.transcript.title || "Meeting Slides",
        )
        .then(async (pres) => {
          logger.info(`Auto-generated slides ${pres.id} for transcript ${result.transcript.id}`);
          const publicUrl = `/p/${pres.id}`;
          await this.setPostMeetingTaskStatus(result.transcript.id, "slides", {
            status: "OK",
            url: `/presentations/${pres.id}`,
          });

          for (const task of result.createdTasks) {
            const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
            if (currentTask) {
              const metadata: TaskMetadata = (currentTask.metadata as TaskMetadata) ?? {};
              metadata.publicSlidesUrl = publicUrl;
              await prisma.task.update({
                where: { id: task.id },
                data: { metadata: metadata as Prisma.InputJsonObject }
              });
            }
          }
        })
        .catch(async (err) => {
          logger.error(
            `Failed to auto-generate slides for transcript ${result.transcript.id}`,
            err,
          );
          await this.setPostMeetingTaskStatus(result.transcript.id, "slides", {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          });
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
    agenticInvestigation: boolean = true,
    /** Optional transcript id to exclude from the "previous meetings" lookup — the one being analyzed right now. */
    excludeTranscriptId?: string,
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

      // Also include previous meetings attached to the same context(s) so task
      // generation can reference prior decisions, action items, and history.
      // Excludes the transcript currently being analyzed.
      try {
        const previousMeetings = await prisma.transcript.findMany({
          where: {
            workspaceId,
            contextIds: { hasSome: contextIds },
            ...(excludeTranscriptId ? { id: { not: excludeTranscriptId } } : {}),
          },
          select: {
            id: true,
            title: true,
            summary: true,
            transcript: true,
            recordedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10, // cap so we don't blow the context window
        });

        if (previousMeetings.length > 0) {
          const blocks = previousMeetings.map((t) => {
            const heading = `## Previous Meeting: ${t.title || "Untitled"}${
              t.recordedAt ? ` (${new Date(t.recordedAt).toISOString().slice(0, 10)})` : ""
            }`;
            const body = t.summary?.trim()
              ? t.summary
              : (t.transcript ?? "").slice(0, 3000);
            return `${heading}\n${body}`;
          });
          const previousSection = `\n\nPrevious Meetings on Selected Contexts (most recent first):\n${blocks.join(
            "\n\n---\n\n",
          )}\n`;
          dynamicContext += previousSection;
          logger.info(
            `Included ${previousMeetings.length} previous meetings in task-generation context`,
          );
        }
      } catch (error) {
        logger.warn("Failed to retrieve previous meetings for task generation", error);
      }
    }

    let finalContextSection =
      (contextPrompt ? `Relevant context:\n${contextPrompt}\n\n` : "") + dynamicContext;

    // Step 1: Optional Agentic Investigation via MCP
    const tools = agenticInvestigation ? mcpClientService.getAiTools() : undefined;
    if (tools) {
      try {
        logger.info(`Starting Two-Step Agentic Investigation for Transcript using fast model`);
        const fastModel = await getWorkspaceModel(workspaceId, "openai/gpt-4o-mini");
        const investigation = await generateText({
          model: fastModel,
          providerOptions: getFallbackProviderOptions("openai/gpt-4o-mini"),
          tools,
          stopWhen: stepCountIs(3),
          system:
            "You are an AI Software Architect. The user is generating Agile task tickets from a transcript or request. IF the request is a simple, non-technical business or life task (like sending an email, scheduling a meeting, calling someone), DO NOT query the codebase. Simply return 'No codebase context needed.' OTHERWISE, use your tools to query the codebase knowledge graph and gather relevant structural context (e.g. affected components, database models, related execution flows). Summarize your findings so the task generator can write highly accurate, technically specific acceptance criteria.",
          prompt: `Transcript/Request:\n${content}\n\nObjective: ${objective ?? "Extract tasks"}\n\nPlease investigate the codebase ONLY IF this is a technical software task to gather any missing structural context.`,
        });

        if (investigation.text) {
          finalContextSection += `\n\n### Codebase Investigation Context:\n${investigation.text}\n`;
        }

        aiUsageService
          .logUsage({
            userId,
            workspaceId,
            feature: "TASK_EXTRACTION",
            provider: "openrouter",
            model: "openai/gpt-4o-mini",
            inputTokens: investigation.totalUsage?.inputTokens || 0,
            outputTokens: investigation.totalUsage?.outputTokens || 0,
          })
          .catch(() => {});
      } catch (err) {
        if (err instanceof Error && (err.message.includes("Missing Authentication header") || err.message.includes("401"))) {
          logger.warn("Auth error during MCP agentic investigation step (skipping)", err.message);
        } else {
          logger.error("Failed during MCP agentic investigation step for transcript", err);
        }
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

    let object;
    let totalUsage;

    try {
      let attempt = 0;
      const maxManualRetries = 3;

    while (attempt < maxManualRetries) {
      try {
        const result = await generateObject({
          model,
          providerOptions: getFallbackProviderOptions(activeModel),
          schema: transcriptAnalysisSchemaForGeneration,
          prompt,

          temperature: 0.2,
          maxRetries: 2,
        });
        object = result.object;
        totalUsage = result.usage;
        break;
      } catch (error: any) {
        attempt++;
        const isSocketDisconnect = 
          error?.name === "AI_APICallError" && 
          error?.message?.includes("Failed to process successful response");
          
        if (isSocketDisconnect && attempt < maxManualRetries) {
          logger.warn(`LLM API socket closed prematurely (attempt ${attempt}/${maxManualRetries}). Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }
        
        throw error;
      }
    }

      if (totalUsage) {
        aiUsageService
          .logUsage({
            userId,
            workspaceId,
            feature: "TRANSCRIPT",
            provider: "openrouter",
            model: activeModel,
            inputTokens: totalUsage.inputTokens || 0,
            outputTokens: totalUsage.outputTokens || 0,
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
      const isAuthError = error instanceof Error && (error.message.includes("Missing Authentication header") || error.message.includes("401"));
      
      if (isAuthError) {
        logger.warn("OpenRouter API key is invalid or missing.", (error as Error).message);
        return {
          chainOfThought: "The provided OpenRouter API key is invalid or revoked.",
          title: "Authentication Error",
          summary: "Your OpenRouter API key is invalid or revoked. Please update it in your Workspace Settings.",
          sentiment: "NEUTRAL",
          language: "unknown",
          tasks: [],
        } satisfies TranscriptAnalysis;
      }

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

  /**
   * Ask the LLM to attribute each diarized speaker to a real name, role, and
   * personality summary. Falls back to "Speaker N" when no name can be
   * confidently inferred. Compute speaking-time + utterance-count from the
   * raw utterance list (deterministic, not from the LLM).
   *
   * Returns [] if utterances is empty (text-only transcripts can't be
   * diarized, so nothing to insight on).
   */
  public async extractSpeakerInsights(
    workspaceId: string,
    utterances: Utterance[],
    fullTranscript: string,
    principalSpeakerLabel: string | undefined,
    modelKey?: string,
  ): Promise<SpeakerInsight[]> {
    if (!utterances || utterances.length === 0) return [];

    // Compute deterministic stats per speaker first (don't trust the LLM with
    // numbers it could easily get wrong).
    const stats = new Map<string, { seconds: number; count: number }>();
    for (const u of utterances) {
      const cur = stats.get(u.speaker) ?? { seconds: 0, count: 0 };
      cur.seconds += Math.max(0, (u.end ?? 0) - (u.start ?? 0));
      cur.count += 1;
      stats.set(u.speaker, cur);
    }
    const speakerLabels = Array.from(stats.keys());

    // Build a compact transcript view the LLM can scan for name cues. We cap
    // each utterance to 280 chars and the whole prompt to ~25k so big
    // meetings still fit.
    const MAX_PROMPT_CHARS = 25000;
    let transcriptForLLM = "";
    for (const u of utterances) {
      const snippet = (u.transcript ?? "").trim().slice(0, 280);
      const line = `${u.speaker}: ${snippet}\n`;
      if (transcriptForLLM.length + line.length > MAX_PROMPT_CHARS) break;
      transcriptForLLM += line;
    }

    const SpeakerSchema = z.object({
      label: z
        .string()
        .describe(
          "EXACT Deepgram label as it appears in the transcript (e.g. 'Speaker 0', 'User 0'). Do not invent.",
        ),
      identifiedName: z
        .string()
        .nullable()
        .describe(
          "Real name inferred from greetings ('Hi Sarah'), introductions, signatures. Null if unsure — DO NOT GUESS.",
        ),
      role: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Role / title / function inferred from context ('Engineer', 'Product Manager', 'Client'). Null if not inferable.",
        ),
      summary: z
        .string()
        .describe("One sentence: what this person contributed / their main thread in the meeting."),
      keyQuotes: z
        .array(z.string())
        .max(3)
        .optional()
        .describe("Up to 3 verbatim short quotes that best represent this speaker. Optional."),
      sentiment: z
        .enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"])
        .optional()
        .describe("Emotional tone of this speaker through the meeting."),
    });

    const SpeakersResponseSchema = z.object({
      speakers: z.array(SpeakerSchema),
    });

    const prompt = `You are analyzing a diarized meeting transcript. The audio model labeled speakers as "${speakerLabels.join('", "')}" (these are anonymous labels).

Your job: for EACH label, infer the real person's name (only if mentioned in the conversation), their role, a one-sentence summary of their contribution, up to 3 representative quotes, and an overall sentiment.

CRITICAL RULES:
1. Use the EXACT label string in your output — don't rename "Speaker 0" → "Speaker 1".
2. Only set identifiedName when you're confident (someone says "Hi <name>", "<name> mentioned…", they introduce themselves, etc.). Otherwise set null.
3. Don't invent quotes — paste verbatim from the transcript.
4. Don't invent names that aren't in the transcript.
5. Output exactly one entry per label, even if the speaker barely talked.

TRANSCRIPT (label-prefixed):
${transcriptForLLM}`;

    try {
      const model = await getWorkspaceModel(workspaceId, modelKey || DEFAULT_AI_MODEL);
      const { object, usage } = await generateObject({
        model,
        providerOptions: getFallbackProviderOptions(modelKey || DEFAULT_AI_MODEL),
        schema: SpeakersResponseSchema,
        temperature: 0.1,
        prompt,
      });

      if (usage) {
        aiUsageService
          .logUsage({
            userId: "system",
            workspaceId,
            feature: "TASK_EXTRACTION",
            provider: "openrouter",
            model: modelKey || DEFAULT_AI_MODEL,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
          })
          .catch(() => {});
      }

      // Merge LLM output with deterministic stats. Make sure every label
      // appears even if the LLM dropped one.
      const byLabel = new Map<string, z.infer<typeof SpeakerSchema>>();
      for (const s of object.speakers) byLabel.set(s.label, s);

      return speakerLabels.map((label) => {
        const ai = byLabel.get(label);
        const { seconds, count } = stats.get(label) ?? { seconds: 0, count: 0 };
        return {
          label,
          identifiedName: ai?.identifiedName ?? null,
          role: ai?.role ?? null,
          isPrincipalSpeaker: principalSpeakerLabel === label,
          summary: ai?.summary ?? "",
          keyQuotes: ai?.keyQuotes ?? [],
          sentiment: ai?.sentiment,
          speakingTimeSeconds: Math.round(seconds),
          utteranceCount: count,
        } satisfies SpeakerInsight;
      });
    } catch (err) {
      logger.warn("extractSpeakerInsights failed — falling back to label-only", err);
      // Hard fallback: deterministic stats only.
      return speakerLabels.map((label) => {
        const { seconds, count } = stats.get(label) ?? { seconds: 0, count: 0 };
        return {
          label,
          identifiedName: null,
          role: null,
          isPrincipalSpeaker: principalSpeakerLabel === label,
          summary: "",
          keyQuotes: [],
          speakingTimeSeconds: Math.round(seconds),
          utteranceCount: count,
        } satisfies SpeakerInsight;
      });
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
    workspaceId: string,
    transcript: Transcript,
    tasks: Task[],
    options?: {
      syncToJira?: boolean;
      syncToLinear?: boolean;
      syncToTrello?: boolean;
      syncToNotion?: boolean;
      syncToAsana?: boolean;
    },
  ): Promise<void> {
    const integrations = await prisma.workspaceIntegration.findMany({
      where: {
        workspaceId,
        status: IntegrationStatus.CONNECTED,
      },
    });

    if (integrations.length === 0) return;

    const providerToKind: Partial<Record<IntegrationProvider, PostMeetingTaskKind>> = {
      [IntegrationProvider.JIRA]: "jira",
      [IntegrationProvider.LINEAR]: "linear",
      [IntegrationProvider.TRELLO]: "trello",
      [IntegrationProvider.NOTION]: "notion",
      [IntegrationProvider.ASANA]: "asana",
    };

    for (const integration of integrations) {
      const kind = providerToKind[integration.provider];
      try {
        if (integration.provider === IntegrationProvider.JIRA && options?.syncToJira !== false) {
          const meta = integration.metadata as unknown as JiraIntegrationMetadata | null;
          if (!meta?.defaultProjectId) continue;
          await this.setPostMeetingTaskStatus(transcript.id, "jira", { status: "PENDING" });
          for (const task of tasks) {
            const syncResult = await jiraIntegrationService.createJiraIssue(
              workspaceId,
              task.id,
              meta.defaultProjectId,
            );
            await this.updateTaskTargetMetadata(task.id, "jira", {
              issueId: syncResult.issueId,
              issueKey: syncResult.issueKey,
              url: syncResult.url,
            });
          }
          await this.setPostMeetingTaskStatus(transcript.id, "jira", {
            status: "OK",
            count: tasks.length,
          });
        } else if (
          integration.provider === IntegrationProvider.LINEAR &&
          options?.syncToLinear !== false
        ) {
          const meta = integration.metadata as unknown as LinearIntegrationMetadata | null;
          if (!meta?.defaultTeamId) continue;
          await this.setPostMeetingTaskStatus(transcript.id, "linear", { status: "PENDING" });
          for (const task of tasks) {
            const syncResult = await linearIntegrationService.createLinearIssue(
              workspaceId,
              task.id,
              meta.defaultTeamId,
            );
            await this.updateTaskTargetMetadata(task.id, "linear", {
              issueId: syncResult.issueId,
              identifier: syncResult.identifier,
              url: syncResult.url,
            });
          }
          await this.setPostMeetingTaskStatus(transcript.id, "linear", {
            status: "OK",
            count: tasks.length,
          });
        } else if (
          integration.provider === IntegrationProvider.TRELLO &&
          options?.syncToTrello !== false
        ) {
          const meta = integration.metadata as unknown as TrelloIntegrationMetadata | null;
          if (!meta?.defaultBoardId || !meta?.defaultListId) continue;
          await this.setPostMeetingTaskStatus(transcript.id, "trello", { status: "PENDING" });
          for (const task of tasks) {
            const syncResult = await trelloIntegrationService.createTrelloCard(
              workspaceId,
              task.id,
              meta.defaultBoardId,
              meta.defaultListId,
            );
            logger.info(`Auto-synced task ${task.id} to Trello card ${syncResult.cardId}`);
            await this.updateTaskTargetMetadata(task.id, "trello", {
              cardId: syncResult.cardId,
              shortLink: syncResult.shortLink,
              url: syncResult.url,
            });
          }
          await this.setPostMeetingTaskStatus(transcript.id, "trello", {
            status: "OK",
            count: tasks.length,
          });
        } else if (
          integration.provider === IntegrationProvider.NOTION &&
          options?.syncToNotion !== false
        ) {
          await this.setPostMeetingTaskStatus(transcript.id, "notion", { status: "PENDING" });
          // Export the entire transcript instead of individual tasks
          const syncResult = await notionIntegrationService.exportTranscriptToNotion(
            workspaceId,
            transcript,
            tasks,
          );

          logger.info(
            `Auto-synced transcript ${transcript.id} to Notion page ${syncResult.pageId}`,
          );

          // Still tag each task with the notion target so the UI knows it was synced
          for (const task of tasks) {
            await this.updateTaskTargetMetadata(task.id, "notion", {
              pageId: syncResult.pageId,
              url: syncResult.url,
            });
          }
          await this.setPostMeetingTaskStatus(transcript.id, "notion", {
            status: "OK",
            count: 1,
            url: syncResult.url,
          });
        } else if (
          integration.provider === IntegrationProvider.ASANA &&
          options?.syncToAsana !== false
        ) {
          const meta = integration.metadata as unknown as AsanaIntegrationMetadata | null;
          if (!meta?.defaultProjectGid) continue;
          await this.setPostMeetingTaskStatus(transcript.id, "asana", { status: "PENDING" });
          for (const task of tasks) {
            const syncResult = await asanaIntegrationService.createAsanaTask(
              workspaceId,
              task.id,
              meta.defaultProjectGid,
            );
            logger.info(`Auto-synced task ${task.id} to Asana task ${syncResult.taskGid}`);
            await this.updateTaskTargetMetadata(task.id, "asana", {
              taskGid: syncResult.taskGid,
              url: syncResult.url,
            });
          }
          await this.setPostMeetingTaskStatus(transcript.id, "asana", {
            status: "OK",
            count: tasks.length,
          });
        }
      } catch (error) {
        logger.error(`Auto-sync failed for ${integration.provider}`, error);
        if (kind) {
          await this.setPostMeetingTaskStatus(transcript.id, kind, {
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Re-run a single post-meeting side effect (sync, export, generate) for a
   * transcript whose original attempt failed. The caller (controller) is
   * responsible for auth — this method assumes access has been verified.
   *
   * Fires the work as a non-awaited promise; the status transition is
   * observable via `metadata.postMeetingTasks.{kind}` on the next poll.
   */
  public async retryPostMeetingTask(
    workspaceId: string,
    userId: string,
    transcriptId: string,
    kind: PostMeetingTaskKind,
  ): Promise<void> {
    const transcript = await prisma.transcript.findUnique({ where: { id: transcriptId } });
    if (!transcript) throw new Error("Transcript not found");

    const existingTasks = (transcript.metadata as { postMeetingTasks?: PostMeetingTasksRecord })
      ?.postMeetingTasks;
    if (existingTasks?.[kind]?.status === "PENDING") {
      throw new Error("ALREADY_PENDING");
    }

    const links = await prisma.taskTranscriptLink.findMany({
      where: { transcriptId },
      include: { task: true },
    });
    const tasks: Task[] = links.map((l) => l.task);

    // Optimistically set PENDING so the UI reflects it immediately
    await this.setPostMeetingTaskStatus(transcriptId, kind, { status: "PENDING" });

    const fireAndForget = (work: () => Promise<unknown>, label: string) => {
      work().catch((err) => {
        logger.error(`Retry of post-meeting task ${kind} (${label}) errored`, err);
      });
    };

    if (kind === "jira" || kind === "linear" || kind === "trello" || kind === "notion" || kind === "asana") {
      fireAndForget(
        () =>
          this.autoSyncTasks(workspaceId, transcript, tasks, {
            syncToJira: kind === "jira",
            syncToLinear: kind === "linear",
            syncToTrello: kind === "trello",
            syncToNotion: kind === "notion",
            syncToAsana: kind === "asana",
          }),
        "autoSyncTasks",
      );
      return;
    }

    if (kind === "googleDrive" || kind === "oneDrive") {
      // Reconstruct a minimal TranscriptAnalysis from persisted DB state.
      // Only `title`, `summary`, and `tasks` are read by autoExportDocument.
      const minimalAnalysis = {
        language: "en",
        title: transcript.title ?? "Meeting Summary",
        summary: transcript.summary ?? "",
        tasks: tasks.map((t) => ({
          title: t.title,
          description: t.description ?? undefined,
          acceptanceCriteria:
            ((t.metadata as Record<string, unknown> | null)?.acceptanceCriteria as
              | string
              | undefined) ?? undefined,
        })),
      } as unknown as TranscriptAnalysis;

      fireAndForget(
        () =>
          this.autoExportDocument(workspaceId, transcript, minimalAnalysis, {
            exportToGoogleDrive: kind === "googleDrive",
            exportToOneDrive: kind === "oneDrive",
          }),
        "autoExportDocument",
      );
      return;
    }

    if (kind === "doc") {
      fireAndForget(async () => {
        try {
          const doc = await docGenerationService.startGeneration(userId, workspaceId, {
            title: transcript.title || "Meeting Document",
            prompt: `Generate a comprehensive meeting document based on the following transcript summary and extracted tasks. Ensure the language and style are highly corporate, formal, and professional.`,
            transcriptIds: [transcriptId],
            contextIds: [],
          });
          await this.setPostMeetingTaskStatus(transcriptId, "doc", {
            status: "OK",
            url: `/docs/view/${doc.id}`,
          });
        } catch (err) {
          logger.error(
            `[retryPostMeetingTask] doc generation failed for transcript ${transcriptId}`,
            err,
          );
          await this.setPostMeetingTaskStatus(transcriptId, "doc", {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, "doc generation");
      return;
    }

    if (kind === "slides") {
      fireAndForget(async () => {
        try {
          const pres = await slideGenerationService.startPresentationGeneration(
            userId,
            workspaceId,
            undefined,
            undefined,
            [],
            [transcriptId],
            `Create a presentation summarizing the key points, decisions, and action items from the meeting.`,
            transcript.title || "Meeting Slides",
          );
          await this.setPostMeetingTaskStatus(transcriptId, "slides", {
            status: "OK",
            url: `/presentations/${pres.id}`,
          });
        } catch (err) {
          logger.error(
            `[retryPostMeetingTask] slides generation failed for transcript ${transcriptId}`,
            err,
          );
          await this.setPostMeetingTaskStatus(transcriptId, "slides", {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, "slides generation");
      return;
    }
  }

  /**
   * Persist the outcome of a single fire-and-forget post-meeting task to the
   * transcript's `metadata.postMeetingTasks.{kind}`. Best-effort: failures to
   * write status never bubble up — the side effect itself is what matters.
   */
  private async setPostMeetingTaskStatus(
    transcriptId: string,
    kind: PostMeetingTaskKind,
    update: Omit<PostMeetingTaskStatus, "finishedAt"> & { finishedAt?: string },
  ): Promise<void> {
    try {
      const transcript = await prisma.transcript.findUnique({
        where: { id: transcriptId },
        select: { metadata: true },
      });
      if (!transcript) return;

      const meta: Prisma.JsonObject =
        typeof transcript.metadata === "object" && transcript.metadata
          ? { ...(transcript.metadata as Prisma.JsonObject) }
          : {};

      const tasks: PostMeetingTasksRecord =
        (meta.postMeetingTasks as PostMeetingTasksRecord | undefined) ?? {};

      const finishedAt =
        update.status === "OK" || update.status === "FAILED" || update.status === "SKIPPED"
          ? update.finishedAt ?? new Date().toISOString()
          : update.finishedAt;

      tasks[kind] = { ...update, finishedAt };
      meta.postMeetingTasks = tasks as unknown as Prisma.JsonObject;

      await prisma.transcript.update({
        where: { id: transcriptId },
        data: { metadata: meta as Prisma.InputJsonValue },
      });
    } catch (err) {
      logger.error(
        `Failed to record post-meeting task status (${kind}) for transcript ${transcriptId}`,
        err,
      );
    }
  }

  private async updateTaskTargetMetadata(
    taskId: string,
    provider: "jira" | "linear" | "trello" | "notion" | "asana",
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
    } else if (provider === "trello") {
      existingMetadata.trello = payload as TaskMetadata["trello"];
    } else if (provider === "asana") {
      existingMetadata.asana = payload as TaskMetadata["asana"];
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: existingMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }
  private async autoExportDocument(
    workspaceId: string,
    transcript: Transcript,
    analysisRaw: TranscriptAnalysis,
    options: { exportToGoogleDrive?: boolean; exportToOneDrive?: boolean },
  ): Promise<void> {
    const title = transcript.title || analysisRaw.title || "Meeting Summary";
    const date = (transcript.recordedAt || new Date()).toISOString().split("T")[0];
    const filename = `${date} - ${title.replace(/[/\\?%*:|"<>]/g, "-")}.docx`;

    // Convert the summary + tasks into Markdown
    let markdownContent = `# ${title}\n\n`;
    markdownContent += `## Summary\n${analysisRaw.summary}\n\n`;
    markdownContent += `## Action Items & Tasks\n`;

    if (analysisRaw.tasks.length === 0) {
      markdownContent += "No tasks extracted.\n";
    } else {
      analysisRaw.tasks.forEach((task: TranscriptTask, index: number) => {
        markdownContent += `### ${index + 1}. ${task.title}\n`;
        markdownContent += `**Description:** ${task.description || "N/A"}\n\n`;
        if (task.acceptanceCriteria) {
          markdownContent += `**Acceptance Criteria:**\n`;
          markdownContent += `${task.acceptanceCriteria}\n`;
        }
        markdownContent += "\n";
      });
    }

    markdownContent += `\n## Full Transcript\n\n`;
    markdownContent += transcript.transcript || "No transcript available.";
    markdownContent += "\n";

    // Generate .docx Buffer
    const buffer = await DocumentGenerator.generateDocx(markdownContent);

    if (options.exportToGoogleDrive) {
      await this.setPostMeetingTaskStatus(transcript.id, "googleDrive", { status: "PENDING" });
      try {
        const link = await googleIntegrationService.uploadFileToDrive(
          workspaceId,
          filename,
          buffer,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        logger.info(`Successfully exported document to Google Drive: ${link}`);
        await this.setPostMeetingTaskStatus(transcript.id, "googleDrive", {
          status: "OK",
          url: typeof link === "string" ? link : undefined,
        });
      } catch (err) {
        logger.error("Error exporting to Google Drive:", err);
        await this.setPostMeetingTaskStatus(transcript.id, "googleDrive", {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (options.exportToOneDrive) {
      await this.setPostMeetingTaskStatus(transcript.id, "oneDrive", { status: "PENDING" });
      try {
        const link = await microsoftIntegrationService.uploadFileToOneDrive(
          workspaceId,
          filename,
          buffer,
        );
        logger.info(`Successfully exported document to OneDrive: ${link}`);
        await this.setPostMeetingTaskStatus(transcript.id, "oneDrive", {
          status: "OK",
          url: typeof link === "string" ? link : undefined,
        });
      } catch (err) {
        logger.error("Error exporting to OneDrive:", err);
        await this.setPostMeetingTaskStatus(transcript.id, "oneDrive", {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

export const projectTranscriptService = new ProjectTranscriptService();
