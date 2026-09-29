import type { User } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { recordAudit } from "./auditLogService";
import { checkWorkspacePolicy } from "./workspaceAccess";
import { logger } from "../utils/logger";

/**
 * Adds the user to every workspace with a pending, unexpired invitation for
 * their email. Only call it with an email the sign-in has proven (verified,
 * or from Google or Apple): an invitation is a promise to whoever owns that
 * address. Invitations to a workspace whose email-domain rule the address
 * does not meet are left pending.
 */
export async function acceptPendingInvitations(user: User, email: string): Promise<number> {
  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      workspace: {
        select: { allowedEmailDomains: true, requireMfa: true, requiredSignInProvider: true },
      },
    },
  });

  let accepted = 0;
  for (const invite of invitations) {
    const domainRule = { ...invite.workspace, requireMfa: false, requiredSignInProvider: null };
    if (checkWorkspacePolicy(domainRule, email, undefined)) continue;
    try {
      await prisma.$transaction([
        prisma.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
          update: {},
          create: {
            userId: user.id,
            workspaceId: invite.workspaceId,
            role: invite.role,
            personas: invite.personas,
            personaNotes: invite.personaNotes,
          },
        }),
        prisma.workspaceInvitation.update({
          where: { id: invite.id },
          data: { status: "ACCEPTED" },
        }),
      ]);
      accepted++;
      await recordAudit({
        workspaceId: invite.workspaceId,
        actor: { id: user.id, email },
        action: "member.joined",
        targetType: "user",
        targetId: user.id,
        metadata: { invitationId: invite.id, role: invite.role },
      });
    } catch (err) {
      logger.error(`[Invitations] Could not accept invitation ${invite.id}`, err);
    }
  }
  return accepted;
}
