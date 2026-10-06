import type { User, WorkspaceRole } from "@prisma/client";
import { setHiddenForRequest } from "./accessScope";
import { hiddenFromMember, hiddenFromOutsiders } from "./projectAccess";
import prisma from "../prisma/prismaClient";
import { recordAudit, type AuditRequestInfo } from "./auditLogService";

/** What the verified Firebase token says about how the user signed in. */
export interface SignInInfo {
  email?: string;
  /** Firebase `sign_in_provider`, e.g. "google.com", "password", "saml.acme". */
  signInProvider?: string;
  /** Firebase `sign_in_second_factor`, set when the sign-in used MFA. */
  secondFactor?: string;
}

export interface WorkspaceAccess {
  user: User;
  workspaceId: string;
  role: WorkspaceRole;
}

/** Thrown as a plain object, like the rest of the controllers do. */
export interface WorkspaceAccessError {
  status: number;
  message: string;
  code?: string;
}

export interface WorkspacePolicy {
  allowedEmailDomains: string[];
  requireMfa: boolean;
  requiredSignInProvider: string | null;
}

const fail = (status: number, message: string, code?: string): WorkspaceAccessError => ({
  status,
  message,
  ...(code ? { code } : {}),
});

const emailDomain = (email: string | undefined | null): string =>
  (email ?? "").split("@").pop()?.trim().toLowerCase() ?? "";

/**
 * Checks a sign-in against a workspace's rules. Returns the error to throw,
 * or null when the sign-in is allowed.
 */
export function checkWorkspacePolicy(
  policy: WorkspacePolicy,
  email: string | undefined | null,
  signIn: SignInInfo | undefined,
): WorkspaceAccessError | null {
  if (policy.allowedEmailDomains.length > 0) {
    const domain = emailDomain(email);
    const allowed = policy.allowedEmailDomains.map((d) => d.trim().toLowerCase());
    if (!domain || !allowed.includes(domain)) {
      return fail(
        403,
        `This workspace only allows accounts from ${allowed.join(", ")}.`,
        "email_domain_not_allowed",
      );
    }
  }
  if (policy.requiredSignInProvider && signIn?.signInProvider !== policy.requiredSignInProvider) {
    return fail(
      403,
      "This workspace requires you to sign in with your company account.",
      "sso_required",
    );
  }
  if (policy.requireMfa && !signIn?.secondFactor) {
    return fail(
      403,
      "This workspace requires two-step verification. Sign in again with your second factor.",
      "mfa_required",
    );
  }
  return null;
}

/**
 * Platform admins (User.role ADMIN) are BlueBerryBytes staff. They get no
 * access to customer workspaces unless PLATFORM_ADMIN_SUPPORT_ACCESS is
 * "true", and then every access is written to that workspace's audit log.
 */
const supportAccessEnabled = (): boolean => process.env.PLATFORM_ADMIN_SUPPORT_ACCESS === "true";

// One audit entry per admin and workspace per hour, not one per request.
const SUPPORT_AUDIT_INTERVAL_MS = 60 * 60_000;
const lastSupportAudit = new Map<string, number>();

const auditSupportAccess = async (
  user: User,
  workspaceId: string,
  request?: AuditRequestInfo,
): Promise<void> => {
  const key = `${user.id}:${workspaceId}`;
  const now = Date.now();
  if (now - (lastSupportAudit.get(key) ?? 0) < SUPPORT_AUDIT_INTERVAL_MS) return;
  lastSupportAudit.set(key, now);
  await recordAudit({
    workspaceId,
    actor: { id: user.id, email: user.email },
    action: "platform_admin.access",
    request,
  });
};

/**
 * Resolves who the caller is in a workspace. Every route that reads or
 * changes workspace data must go through here (TSOA controllers do it via
 * BaseWorkspaceController, Express routers call it directly).
 */
export async function resolveWorkspaceAccess(params: {
  firebaseUid: string;
  workspaceId: string | undefined;
  signIn?: SignInInfo;
  request?: AuditRequestInfo;
}): Promise<WorkspaceAccess> {
  const { firebaseUid, signIn, request } = params;
  const workspaceId = params.workspaceId?.trim();
  if (!workspaceId) throw fail(400, "Missing x-workspace-id header");

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) throw fail(404, "User not found");

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: {
      role: true,
      workspace: {
        select: { allowedEmailDomains: true, requireMfa: true, requiredSignInProvider: true },
      },
    },
  });

  if (!membership) {
    if (user.role === "ADMIN" && supportAccessEnabled()) {
      const exists = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });
      if (exists) {
        await auditSupportAccess(user, workspaceId, request);
        // Support sees the workspace as its owner would, except the restricted
        // projects: nobody of the platform was added to those.
        setHiddenForRequest(await hiddenFromOutsiders(workspaceId));
        return { user, workspaceId, role: "OWNER" };
      }
    }
    throw fail(403, "Forbidden: Not a member of this workspace");
  }

  const policyError = checkWorkspacePolicy(
    membership.workspace,
    signIn?.email || user.email,
    signIn,
  );
  if (policyError) throw policyError;

  // From here on, every query of this request leaves out the restricted
  // projects this member is not part of (see services/accessScope.ts).
  setHiddenForRequest(await hiddenFromMember(workspaceId, user.id, membership.role));

  return { user, workspaceId, role: membership.role };
}

/** Reads the X-Workspace-Id header, which Express may give as an array. */
export const workspaceIdFromHeaders = (headers: Record<string, unknown>): string | undefined => {
  const raw = headers["x-workspace-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : undefined;
};
