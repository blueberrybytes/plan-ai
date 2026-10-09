import type { Prisma } from "@prisma/client";
import { webLink } from "../services/webhookService";

/**
 * The shapes the public API answers with. Small and stable on purpose: a
 * field added to a table does not show up here by accident. Dates are ISO
 * strings. No audio links and no file contents.
 */

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

// ── Projects ────────────────────────────────────────────────────────────────

export const PROJECT_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { transcripts: true, tasks: true } },
} as const;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

export const toApiProject = (p: ProjectRow) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  status: p.status,
  visibility: p.visibility,
  meetingCount: p._count.transcripts,
  taskCount: p._count.tasks,
  url: webLink(`/projects/${p.id}`),
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
});

const PROJECT_REF = { select: { id: true, title: true } } as const;

// Every object is built field by field, so nothing a query happens to return
// goes out by accident.
const projectRef = (p: { id: string; title: string } | null) =>
  p ? { id: p.id, title: p.title } : null;

// ── Meetings ────────────────────────────────────────────────────────────────

/** For lists: everything but the transcript text and the utterances. */
export const MEETING_SELECT = {
  id: true,
  title: true,
  summary: true,
  language: true,
  source: true,
  durationSeconds: true,
  speakerCount: true,
  metadata: true,
  recordedAt: true,
  createdAt: true,
  updatedAt: true,
  project: PROJECT_REF,
} as const;
type MeetingRow = Prisma.TranscriptGetPayload<{ select: typeof MEETING_SELECT }>;

export const MEETING_DETAIL_SELECT = {
  ...MEETING_SELECT,
  transcript: true,
  utterances: true,
  taskLinks: {
    select: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          projectId: true,
          assignee: { select: { email: true } },
        },
      },
    },
  },
} as const;
type MeetingDetailRow = Prisma.TranscriptGetPayload<{ select: typeof MEETING_DETAIL_SELECT }>;

type Metadata = Record<string, unknown>;
const metadataOf = (value: Prisma.JsonValue | null): Metadata =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Metadata) : {};

/** "processing", "ready" or "failed", from the internal processing status. */
export function meetingStatus(
  metadata: Prisma.JsonValue | null,
): "processing" | "ready" | "failed" {
  const status = metadataOf(metadata).processingStatus;
  if (status === "FAILED") return "failed";
  // Rows from before the status existed have none and are ready.
  if (status === undefined || status === null || status === "COMPLETED" || status === "DONE") {
    return "ready";
  }
  // Tasks are being refined after the summary is ready.
  if (status === "REFINING_TASKS") return "ready";
  return "processing";
}

export const toApiMeeting = (m: MeetingRow) => ({
  id: m.id,
  title: m.title,
  status: meetingStatus(m.metadata),
  summary: m.summary,
  durationSeconds: m.durationSeconds,
  speakerCount: m.speakerCount,
  language: m.language,
  source: m.source,
  project: projectRef(m.project),
  url: webLink(`/recordings/${m.id}`),
  recordedAt: iso(m.recordedAt),
  createdAt: iso(m.createdAt),
  updatedAt: iso(m.updatedAt),
});

interface StoredUtterance {
  speaker?: unknown;
  transcript?: unknown;
  start?: unknown;
  end?: unknown;
}

const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function speakersOf(metadata: Metadata) {
  const overrides = metadataOf((metadata.speakerNameOverrides ?? null) as Prisma.JsonValue);
  const speakers = Array.isArray(metadata.speakers) ? (metadata.speakers as Metadata[]) : [];
  return speakers
    .filter((s) => s && typeof s.label === "string")
    .map((s) => ({
      label: s.label as string,
      name: text(overrides[s.label as string]) ?? text(s.identifiedName),
      role: text(s.role),
      speakingTimeSeconds: num(s.speakingTimeSeconds),
      utteranceCount: num(s.utteranceCount),
    }));
}

/**
 * A meeting with its speakers, tasks and transcript. `hiddenProjectIds` are
 * the restricted projects the caller does not see: a task of one of them
 * linked to this meeting is left out.
 */
export const toApiMeetingDetail = (m: MeetingDetailRow, hiddenProjectIds: string[]) => {
  const metadata = metadataOf(m.metadata);
  const utterances = Array.isArray(m.utterances) ? (m.utterances as StoredUtterance[]) : [];
  return {
    ...toApiMeeting(m),
    speakers: speakersOf(metadata),
    tasks: m.taskLinks
      .map((link) => link.task)
      .filter((task) => !hiddenProjectIds.includes(task.projectId))
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeEmail: task.assignee?.email ?? null,
      })),
    transcript: {
      /** The whole text. Meetings saved as text have this and no utterances. */
      text: m.transcript,
      utterances: utterances.map((u) => ({
        speaker: text(u.speaker),
        start: num(u.start),
        end: num(u.end),
        text: text(u.transcript) ?? "",
      })),
    },
  };
};

// ── Tasks ───────────────────────────────────────────────────────────────────

export const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  acceptanceCriteria: true,
  status: true,
  priority: true,
  type: true,
  dueDate: true,
  completedAt: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true, email: true } },
  project: PROJECT_REF,
} as const;
type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

export const TASK_DETAIL_SELECT = {
  ...TASK_SELECT,
  subtasks: { select: { id: true, title: true, status: true } },
  transcriptLinks: { select: { transcriptId: true } },
} as const;
type TaskDetailRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

export const toApiTask = (t: TaskRow) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  acceptanceCriteria: t.acceptanceCriteria,
  status: t.status,
  priority: t.priority,
  type: t.type,
  dueDate: iso(t.dueDate),
  completedAt: iso(t.completedAt),
  assignee: t.assignee
    ? { id: t.assignee.id, name: t.assignee.name, email: t.assignee.email }
    : null,
  project: projectRef(t.project),
  parentId: t.parentId,
  url: webLink(`/projects/${t.project.id}?task=${t.id}`),
  createdAt: iso(t.createdAt),
  updatedAt: iso(t.updatedAt),
});

export const toApiTaskDetail = (t: TaskDetailRow) => ({
  ...toApiTask(t),
  subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status })),
  meetingIds: t.transcriptLinks.map((link) => link.transcriptId),
});
