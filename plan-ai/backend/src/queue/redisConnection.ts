import Redis from "ioredis";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const REDIS_URL = EnvUtils.get("REDIS_URL", "redis://localhost:6379");

/**
 * Shared Redis connection for all BullMQ queues.
 * BullMQ queues can safely share a single ioredis instance.
 */
export const queueConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

queueConnection.on("error", (error) => {
  logger.error("Redis connection error in shared queueConnection", error);
});

/**
 * Creates a NEW Redis connection for workers.
 * BullMQ workers need their own connections because they use blocking commands (BRPOPLPUSH).
 * However, we reuse one per worker, not per file.
 */
export function createWorkerConnection(): Redis {
  const conn = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  conn.on("error", (error) => {
    logger.error("Redis connection error in worker connection", error);
  });

  return conn;
}
