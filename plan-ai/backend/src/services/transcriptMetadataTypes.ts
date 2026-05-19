export interface TranscriptMetadata {
  processingStatus?: "PENDING" | "PROCESSING" | "EXTRACTING_TASKS" | "COMPLETED" | "FAILED" | "DONE";
  errorMessage?: string;
  sentimentExplanation?: string;
  keyPoints?: string[];
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
  rawTasks?: unknown[];
  principalSpeaker?: string;
}
