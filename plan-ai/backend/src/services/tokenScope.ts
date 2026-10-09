import { rawPrisma } from "../prisma/prismaClient";
import { setHiddenForRequest } from "./accessScope";
import { hiddenFromMember, hiddenFromOutsiders } from "./projectAccess";

/**
 * A personal token acts as its user in its workspace, so it sees what that
 * member sees: the restricted projects they are not part of stay hidden.
 * Must run in every request made with a token, before any query. Used by the
 * MCP endpoint and by the public API.
 */
export async function scopeToMember(userId: string, workspaceId: string): Promise<void> {
  const member = await rawPrisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  setHiddenForRequest(
    member
      ? await hiddenFromMember(workspaceId, userId, member.role)
      : await hiddenFromOutsiders(workspaceId),
  );
}
