import type { IncomingHttpHeaders } from "http";
import { Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";

export interface AuditActor {
  id?: string | null;
  email?: string | null;
}

/** The parts of an Express request the log keeps: client IP and user agent. */
export interface AuditRequestInfo {
  ip?: string;
  headers?: IncomingHttpHeaders;
}

export interface AuditEntry {
  workspaceId?: string | null;
  actor?: AuditActor | null;
  /** Dotted name, e.g. "member.removed". */
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonObject;
  request?: AuditRequestInfo;
}

const MAX_USER_AGENT = 300;

/**
 * Writes one audit entry. It never throws: a failed write is logged and the
 * action it describes goes on.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const userAgent = entry.request?.headers?.["user-agent"];
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        actorUserId: entry.actor?.id ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? Prisma.JsonNull,
        ip: entry.request?.ip ?? null,
        userAgent: typeof userAgent === "string" ? userAgent.slice(0, MAX_USER_AGENT) : null,
      },
    });
  } catch (err) {
    logger.error(`[Audit] Could not record "${entry.action}"`, err);
  }
}

export interface AuditLogPage {
  entries: {
    id: string;
    action: string;
    actorUserId: string | null;
    actorEmail: string | null;
    targetType: string | null;
    targetId: string | null;
    metadata: Prisma.JsonValue;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
  }[];
  /** Pass back as `cursor` to get the next, older page. Null on the last page. */
  nextCursor: string | null;
}

/** Newest first, `limit` entries at most, starting after `cursor`. */
export async function listAudit(
  workspaceId: string,
  options: { limit?: number; cursor?: string; action?: string } = {},
): Promise<AuditLogPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      ...(options.action ? { action: { startsWith: options.action } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      actorUserId: true,
      actorEmail: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  return { entries, nextCursor: hasMore ? entries[entries.length - 1].id : null };
}
