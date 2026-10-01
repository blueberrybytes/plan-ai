import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

export const teamReportQueue = new Queue("TeamReportQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});
