import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

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
  syncToNotion?: boolean;
  syncToAsana?: boolean;
  syncToTwenty?: boolean;
  /** Chosen per meeting — the same person meets different clients. */
  twentyCompanyId?: string;
  exportToGoogleDrive?: boolean;
  exportToOneDrive?: boolean;
  contextPrompt?: string;
  agenticInvestigation?: boolean;
  createDoc?: boolean;
  createSlides?: boolean;
  /** "Save transcript only" with audio and no live text: transcribe, skip every AI step. */
  transcribeOnly?: boolean;
}

export const transcriptGenerationQueue = new Queue<TranscriptGenerationJobPayload>(
  "TranscriptGenerationQueue",
  {
    connection: queueConnection,
    defaultJobOptions: {
      // Job data holds meeting content. Finished jobs go at once; failed ones stay
      // a week for debugging, then Redis drops them.
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600, count: 50 },
    },
  },
);
