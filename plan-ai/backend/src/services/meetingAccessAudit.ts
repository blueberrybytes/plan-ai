import { recordAudit, type AuditActor, type AuditRequestInfo } from "./auditLogService";
import { trackMeetingAccess } from "./featureUsageService";

/**
 * Who read which meeting, for the workspace audit log.
 *
 * The admin actions were already logged. This adds the reads: opening a
 * meeting, getting its audio, sending its notes, translating it, and reading
 * it through MCP. Owners and admins see them in the audit log under "meeting".
 */

export type MeetingAccessKind =
  | "viewed"
  | "audio_accessed"
  | "notes_sent"
  | "translated"
  | "exported"
  | "clip_created";

/**
 * Where the read came from. "app" is the web, the recorder or the phone,
 * "api" is the public REST API.
 */
export type MeetingAccessChannel = "app" | "mcp" | "api";

export interface MeetingAccess {
  workspaceId: string;
  actor: AuditActor;
  transcriptId: string;
  kind: MeetingAccessKind;
  channel?: MeetingAccessChannel;
  title?: string | null;
  /** Extra detail, e.g. the language of a translation. No meeting text. */
  detail?: Record<string, string | number>;
  request?: AuditRequestInfo;
}

// The meeting page polls while a meeting is processing, and the player asks
// for a fresh audio link now and then. One entry per person, meeting and kind
// in this window is enough to answer "who read it and when".
const WINDOW_MS = 30 * 60 * 1000;
const MAX_REMEMBERED = 5000;
const REPEATABLE: ReadonlySet<MeetingAccessKind> = new Set(["viewed", "audio_accessed"]);
const lastSeen = new Map<string, number>();

function seenRecently(key: string, now: number): boolean {
  const last = lastSeen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return true;
  // Map keeps insertion order: re-adding moves the key to the end, so the
  // first key is always the oldest.
  lastSeen.delete(key);
  lastSeen.set(key, now);
  if (lastSeen.size > MAX_REMEMBERED) {
    const oldest = lastSeen.keys().next().value;
    if (oldest !== undefined) lastSeen.delete(oldest);
  }
  return false;
}

/** For tests. */
export function resetMeetingAccessMemory(): void {
  lastSeen.clear();
}

/**
 * Logs one read of a meeting. Never throws and does not hold the request:
 * callers do not await it.
 */
export function recordMeetingAccess(access: MeetingAccess, now = Date.now()): Promise<void> {
  const channel = access.channel ?? "app";
  if (REPEATABLE.has(access.kind)) {
    const key = `${access.actor.id ?? "?"}:${access.transcriptId}:${access.kind}:${channel}`;
    if (seenRecently(key, now)) return Promise.resolve();
  }
  // Counts only: the kind, the workspace and the user. No title, no detail.
  const { kind, workspaceId, request } = access;
  trackMeetingAccess({ kind, channel, workspaceId, userId: access.actor.id, request });
  return recordAudit({
    workspaceId: access.workspaceId,
    actor: access.actor,
    action: `meeting.${access.kind}`,
    targetType: "transcript",
    targetId: access.transcriptId,
    metadata: {
      ...(access.title ? { title: access.title } : {}),
      ...(channel !== "app" ? { via: channel } : {}),
      ...access.detail,
    },
    request: access.request,
  });
}
