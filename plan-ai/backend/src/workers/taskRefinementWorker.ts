import { Worker, Job } from "bullmq";
import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger";
import { TaskRefinementJobPayload } from "../queue/taskRefinementQueue";
import { projectTranscriptService } from "../services/projectTranscriptService";
import { checkSubscription } from "../services/subscriptionGuard";
import { createWorkerConnection } from "../queue/redisConnection";


const connection = createWorkerConnection();

export const taskRefinementWorker = new Worker<TaskRefinementJobPayload>(
  "TaskRefinementQueue",
  async (job: Job<TaskRefinementJobPayload>) => {
    return Sentry.withScope(async (scope) => {
      scope.setUser({ id: job.data.userId });
      scope.setTag("workspaceId", job.data.workspaceId);
      scope.setTag("transcriptId", job.data.transcriptId);
      scope.setTag("jobId", String(job.id ?? "unknown"));
      scope.setTag("queue", "TaskRefinementQueue");

      logger.info(
        `[TaskRefinementWorker] Processing job ${job.id} for transcript ${job.data.transcriptId} (${job.data.taskIds.length} tasks)`,
      );

      // Guard against stale jobs whose subscription was canceled in the
      // brief window between Pass 1 (fast extraction) and Pass 2 (this
      // refinement). The actual cost here is small (~$0.05 in OpenRouter
      // credit) but we want consistency with the other paid workers
      // (transcriptGeneration, contextDocument, github) which all bail
      // here. Mark the transcript COMPLETED so the UI stops polling.
      const sub = await checkSubscription(job.data.workspaceId);
      if (!sub.active) {
        logger.warn(
          `[TaskRefinementWorker] Skipping job ${job.id} — workspace ${job.data.workspaceId} subscription ${sub.reason ?? "missing"}`,
        );
        try {
          await projectTranscriptService.setTranscriptProcessingStatus(
            job.data.transcriptId,
            "COMPLETED",
          );
        } catch (markErr) {
          logger.error(
            `[TaskRefinementWorker] Failed to reset status after subscription bail`,
            markErr,
          );
        }
        return;
      }

      try {
        await projectTranscriptService.refineTasksWithInvestigation(job.data);
        logger.info(`[TaskRefinementWorker] Successfully completed job ${job.id}`);
      } catch (error) {
        logger.error(`[TaskRefinementWorker] Error processing job ${job.id}`, error);

        // Best-effort: mark transcript as COMPLETED even on failure
        // so the UI doesn't stay in REFINING_TASKS forever.
        try {
          await projectTranscriptService.setTranscriptProcessingStatus(
            job.data.transcriptId,
            "COMPLETED",
          );
        } catch (markErr) {
          logger.error(
            `[TaskRefinementWorker] Failed to reset status for transcript ${job.data.transcriptId}`,
            markErr,
          );
        }

        // Don't re-throw — refinement failure should not retry. The fast-pass
        // tasks are already visible and usable.
      }
    });
  },
  {
    connection,
    // Lower concurrency than the main transcript queue to avoid overloading
    // MCP/GitNexus and OpenRouter simultaneously.
    concurrency: 1,
    lockDuration: 300_000,    // 5 minutes — agentic investigation takes 60-120s
    stalledInterval: 120_000, // Check for stalled jobs every 2 minutes
  },
);

taskRefinementWorker.on("completed", (job) => {
  logger.info(`[TaskRefinementWorker] Job ${job.id} completed`);
});

taskRefinementWorker.on("failed", (job, err) => {
  logger.error(`[TaskRefinementWorker] Job ${job?.id} failed: ${err.message}`);
});
