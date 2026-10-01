import prisma from "../prisma/prismaClient";
import { DISPLAY_URL_TTL_MS, readableUrl, signedUrlForPath } from "../firebase/privateStorage";
import { logger } from "../utils/logger";

/**
 * Everything a workspace holds, as JSON, for the owner to keep or move
 * elsewhere. API keys and integration tokens are left out. Files are given as
 * signed links that expire after 12 hours.
 */

const AUDIT_EXPORT_LIMIT = 50_000;

const signed = async (ref: string | null | undefined): Promise<string | null> => {
  if (!ref) return null;
  try {
    return await readableUrl(ref, DISPLAY_URL_TTL_MS);
  } catch (err) {
    // No path in the message: it can hold a user's file name.
    logger.error("[Export] Could not sign a file link", err);
    return null;
  }
};

/**
 * `exportedBy` is the owner running the export: their own private notes and
 * trackers are included, other members' private notes never are.
 */
export async function exportWorkspace(
  workspaceId: string,
  exportedBy: string,
): Promise<Record<string, unknown>> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      tier: true,
      createdAt: true,
      audioRetentionDays: true,
      allowedEmailDomains: true,
      requireMfa: true,
      requiredSignInProvider: true,
      dailyReportEnabled: true,
      dailyReportReminderTime: true,
    },
  });

  const [
    members,
    projects,
    transcripts,
    contexts,
    documents,
    presentations,
    diagrams,
    threads,
    auditLog,
    notes,
    trackers,
    taskUpdates,
  ] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { role: true, user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        tasks: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.transcript.findMany({
      where: { workspaceId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        title: true,
        source: true,
        language: true,
        summary: true,
        transcript: true,
        utterances: true,
        recordedAt: true,
        durationSeconds: true,
        createdAt: true,
        rawMicUrl: true,
        rawSysUrl: true,
      },
    }),
    prisma.context.findMany({
      where: { workspaceId },
      select: {
        id: true,
        projectId: true,
        name: true,
        description: true,
        createdAt: true,
        files: {
          select: { id: true, fileName: true, mimeType: true, bucketPath: true, createdAt: true },
        },
      },
    }),
    prisma.docDocument.findMany({
      where: { workspaceId },
      select: { id: true, title: true, content: true, status: true, createdAt: true },
    }),
    prisma.presentation.findMany({
      where: { workspaceId },
      select: { id: true, title: true, slidesJson: true, status: true, createdAt: true },
    }),
    prisma.diagram.findMany({
      where: { workspaceId },
      select: { id: true, title: true, mermaidCode: true, status: true, createdAt: true },
    }),
    prisma.chatThread.findMany({
      where: { workspaceId },
      select: {
        id: true,
        title: true,
        userId: true,
        transcriptId: true,
        createdAt: true,
        messages: {
          select: { role: true, content: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: AUDIT_EXPORT_LIMIT,
    }),
    prisma.note.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [{ visibility: "WORKSPACE" }, { userId: exportedBy }],
      },
      select: {
        id: true,
        userId: true,
        title: true,
        body: true,
        visibility: true,
        pinned: true,
        projectId: true,
        transcriptId: true,
        periodType: true,
        periodStart: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // Trackers exist only in a personal workspace and belong to its owner.
    prisma.tracker.findMany({
      where: { workspaceId, userId: exportedBy },
      select: {
        id: true,
        name: true,
        kind: true,
        unit: true,
        aggregation: true,
        goalValue: true,
        goalDirection: true,
        goalPeriod: true,
        archivedAt: true,
        createdAt: true,
        entries: {
          where: { status: { not: "REJECTED" } },
          select: {
            id: true,
            date: true,
            value: true,
            label: true,
            details: true,
            status: true,
            source: true,
            noteId: true,
            createdAt: true,
          },
          orderBy: { date: "asc" },
        },
      },
    }),
    // Daily report proposals are as private as the day note they came from.
    prisma.taskUpdateProposal.findMany({
      where: { workspaceId, userId: exportedBy },
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        detail: true,
        day: true,
        noteId: true,
        taskId: true,
        projectId: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const transcriptsOut = [];
  for (const { rawMicUrl, rawSysUrl, ...t } of transcripts) {
    transcriptsOut.push({
      ...t,
      audio: { microphone: await signed(rawMicUrl), system: await signed(rawSysUrl) },
    });
  }

  const contextsOut = [];
  for (const c of contexts) {
    const files = [];
    for (const { bucketPath, ...f } of c.files) {
      let url: string | null = null;
      try {
        url = bucketPath ? await signedUrlForPath(bucketPath, DISPLAY_URL_TTL_MS) : null;
      } catch {
        url = null;
      }
      files.push({ ...f, url });
    }
    contextsOut.push({ ...c, files });
  }

  return {
    format: "plan-ai-workspace-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    linksExpireInHours: DISPLAY_URL_TTL_MS / 3_600_000,
    workspace,
    members: members.map((m) => ({ ...m.user, role: m.role })),
    projects,
    transcripts: transcriptsOut,
    contexts: contextsOut,
    documents,
    presentations,
    diagrams,
    chatThreads: threads,
    notes,
    ...(trackers.length > 0 ? { trackers } : {}),
    ...(taskUpdates.length > 0 ? { dailyReportProposals: taskUpdates } : {}),
    auditLog,
  };
}
