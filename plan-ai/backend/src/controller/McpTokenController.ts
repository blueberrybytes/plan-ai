import {
  Controller,
  Post,
  Get,
  Delete,
  Route,
  Body,
  Path,
  Security,
  Request,
  Tags,
  SuccessResponse,
} from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  CreateMcpTokenResult,
  McpTokenListItem,
} from "../services/mcpTokenService";
import prisma from "../prisma/prismaClient";

interface CreateMcpTokenRequest {
  /** A friendly label for this token, e.g. "Claude Code - MacBook" */
  name: string;
  /** The workspace ID to scope this token to */
  workspaceId: string;
}

interface CreateMcpTokenResponse {
  /** The raw token — shown ONCE, never retrievable again */
  rawToken: string;
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  createdAt: string;
}

interface ListMcpTokensResponse {
  tokens: Array<{
    id: string;
    name: string;
    prefix: string;
    workspaceId: string;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
}

@Route("api/mcp-tokens")
@Tags("MCP")
@Security("BearerAuth")
export class McpTokenController extends Controller {
  /**
   * Create a new MCP personal access token scoped to a workspace.
   * The raw token is returned ONCE in the response and cannot be retrieved later.
   */
  @Post()
  @SuccessResponse(201, "Token created")
  async createToken(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateMcpTokenRequest,
  ): Promise<CreateMcpTokenResponse> {
    const uid = req.user!.uid;

    // Verify the user is a member of this workspace
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (!dbUser) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: dbUser.id, workspaceId: body.workspaceId },
    });
    if (!membership) {
      this.setStatus(403);
      throw new Error("You are not a member of this workspace");
    }

    const result: CreateMcpTokenResult = await createMcpToken(
      dbUser.id,
      body.workspaceId,
      body.name,
    );

    this.setStatus(201);
    return {
      rawToken: result.rawToken,
      id: result.id,
      name: result.name,
      prefix: result.prefix,
      workspaceId: result.workspaceId,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * List all MCP tokens for the current user (all workspaces).
   * Never returns the raw token — only the prefix and metadata.
   */
  @Get()
  async listTokens(@Request() req: AuthenticatedRequest): Promise<ListMcpTokensResponse> {
    const uid = req.user!.uid;
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (!dbUser) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const tokens: McpTokenListItem[] = await listMcpTokens(dbUser.id);

    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        workspaceId: t.workspaceId,
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Revoke (delete) an MCP token by ID.
   * Only the owner can revoke their own tokens.
   */
  @Delete("{tokenId}")
  @SuccessResponse(204, "Token revoked")
  async revokeToken(@Request() req: AuthenticatedRequest, @Path() tokenId: string): Promise<void> {
    const uid = req.user!.uid;
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (!dbUser) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    await revokeMcpToken(tokenId, dbUser.id);
    this.setStatus(204);
  }
}
