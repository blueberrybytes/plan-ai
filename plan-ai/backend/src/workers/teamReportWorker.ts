import { Worker, Job } from "bullmq";
import { redisClient } from "../utils/redisClient";
import { logger } from "../utils/logger";
import { runTeamWeeklyReport } from "../services/teamReportService";

/**
 * Sends last week's team report to the owners and admins of every workspace
 * with the daily report on. One repeatable job, like the weekly digest, with
 * a long lock so a slow run is not picked up twice and sent twice.
 */
export const teamReportWorker = new Worker(
  "TeamReportQueue",
  async (job: Job) => {
    logger.info(`[TeamReport] Starting run (job ${job.id})`);
    const result = await runTeamWeeklyReport();
    await job.log(
      `workspaces=${result.workspaces} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result;
  },
  { connection: redisClient, lockDuration: 10 * 60_000 },
);

teamReportWorker.on("failed", (_job, err) => {
  logger.error(`[TeamReport] Run failed: ${err.message}`);
});
