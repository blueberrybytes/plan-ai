import { Controller } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import { requireActiveSubscription } from "../services/subscriptionGuard";
import { checkUsageLimit } from "../services/usageLimitGuard";

export abstract class BaseWorkspaceController extends Controller {
  protected async getAuthorizedWorkspaceAccess(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const workspaceId = request.headers["x-workspace-id"] as string;
    if (!workspaceId) {
      this.setStatus(400);
      throw { status: 400, message: "Missing x-workspace-id header" };
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw { status: 404, message: "User not found" };
    }

    // Global admins can access any workspace without being a member
    if (user.role === "ADMIN") {
      return { user, workspaceId, role: "OWNER" as const };
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });

    if (!membership) {
      this.setStatus(403);
      throw { status: 403, message: "Forbidden: Not a member of this workspace" };
    }

    return { user, workspaceId, role: membership.role };
  }

  /**
   * Ensures the caller is an OWNER or ADMIN of the current workspace.
   * Used to protect integration management endpoints (connect/edit/delete).
   */
  protected async requireAdminOrOwner(request: AuthenticatedRequest) {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    if (role !== "OWNER" && role !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace Owners and Admins can manage integrations" };
    }
    return { user, workspaceId, role };
  }

  /**
   * Auth + workspace access + **active subscription required**.
   *
   * Use this in any controller method that triggers paid AI work:
   *   - LLM completions (OpenRouter)
   *   - Audio transcription (Deepgram)
   *   - Vector embeddings (Qdrant + embedding model)
   *   - Document/Slide/Diagram generation (LLM-backed)
   *   - Chat streaming
   *
   * Throws `SubscriptionRequiredError` (HTTP 402) if the workspace doesn't
   * have an active subscription. Read-only endpoints (GET) should keep
   * using `getAuthorizedWorkspaceAccess` so users with lapsed subs can
   * still browse their existing data.
   *
   * Bypassed for courtesy workspaces and for self-hosted instances without
   * `STRIPE_SECRET_KEY` configured.
   */
  protected async getPaidWorkspaceAccess(request: AuthenticatedRequest) {
    const access = await this.getAuthorizedWorkspaceAccess(request);
    await requireActiveSubscription(access.workspaceId);
    return access;
  }

  /**
   * Auth + subscription + **LLM token limit** check.
   * Use for endpoints that consume LLM tokens: chat, task extraction, etc.
   */
  protected async getPaidLlmAccess(request: AuthenticatedRequest) {
    const access = await this.getPaidWorkspaceAccess(request);
    await checkUsageLimit(access.workspaceId, "llm");
    return access;
  }

  /**
   * Auth + subscription + **recording duration limit** check.
   * Use for endpoints that create transcriptions from audio.
   */
  protected async getPaidRecordingAccess(request: AuthenticatedRequest) {
    const access = await this.getPaidWorkspaceAccess(request);
    await checkUsageLimit(access.workspaceId, "recording");
    return access;
  }

  /**
   * Auth + subscription + **generation count limit** check.
   * Use for endpoints that create docs, slides, or diagrams.
   */
  protected async getPaidGenerationAccess(request: AuthenticatedRequest) {
    const access = await this.getPaidWorkspaceAccess(request);
    await checkUsageLimit(access.workspaceId, "generation");
    return access;
  }
}
