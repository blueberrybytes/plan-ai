import { Controller, Get, Post, Request, Route, Security, Tags } from "tsoa";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { recordAudit } from "../services/auditLogService";
import {
  applyQdrantWorkspaceBackfill,
  checkQdrantWorkspaceBackfill,
  type QdrantWorkspaceBackfillResult,
} from "../services/qdrantWorkspaceBackfill";

export type QdrantWorkspaceBackfillResponse = QdrantWorkspaceBackfillResult;

/**
 * One-off maintenance jobs for platform admins. They exist because the
 * production host gives no shell: what used to be a script run by hand is a
 * button on the admin maintenance page.
 */
@Tags("Admin")
@Route("api/admin/maintenance")
@Security("AdminOnly")
export class AdminMaintenanceController extends Controller {
  /** How many Qdrant points still lack their workspace. Changes nothing. */
  @Get("qdrant-workspace")
  public async checkQdrantWorkspace(): Promise<QdrantWorkspaceBackfillResponse> {
    return checkQdrantWorkspaceBackfill();
  }

  /**
   * Stamps the Qdrant points that lack their workspace. Safe to repeat and to
   * run while the platform is in use.
   */
  @Post("qdrant-workspace/apply")
  public async applyQdrantWorkspace(
    @Request() request: AuthenticatedRequest,
  ): Promise<QdrantWorkspaceBackfillResponse> {
    const result = await applyQdrantWorkspaceBackfill();
    const admin = request.user?.uid
      ? await prisma.user.findUnique({
          where: { firebaseUid: request.user.uid },
          select: { id: true, email: true },
        })
      : null;
    await recordAudit({
      actor: admin ?? { email: request.user?.email ?? null },
      action: "platform_admin.qdrant_workspace_backfill",
      metadata: {
        stamped: result.stamped,
        orphans: result.orphans,
        missingAfter: result.missingAfter,
      },
      request,
    });
    return result;
  }
}
