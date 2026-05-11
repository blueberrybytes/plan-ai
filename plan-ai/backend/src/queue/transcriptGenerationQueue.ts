import { Queue } from "bullmq";
import Redis from "ioredis";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (error) => {
  logger.error("Redis connection error in transcriptGenerationQueue", error);
});

export interface TranscriptGenerationJobPayload {
  transcriptId: string;
  projectId?: string;
  userId: string;
  workspaceId: string;
  content: string;
  source: string;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string;
  complexityLevel?: string;
  modelKey?: string;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  syncToJira?: boolean;
  syncToLinear?: boolean;
  syncToTrello?: boolean;
  contextPrompt?: string;
}

export const transcriptGenerationQueue = new Queue<TranscriptGenerationJobPayload>(
  "TranscriptGenerationQueue",
  {
    connection,
  },
);
