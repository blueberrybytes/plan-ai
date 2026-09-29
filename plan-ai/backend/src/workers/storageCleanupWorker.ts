import { Worker, Job } from "bullmq";
import { redisClient } from "../utils/redisClient";
import { logger } from "../utils/logger";
import { deleteOlderThan, RECORDING_PARTS_ROOT } from "../firebase/privateStorage";
import { applyAudioRetention } from "../services/audioRetentionService";
import { purgeOldTrash } from "../services/noteService";

/**
 * Daily storage housekeeping.
 *
 * Deletes the slices of recordings whose upload never finished (the phone
 * was lost, the app was deleted, the user discarded it offline). A finished
 * upload deletes its own slices; these are the leftovers. A week is far more
 * than the phone's retries take, which back off to at most 30 minutes.
 */
const MAX_PART_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const storageCleanupWorker = new Worker(
  "StorageCleanupQueue",
  async (job: Job) => {
    // Each task on its own: a failed sweep must not skip the retention rule.
    let removed = 0;
    let audioDeleted = 0;
    try {
      removed = await deleteOlderThan(RECORDING_PARTS_ROOT, MAX_PART_AGE_MS);
    } catch (err) {
      logger.error("[storage-cleanup] could not sweep old recording slices", err);
    }
    try {
      // Workspaces that keep meeting audio for a limited time.
      audioDeleted = await applyAudioRetention();
    } catch (err) {
      logger.error("[storage-cleanup] could not apply audio retention", err);
    }
    let notesPurged = 0;
    try {
      // Notes left in the trash longer than 30 days.
      notesPurged = await purgeOldTrash();
    } catch (err) {
      logger.error("[storage-cleanup] could not empty the notes trash", err);
    }
    logger.info(
      `[storage-cleanup] job ${job.id}: deleted ${removed} stale recording slices, ` +
        `audio of ${audioDeleted} meetings past their workspace retention, ` +
        `${notesPurged} notes from the trash`,
    );
    return { removed, audioDeleted, notesPurged };
  },
  { connection: redisClient, lockDuration: 10 * 60_000 },
);

storageCleanupWorker.on("failed", (_job, err) => {
  logger.error(`[storage-cleanup] job failed: ${err.message}`);
});
