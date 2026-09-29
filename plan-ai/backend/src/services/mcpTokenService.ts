import crypto from "crypto";
import prisma from "../prisma/prismaClient";
import { checkWorkspacePolicy } from "./workspaceAccess";

const TOKEN_PREFIX = "PAI_sk_";
const TOKEN_BYTES = 32;

/**
 * Generates a secure random token string.
 * Returns the raw token (shown to the user once) and the hashed version (stored in DB).
 */
function generateToken(): { raw: string; hash: string; prefix: string } {
  const randomPart = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const raw = `${TOKEN_PREFIX}${randomPart}`;
  const hash = hashToken(raw);
  const prefix = raw.substring(0, 12); // "PAI_sk_" + 5 chars
  return { raw, hash, prefix };
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface CreateMcpTokenResult {
  /** The raw token — shown to the user ONCE. Never stored. */
  rawToken: string;
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  createdAt: Date;
}

export interface McpTokenListItem {
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * Creates a new MCP token scoped to a user + workspace.
 * The raw token is returned once and never stored.
 */
export async function createMcpToken(
  userId: string,
  workspaceId: string,
  name: string,
): Promise<CreateMcpTokenResult> {
  const { raw, hash, prefix } = generateToken();

  const token = await prisma.mcpToken.create({
    data: {
      userId,
      workspaceId,
      name,
      tokenHash: hash,
      prefix,
    },
  });

  return {
    rawToken: raw,
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    workspaceId: token.workspaceId,
    createdAt: token.createdAt,
  };
}

/**
 * Validates a raw Bearer token from an incoming MCP request.
 * Returns the associated userId + workspaceId, or null if invalid.
 */
export async function validateMcpToken(
  raw: string,
): Promise<{ userId: string; workspaceId: string; tokenId: string } | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(raw);

  const token = await prisma.mcpToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, workspaceId: true },
  });

  if (!token) return null;
  if (!(await tokenOwnerStillAllowed(token.userId, token.workspaceId))) return null;

  // Update lastUsedAt asynchronously — never block the request
  prisma.mcpToken
    .update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Best-effort — ignore failures
    });

  return { userId: token.userId, workspaceId: token.workspaceId, tokenId: token.id };
}

/**
 * A token only works while its owner is still a member of the workspace and
 * meets its email-domain rule. MFA and SSO rules apply to interactive
 * sign-ins; a token is created from such a session.
 */
async function tokenOwnerStillAllowed(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      user: { select: { email: true } },
      workspace: { select: { allowedEmailDomains: true } },
    },
  });
  if (!membership) return false;
  const domainRule = {
    allowedEmailDomains: membership.workspace.allowedEmailDomains,
    requireMfa: false,
    requiredSignInProvider: null,
  };
  return checkWorkspacePolicy(domainRule, membership.user.email, undefined) === null;
}

/**
 * For MCP sessions that stay open: checked on every request, so revoking a
 * token or removing the member ends an open session too.
 */
export async function isMcpTokenActive(tokenId: string): Promise<boolean> {
  const token = await prisma.mcpToken.findUnique({
    where: { id: tokenId },
    select: { userId: true, workspaceId: true },
  });
  return !!token && (await tokenOwnerStillAllowed(token.userId, token.workspaceId));
}

/** Deletes a member's tokens for one workspace. Called when they are removed. */
export async function revokeMcpTokensForMember(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const { count } = await prisma.mcpToken.deleteMany({ where: { userId, workspaceId } });
  return count;
}

/**
 * Returns all tokens for a user — never exposes tokenHash.
 */
export async function listMcpTokens(userId: string): Promise<McpTokenListItem[]> {
  const tokens = await prisma.mcpToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      workspaceId: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return tokens;
}

/**
 * Revokes (deletes) an MCP token, verifying ownership before deletion.
 */
export async function revokeMcpToken(tokenId: string, userId: string): Promise<void> {
  await prisma.mcpToken.deleteMany({
    where: { id: tokenId, userId },
  });
}
