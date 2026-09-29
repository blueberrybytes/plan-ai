import prisma from "../prisma/prismaClient";
import { deleteObjectRef, deletePrefix, deleteStoredObject } from "../firebase/privateStorage";
import { qdrantClient, getContextCollectionName } from "../vector/qdrantClient";
import { removeContextVectors } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";

/**
 * Deleting a row is not enough: meetings leave audio in the bucket and text
 * in Qdrant, contexts leave their files and vectors, chats leave attachments.
 * These helpers remove what lives outside Postgres. Each step is best effort
 * and logged, so one missing object does not stop the rest.
 */

const attempt = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn();
  } catch (err) {
    logger.error(`[DataDeletion] ${label} failed`, err);
  }
};

/** Meeting text is indexed with fileId "transcript:<id>" in the project's context. */
const deleteTranscriptVectors = async (transcriptIds: string[]): Promise<void> => {
  if (transcriptIds.length === 0) return;
  await attempt("delete transcript vectors", () =>
    qdrantClient.delete(getContextCollectionName(), {
      wait: true,
      filter: {
        should: transcriptIds.map((id) => ({
          key: "fileId",
          match: { value: `transcript:${id}` },
        })),
      },
    }),
  );
};

export interface TranscriptArtifacts {
  id: string;
  rawMicUrl: string | null;
  rawSysUrl: string | null;
}

/** Audio files and search vectors of these meetings. Call before deleting the rows. */
export async function deleteTranscriptArtifacts(transcripts: TranscriptArtifacts[]): Promise<void> {
  for (const t of transcripts) {
    for (const ref of [t.rawMicUrl, t.rawSysUrl]) {
      if (ref) await attempt(`delete audio of ${t.id}`, () => deleteStoredObject(ref));
    }
  }
  // Qdrant filters have a size limit; delete in batches.
  for (let i = 0; i < transcripts.length; i += 200) {
    await deleteTranscriptVectors(transcripts.slice(i, i + 200).map((t) => t.id));
  }
}

/** Files and vectors of these contexts. Call before deleting the rows. */
export async function deleteContextArtifacts(contextIds: string[]): Promise<void> {
  if (contextIds.length === 0) return;
  const files = await prisma.contextFile.findMany({
    where: { contextId: { in: contextIds } },
    select: { bucketPath: true },
  });
  for (const f of files) {
    // Stored as a plain object path, which deleteStoredObject does not accept.
    if (f.bucketPath)
      await attempt(`delete file ${f.bucketPath}`, () => deleteObjectRef(f.bucketPath));
  }
  for (const id of contextIds) await removeContextVectors(id);
}

/** Attachments of these chat threads (stored under chat-attachments/<userId>/<threadId>/). */
export async function deleteChatThreadArtifacts(
  threads: { id: string; userId: string }[],
): Promise<void> {
  for (const t of threads) {
    await attempt(`delete attachments of thread ${t.id}`, () =>
      deletePrefix(`chat-attachments/${t.userId}/${t.id}/`),
    );
  }
}

/** Everything of a project outside Postgres: its meetings and its contexts. */
export async function deleteProjectArtifacts(projectId: string): Promise<void> {
  const [transcripts, contexts] = await Promise.all([
    prisma.transcript.findMany({
      where: { projectId },
      select: { id: true, rawMicUrl: true, rawSysUrl: true },
    }),
    prisma.context.findMany({ where: { projectId }, select: { id: true } }),
  ]);
  await deleteTranscriptArtifacts(transcripts);
  await deleteContextArtifacts(contexts.map((c) => c.id));
}

/** Deletes a workspace with all its data, inside and outside Postgres. */
export async function deleteWorkspaceData(workspaceId: string): Promise<void> {
  const [transcripts, contexts, threads] = await Promise.all([
    prisma.transcript.findMany({
      where: { workspaceId },
      select: { id: true, rawMicUrl: true, rawSysUrl: true },
    }),
    prisma.context.findMany({ where: { workspaceId }, select: { id: true } }),
    prisma.chatThread.findMany({ where: { workspaceId }, select: { id: true, userId: true } }),
  ]);
  await deleteTranscriptArtifacts(transcripts);
  await deleteContextArtifacts(contexts.map((c) => c.id));
  await deleteChatThreadArtifacts(threads);
  // Rows go by cascade from the workspace.
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

export class AccountDeletionBlockedError extends Error {
  constructor(public readonly workspaceNames: string[]) {
    super(
      `You own workspaces with other members (${workspaceNames.join(", ")}). Transfer ownership or delete them first.`,
    );
  }
}

/**
 * Deletes a user and their personal data. Workspaces where they are the only
 * member go with them. Owning a workspace that has other members blocks the
 * deletion: that data belongs to the team, so ownership must be handed over
 * first.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, voiceProfileUrl: true },
  });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  });

  const blocking = memberships.filter((m) => m.role === "OWNER" && m.workspace._count.members > 1);
  if (blocking.length > 0) {
    throw new AccountDeletionBlockedError(blocking.map((m) => m.workspace.name));
  }

  for (const m of memberships) {
    if (m.workspace._count.members === 1) await deleteWorkspaceData(m.workspace.id);
  }

  // What cascades from the user row in shared workspaces: their meetings,
  // contexts and chats. Clean what those leave outside Postgres.
  const [transcripts, contexts, threads] = await Promise.all([
    prisma.transcript.findMany({
      where: { userId },
      select: { id: true, rawMicUrl: true, rawSysUrl: true },
    }),
    prisma.context.findMany({ where: { userId }, select: { id: true } }),
    prisma.chatThread.findMany({ where: { userId }, select: { id: true, userId: true } }),
  ]);
  await deleteTranscriptArtifacts(transcripts);
  await deleteContextArtifacts(contexts.map((c) => c.id));
  await deleteChatThreadArtifacts(threads);
  await attempt("delete chat attachments", () => deletePrefix(`chat-attachments/${userId}/`));
  if (user.voiceProfileUrl) {
    const ref = user.voiceProfileUrl;
    await attempt("delete voice profile", () => deleteStoredObject(ref));
  }

  await prisma.$transaction([
    // UserIntegration has no cascade, so it would block the delete.
    prisma.userIntegration.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
