import { Controller } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { resolveWorkspaceAccess, workspaceIdFromHeaders } from "../services/workspaceAccess";
import { requireActiveSubscription } from "../services/subscriptionGuard";
import { checkUsageLimit } from "../services/usageLimitGuard";
import { rememberRequester } from "../services/featureUsageService";

export abstract class BaseWorkspaceController extends Controller {
  protected async getAuthorizedWorkspaceAccess(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    try {
      const access = await resolveWorkspaceAccess({
        firebaseUid: request.user.uid,
        workspaceId: workspaceIdFromHeaders(request.headers),
        signIn: request.user,
        request,
      });
      // For the feature counts: who made this request (see featureUsageService).
      rememberRequester(request, access.user.id, access.workspaceId);
      return access;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status) this.setStatus(status);
      throw err;
    }
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
