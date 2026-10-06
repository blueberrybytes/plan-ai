/**
 * Helpers to translate between user-facing `projectIds` and internal
 * `contextIds`. Since Project ⇄ Context is 1:1 (auto-created), the mapping
 * is a simple SELECT.
 *
 * Used in the API boundary: incoming requests carry `projectIds`, all internal
 * services (vectors, RAG, queryContexts, etc) keep working with `contextIds`.
 */

import prisma from "../prisma/prismaClient";

/**
 * Map projectIds to their paired contextIds, for projects of this workspace
 * only. Ids of another workspace's projects resolve to nothing: the ids come
 * from the client, and whoever knows a project id must not get its files.
 * Order is NOT preserved (it's a set operation). Projects without a Context
 * are silently dropped.
 */
export async function resolveProjectIdsToContextIds(
  projectIds: string[] | undefined | null,
  workspaceId: string,
): Promise<string[]> {
  if (!projectIds || projectIds.length === 0 || !workspaceId) return [];
  const contexts = await prisma.context.findMany({
    where: { projectId: { in: projectIds }, workspaceId },
    select: { id: true },
  });
  return contexts.map((c) => c.id);
}

/** The contextIds that belong to this workspace. The rest are dropped. */
export async function keepWorkspaceContextIds(
  contextIds: string[] | undefined | null,
  workspaceId: string,
): Promise<string[]> {
  if (!contextIds || contextIds.length === 0 || !workspaceId) return [];
  const contexts = await prisma.context.findMany({
    where: { id: { in: contextIds }, workspaceId },
    select: { id: true },
  });
  return contexts.map((c) => c.id);
}

/**
 * Map contextIds → their owning projectIds. Contexts without a project are
 * silently dropped. Used to build user-facing responses from legacy data.
 */
export async function resolveContextIdsToProjectIds(
  contextIds: string[] | undefined | null,
): Promise<string[]> {
  if (!contextIds || contextIds.length === 0) return [];
  const contexts = await prisma.context.findMany({
    where: { id: { in: contextIds }, projectId: { not: null } },
    select: { projectId: true },
  });
  return contexts.map((c) => c.projectId).filter((id): id is string => id !== null);
}

/**
 * Merge incoming `projectIds` (translated) with any direct `contextIds` the
 * caller also provided, keeping only what belongs to this workspace. Dedupes
 * the result. For endpoints that accept both shapes.
 */
export async function mergeProjectAndContextIds(
  projectIds: string[] | undefined | null,
  contextIds: string[] | undefined | null,
  workspaceId: string,
): Promise<string[]> {
  const [fromProjects, direct] = await Promise.all([
    resolveProjectIdsToContextIds(projectIds, workspaceId),
    keepWorkspaceContextIds(contextIds, workspaceId),
  ]);
  return Array.from(new Set([...fromProjects, ...direct]));
}
