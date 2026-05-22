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
 * Map projectIds → their paired contextIds. Order is NOT preserved (it's a
 * set operation). Projects without a Context are silently dropped — that
 * should not happen after the migration has run, but defending against it.
 */
export async function resolveProjectIdsToContextIds(
  projectIds: string[] | undefined | null,
): Promise<string[]> {
  if (!projectIds || projectIds.length === 0) return [];
  const contexts = await prisma.context.findMany({
    where: { projectId: { in: projectIds } },
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
  return contexts
    .map((c) => c.projectId)
    .filter((id): id is string => id !== null);
}

/**
 * Merge incoming `projectIds` (translated) with any direct `contextIds`
 * the caller also provided. Dedupes the result. Convenience for endpoints
 * that accept both shapes during the migration period.
 */
export async function mergeProjectAndContextIds(
  projectIds: string[] | undefined | null,
  contextIds: string[] | undefined | null,
): Promise<string[]> {
  const fromProjects = await resolveProjectIdsToContextIds(projectIds);
  const direct = contextIds ?? [];
  return Array.from(new Set([...fromProjects, ...direct]));
}
