import { rawPrisma } from "../prisma/prismaClient";

/**
 * Courtesy workspaces, for platform admins.
 *
 * A courtesy workspace runs on the platform's own AI and transcription keys
 * and skips the subscription check and the usage limits. It is a flag on the
 * workspace, not on a person: to give someone courtesy access, their workspace
 * gets it. Until now the only way to set it was a query on the database.
 *
 * The unfiltered client is used on purpose: this lists workspaces by name and
 * size for the platform admin, who is not a member of them.
 */

export interface AdminUserWorkspace {
  workspaceId: string;
  name: string;
  /** TEAM or PERSONAL. */
  kind: string;
  tier: string;
  /** The user's role in it. */
  role: string;
  isCourtesy: boolean;
  members: number;
}

interface CourtesyError {
  status: number;
  message: string;
}
const fail = (status: number, message: string): CourtesyError => ({ status, message });

/** The workspaces a user belongs to, the ones they own first. */
export async function listUserWorkspaces(userId: string): Promise<AdminUserWorkspace[]> {
  const user = await rawPrisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw fail(404, "User not found");
  const memberships = await rawPrisma.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          kind: true,
          tier: true,
          isCourtesy: true,
          _count: { select: { members: true } },
        },
      },
    },
  });
  const rank = (role: string) => (role === "OWNER" ? 0 : role === "ADMIN" ? 1 : 2);
  return memberships
    .map((m) => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      kind: m.workspace.kind,
      tier: m.workspace.tier,
      role: m.role,
      isCourtesy: m.workspace.isCourtesy,
      members: m.workspace._count.members,
    }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
}

export interface CourtesyChange {
  workspaceId: string;
  name: string;
  isCourtesy: boolean;
  /** False when the workspace already had this value. */
  changed: boolean;
}

export async function setWorkspaceCourtesy(
  workspaceId: string,
  isCourtesy: boolean,
): Promise<CourtesyChange> {
  if (typeof isCourtesy !== "boolean") throw fail(400, "isCourtesy must be true or false.");
  const workspace = await rawPrisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, isCourtesy: true },
  });
  if (!workspace) throw fail(404, "Workspace not found");
  const changed = workspace.isCourtesy !== isCourtesy;
  if (changed) {
    await rawPrisma.workspace.update({ where: { id: workspaceId }, data: { isCourtesy } });
  }
  return { workspaceId, name: workspace.name, isCourtesy, changed };
}

/** How many courtesy workspaces each user owns. For the admin user list. */
export async function courtesyCountByOwner(): Promise<Map<string, number>> {
  const rows = await rawPrisma.workspaceMember.groupBy({
    by: ["userId"],
    where: { role: "OWNER", workspace: { isCourtesy: true } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.userId, r._count._all]));
}
