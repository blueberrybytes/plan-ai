import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

export const storageCleanupQueue = new Queue("StorageCleanupQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});
