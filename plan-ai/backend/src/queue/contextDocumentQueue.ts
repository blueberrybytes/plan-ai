import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

export interface ContextDocumentJobPayload {
  contextId: string;
  fileId: string;
  userId: string;
  workspaceId: string;
}

export const contextDocumentQueue = new Queue<ContextDocumentJobPayload>("ContextDocumentQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
