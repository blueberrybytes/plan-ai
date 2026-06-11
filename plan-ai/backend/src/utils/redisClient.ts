import Redis from "ioredis";
import EnvUtils from "./EnvUtils";
import { logger } from "./logger";

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisClient.on("error", (error) => {
  logger.error("Global Redis connection error", error);
});
