import { Queue } from "bullmq";
import Redis from "ioredis";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (error) => {
  logger.error("Redis connection error in githubContextQueue", error);
});

export interface GithubContextJobPayload {
  contextId: string;
  githubRepoId: string;
  installationId: string;
  branch?: string;
}

export const githubContextQueue = new Queue<GithubContextJobPayload>("GithubContextQueue", {
  connection,
});
