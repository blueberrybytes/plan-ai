import { Queue } from "bullmq";
import Redis from "ioredis";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (error) => {
  logger.error("Redis connection error in contextDocumentQueue", error);
});

export interface ContextDocumentJobPayload {
  contextId: string;
  fileId: string;
  userId: string;
  workspaceId: string;
}

export const contextDocumentQueue = new Queue<ContextDocumentJobPayload>("ContextDocumentQueue", {
  connection,
});
