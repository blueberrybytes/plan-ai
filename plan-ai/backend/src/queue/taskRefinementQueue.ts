import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

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

export const taskRefinementQueue = new Queue<TaskRefinementJobPayload>("TaskRefinementQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    // Job data holds meeting content. Finished jobs go at once; failed ones stay
    // a week for debugging, then Redis drops them.
    removeOnComplete: true,
    removeOnFail: { age: 7 * 24 * 3600, count: 50 },
  },
});
