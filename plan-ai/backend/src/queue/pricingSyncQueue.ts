import { Queue } from "bullmq";
import { redisClient } from "../utils/redisClient";

export const pricingSyncQueue = new Queue("PricingSyncQueue", {
  connection: redisClient,
});
