import { PrismaClient } from "@prisma/client";
import { hiddenFromCaller, type HiddenFromCaller } from "../services/accessScope";

/**
 * The client without the visibility rule. Only for the code that works out
 * the rule itself (services/projectAccess.ts) and for maintenance scripts.
 */
export const rawPrisma = new PrismaClient();

type Where = Record<string, unknown>;

const projectOk = (h: HiddenFromCaller): Where => ({
  OR: [{ projectId: null }, { projectId: { notIn: h.projectIds } }],
});
// The lists are NOT NULL DEFAULT '{}' since the project_visibility_lists
// migration. A NULL list would make this comparison unknown and hide the row,
// which is the safe way round.
const contextsOk = (h: HiddenFromCaller): Where[] =>
  h.contextIds.length > 0 ? [{ NOT: { contextIds: { hasSome: h.contextIds } } }] : [];
const transcriptOk = (h: HiddenFromCaller): Where => ({
  AND: [projectOk(h), ...contextsOk(h)],
});
/** For rows that point at a meeting: no meeting, or a meeting the caller sees. */
const viaTranscript = (h: HiddenFromCaller): Where => ({
  OR: [{ transcriptId: null }, { transcript: transcriptOk(h) }],
});

/**
 * Per model, the condition that leaves out what belongs to a hidden project.
 * A model not listed here is not filtered. Rows reached through `include`
 * from a visible row are not filtered either, so a query must not include
 * projects, meetings or tasks under a parent that is wider than a project.
 */
export const HIDDEN_FILTERS: Record<string, (h: HiddenFromCaller) => Where> = {
  Project: (h) => ({ id: { notIn: h.projectIds } }),
  Task: (h) => ({ projectId: { notIn: h.projectIds } }),
  Transcript: transcriptOk,
  PainPoint: (h) => ({ transcript: transcriptOk(h) }),
  TaskTranscriptLink: (h) => ({ transcript: transcriptOk(h) }),
  TranscriptTranslation: (h) => ({ source: transcriptOk(h) }),
  // A comment hangs from a task or from a meeting.
  Comment: (h) => ({
    AND: [
      { OR: [{ taskId: null }, { task: { projectId: { notIn: h.projectIds } } }] },
      viaTranscript(h),
    ],
  }),
  Context: (h) => ({ AND: [projectOk(h), { id: { notIn: h.contextIds } }] }),
  ContextFile: (h) => ({ contextId: { notIn: h.contextIds } }),
  ChatThread: (h) => ({ AND: [viaTranscript(h), ...contextsOk(h)] }),
  Note: (h) => ({ AND: [projectOk(h), viaTranscript(h)] }),
  DocDocument: (h) => ({ AND: [projectOk(h), ...contextsOk(h)] }),
  Presentation: (h) => ({ AND: contextsOk(h) }),
  Diagram: (h) => ({ AND: contextsOk(h) }),
};

// Reads, and the writes that pick their rows with a `where`. Creates are left
// alone: what a caller may create is decided where it is created.
const GUARDED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

/** `where` with the visibility condition added. Unique fields stay at the top level. */
export function withHiddenFilter(where: Where | undefined, condition: Where): Where {
  const existing = where?.AND;
  const and = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...and, condition] };
}

const prisma = rawPrisma.$extends({
  name: "restricted-projects",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const hidden = hiddenFromCaller();
        const filter = hidden && HIDDEN_FILTERS[model];
        if (!hidden || !filter || !GUARDED_OPERATIONS.has(operation)) return query(args);
        const withWhere = args as { where?: Where };
        return query({ ...withWhere, where: withHiddenFilter(withWhere.where, filter(hidden)) });
      },
    },
  },
  // The extension changes no types. Keeping the plain type keeps every
  // `PrismaClient` and `Prisma.TransactionClient` annotation in the code valid.
}) as unknown as PrismaClient;

export default prisma;
