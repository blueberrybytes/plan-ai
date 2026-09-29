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
    logger.warn(`[Export] Could not sign ${ref}: ${(err as Error)?.message}`);
    return null;
  }
};

export async function exportWorkspace(workspaceId: string): Promise<Record<string, unknown>> {
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
    auditLog,
  };
}
