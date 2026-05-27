import { Queue } from "bullmq";
import Redis from "ioredis";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (error) => {
  logger.error("Redis connection error in taskRefinementQueue", error);
});

export interface TaskRefinementJobPayload {
  transcriptId: string;
  workspaceId: string;
  userId: string;
  content: string;
  contextIds?: string[];
  contextPrompt?: string;
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string;
  complexityLevel?: string;
  modelKey?: string;
  /** IDs of the already-persisted fast-pass tasks to enrich. */
  taskIds: string[];
}

export const taskRefinementQueue = new Queue<TaskRefinementJobPayload>(
  "TaskRefinementQueue",
  {
    connection,
  },
);
