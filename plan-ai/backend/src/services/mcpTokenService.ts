import crypto from "crypto";
import prisma from "../prisma/prismaClient";

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
