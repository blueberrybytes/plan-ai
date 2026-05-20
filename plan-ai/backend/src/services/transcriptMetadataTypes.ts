export type PostMeetingTaskKind =
  | "jira"
  | "linear"
  | "trello"
  | "notion"
  | "asana"
  | "googleDrive"
  | "oneDrive"
  | "doc"
  | "slides";

export interface PostMeetingTaskStatus {
  status: "PENDING" | "OK" | "FAILED" | "SKIPPED";
  /** Short error message when status is FAILED */
  error?: string;
  /** ISO timestamp of when the task reached its terminal state */
  finishedAt?: string;
  /** Number of items processed (e.g. tickets created, tasks synced) */
  count?: number;
  /** Optional deep link to the produced resource (doc URL, page URL, etc.) */
  url?: string;
}

export type PostMeetingTasksRecord = Partial<Record<PostMeetingTaskKind, PostMeetingTaskStatus>>;

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
  /** Per-step status of fire-and-forget effects kicked off after a transcript is processed */
  postMeetingTasks?: PostMeetingTasksRecord;
}
