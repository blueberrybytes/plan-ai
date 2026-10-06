import type { WorkspaceRole } from "@prisma/client";
import { rawPrisma } from "../prisma/prismaClient";
import type { HiddenFromCaller } from "./accessScope";

/**
 * Who sees a RESTRICTED project: the workspace owners, the person who created
 * it and the people added to it. Admins get no pass: a restricted project is
 * where HR, board or acquisition meetings go.
 *
 * These queries use the unfiltered client on purpose. They are the rule, so
 * they cannot be subject to it.
 */

const NOTHING: HiddenFromCaller = { projectIds: [], contextIds: [] };

async function withContexts(projectIds: string[]): Promise<HiddenFromCaller> {
  if (projectIds.length === 0) return NOTHING;
  const contexts = await rawPrisma.context.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  return { projectIds, contextIds: contexts.map((c) => c.id) };
}

/** The restricted projects of the workspace this member cannot see. */
export async function hiddenFromMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<HiddenFromCaller> {
  if (role === "OWNER") return NOTHING;
  const projects = await rawPrisma.project.findMany({
    where: {
      workspaceId,
      visibility: "RESTRICTED",
      userId: { not: userId },
      members: { none: { userId } },
    },
    select: { id: true },
  });
  return withContexts(projects.map((p) => p.id));
}

/**
 * Every restricted project of the workspace. For callers who are not a person
 * of the workspace (platform support access) and for things sent to several
 * people at once, like the weekly emails.
 */
export async function hiddenFromOutsiders(workspaceId: string): Promise<HiddenFromCaller> {
  const projects = await rawPrisma.project.findMany({
    where: { workspaceId, visibility: "RESTRICTED" },
    select: { id: true },
  });
  return withContexts(projects.map((p) => p.id));
}

// ── Managing who sees a project ─────────────────────────────────────────────

export interface ProjectAccessPerson {
  userId: string;
  name: string | null;
  email: string;
}

export interface ProjectAccess {
  visibility: "WORKSPACE" | "RESTRICTED";
  /** The person who created the project. Always sees it. */
  creator: ProjectAccessPerson | null;
  /** People added to the project. Only counts while it is RESTRICTED. */
  members: ProjectAccessPerson[];
  /** Whether the caller may change this. */
  canManage: boolean;
}

interface AccessError {
  status: number;
  message: string;
}
const fail = (status: number, message: string): AccessError => ({ status, message });

/** The workspace owners and the project's creator decide who sees it. */
export const canManageProjectAccess = (
  role: WorkspaceRole,
  userId: string,
  creatorId: string,
): boolean => role === "OWNER" || userId === creatorId;

const person = (u: { id: string; name: string | null; email: string }): ProjectAccessPerson => ({
  userId: u.id,
  name: u.name,
  email: u.email,
});

interface AccessActor {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

/** A caller who cannot see the project gets the same 404 as for one that does not exist. */
async function loadVisible(actor: AccessActor, projectId: string) {
  const project = await rawPrisma.project.findFirst({
    where: { id: projectId, workspaceId: actor.workspaceId },
    select: {
      id: true,
      title: true,
      userId: true,
      visibility: true,
      user: { select: { id: true, name: true, email: true } },
      members: {
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) throw fail(404, "Project not found");
  const sees =
    project.visibility === "WORKSPACE" ||
    actor.role === "OWNER" ||
    project.userId === actor.userId ||
    project.members.some((m) => m.user.id === actor.userId);
  if (!sees) throw fail(404, "Project not found");
  return project;
}

export async function getProjectAccess(
  actor: AccessActor,
  projectId: string,
): Promise<ProjectAccess> {
  const project = await loadVisible(actor, projectId);
  return {
    visibility: project.visibility,
    creator: project.user ? person(project.user) : null,
    members: project.members.map((m) => person(m.user)),
    canManage: canManageProjectAccess(actor.role, actor.userId, project.userId),
  };
}

export interface SetProjectAccessInput {
  visibility: "WORKSPACE" | "RESTRICTED";
  /** The full list of people with access. Ignored for WORKSPACE. */
  memberUserIds?: string[];
}

export interface SetProjectAccessResult {
  access: ProjectAccess;
  title: string;
  /** What changed, for the audit log. */
  change: { from: string; to: string; members: number };
}

export async function setProjectAccess(
  actor: AccessActor,
  projectId: string,
  input: SetProjectAccessInput,
): Promise<SetProjectAccessResult> {
  if (input.visibility !== "WORKSPACE" && input.visibility !== "RESTRICTED") {
    throw fail(400, "Visibility must be WORKSPACE or RESTRICTED.");
  }
  const project = await loadVisible(actor, projectId);
  if (!canManageProjectAccess(actor.role, actor.userId, project.userId)) {
    throw fail(403, "Only a workspace owner or the project's creator can change who sees it.");
  }

  // Keep the list while the project is open, so reopening and restricting
  // again does not lose it. A new list replaces it.
  const wanted =
    input.memberUserIds === undefined
      ? null
      : Array.from(new Set(input.memberUserIds.filter((id) => id && id !== project.userId)));
  if (wanted && wanted.length > 0) {
    const inWorkspace = await rawPrisma.workspaceMember.count({
      where: { workspaceId: actor.workspaceId, userId: { in: wanted } },
    });
    if (inWorkspace !== wanted.length) {
      throw fail(400, "Everyone added to a project must be a member of the workspace.");
    }
  }

  await rawPrisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { visibility: input.visibility } });
    if (wanted) {
      await tx.projectMember.deleteMany({
        where: { projectId: project.id, userId: { notIn: wanted } },
      });
      await tx.projectMember.createMany({
        data: wanted.map((userId) => ({ projectId: project.id, userId, addedById: actor.userId })),
        skipDuplicates: true,
      });
    }
  });

  const access = await getProjectAccess(actor, projectId);
  return {
    access,
    title: project.title,
    change: { from: project.visibility, to: access.visibility, members: access.members.length },
  };
}
