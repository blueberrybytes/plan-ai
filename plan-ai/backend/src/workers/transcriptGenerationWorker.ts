import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import * as Sentry from "@sentry/node";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import { TranscriptGenerationJobPayload } from "../queue/transcriptGenerationQueue";
import { projectTranscriptService } from "../services/projectTranscriptService";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const transcriptGenerationWorker = new Worker<TranscriptGenerationJobPayload>(
  "TranscriptGenerationQueue",
  async (job: Job<TranscriptGenerationJobPayload>) => {
    // Attach workspace/user/transcript context so every logger.error inside
    // this job lands in Sentry tagged with the originating workspace.
    return Sentry.withScope(async (scope) => {
      scope.setUser({ id: job.data.userId });
      scope.setTag("workspaceId", job.data.workspaceId);
      scope.setTag("transcriptId", job.data.transcriptId);
      scope.setTag("jobId", String(job.id ?? "unknown"));
      scope.setTag("queue", "TranscriptGenerationQueue");

      logger.info(
        `Processing TranscriptGenerationJob ${job.id} for transcript ${job.data.transcriptId}`,
      );

      try {
        await projectTranscriptService.processPendingTranscript(job.data.transcriptId, {
          projectId: job.data.projectId || "",
          workspaceId: job.data.workspaceId,
          userId: job.data.userId,
          content: job.data.content,
          source: job.data.source,
          contextIds: job.data.contextIds,
          persona: job.data.persona,
          objective: job.data.objective,
          complexityLevel: job.data.complexityLevel,
          modelKey: job.data.modelKey,
          syncToJira: job.data.syncToJira,
          syncToLinear: job.data.syncToLinear,
          syncToTrello: job.data.syncToTrello,
          syncToNotion: job.data.syncToNotion,
          syncToAsana: job.data.syncToAsana,
          exportToGoogleDrive: job.data.exportToGoogleDrive,
          exportToOneDrive: job.data.exportToOneDrive,
          taskStrategy: job.data.taskStrategy,
          taskCount: job.data.taskCount,
          contextPrompt: job.data.contextPrompt,
          createDoc: job.data.createDoc,
          createSlides: job.data.createSlides,
        });

        logger.info(`Successfully completed TranscriptGenerationJob ${job.id}`);
      } catch (error) {
        logger.error(`Error processing TranscriptGenerationJob ${job.id}`, error);

        // Update Prisma to FAILED
        const transcript = await prisma.transcript.findUnique({
          where: { id: job.data.transcriptId },
        });
        if (transcript) {
          const meta =
            typeof transcript.metadata === "object" && transcript.metadata
              ? { ...(transcript.metadata as Prisma.JsonObject) }
              : {};
          meta.processingStatus = "FAILED";
          meta.errorMessage = error instanceof Error ? error.message : String(error);

          await prisma.transcript.update({
            where: { id: job.data.transcriptId },
            data: {
              metadata: meta,
              title:
                transcript.title === "Generating Transcript..."
                  ? "Failed Transcript"
                  : transcript.title,
            },
          });
        }
        throw error;
      }
    });
  },
  { connection, concurrency: 2 }, // Limit concurrency to avoid hitting LLM API rate limits
);

transcriptGenerationWorker.on("completed", (job) => {
  logger.info(`Job ${job.id} has completed!`);
});

transcriptGenerationWorker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} has failed with ${err.message}`);
});
