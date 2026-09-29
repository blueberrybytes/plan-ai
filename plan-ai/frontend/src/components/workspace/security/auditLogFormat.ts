import type { AuditLogEntryResponse } from "../../../store/apis/workspaceApi";

/** Actions with a human label. Anything else is shown as the raw action name. */
const KNOWN_ACTIONS = new Set([
  "member.invited",
  "member.added",
  "member.joined",
  "member.removed",
  "member.role_changed",
  "member.invitation_cancelled",
  "settings.updated",
  "workspace.exported",
  "workspace.ownership_transferred",
  "workspace.deleted",
  "project.deleted",
  "meeting.deleted",
  "meeting.audio_deleted",
  "document.shared",
  "document.unshared",
  "presentation.shared",
  "presentation.unshared",
  "diagram.shared",
  "diagram.unshared",
  "integration.disconnected",
  "assistant.task_status_changed",
  "assistant.task_assigned",
  "platform_admin.access",
]);

/** Action prefixes offered in the filter. The backend matches `action` as a prefix. */
export const AUDIT_ACTION_GROUPS = [
  "member",
  "settings",
  "workspace",
  "project",
  "meeting",
  "document",
  "presentation",
  "diagram",
  "integration",
  "assistant",
  "platform_admin",
] as const;

/** i18n key of the human label, or null for an unknown action. */
export const auditActionLabelKey = (action: string): string | null =>
  KNOWN_ACTIONS.has(action)
    ? `workspaceSecurity.auditLog.actions.${action.replace(".", "_")}`
    : null;

export const formatAuditTarget = (entry: AuditLogEntryResponse): string =>
  [entry.targetType, entry.targetId].filter(Boolean).join(" ");

/** Metadata as short "key: value" pairs, e.g. "role: ADMIN, email: a@b.com". */
export const formatAuditDetails = (metadata: AuditLogEntryResponse["metadata"]): string => {
  if (!metadata || typeof metadata !== "object") return "";
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(", ");
};

/**
 * One CSV cell. Quotes when needed, and neutralises values that a spreadsheet
 * would run as a formula (=, +, -, @), since log fields can hold user input.
 */
const csvCell = (value: string): string => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export interface AuditCsvLabels {
  headers: [string, string, string, string, string];
  actionLabel: (action: string) => string;
  actorLabel: (entry: AuditLogEntryResponse) => string;
}

export const buildAuditCsv = (entries: AuditLogEntryResponse[], labels: AuditCsvLabels): string => {
  const rows = entries.map((entry) => [
    entry.createdAt,
    labels.actorLabel(entry),
    labels.actionLabel(entry.action),
    formatAuditTarget(entry),
    formatAuditDetails(entry.metadata),
  ]);
  return [labels.headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
};
