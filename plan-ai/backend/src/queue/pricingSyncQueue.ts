import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

export const pricingSyncQueue = new Queue("PricingSyncQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
