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

export const taskRefinementQueue = new Queue<TaskRefinementJobPayload>(
  "TaskRefinementQueue",
  {
    connection: queueConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
);
