import { Controller, Get, Post, Request, Route, Security, Tags } from "tsoa";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { recordAudit } from "../services/auditLogService";
import {
  getQdrantWorkspaceBackfillStatus,
  startQdrantWorkspaceBackfill,
  type QdrantWorkspaceBackfillStatus,
} from "../services/qdrantWorkspaceBackfill";

export type QdrantWorkspaceBackfillResponse = QdrantWorkspaceBackfillStatus;

/**
 * One-off maintenance jobs for platform admins. They exist because the
 * production host gives no shell: what used to be a script run by hand is a
 * button on the admin maintenance page.
 *
 * The jobs run in the background. Every endpoint here answers at once: the
 * two POSTs start a run, the GET says how far it is.
 */
@Tags("Admin")
@Route("api/admin/maintenance")
@Security("AdminOnly")
export class AdminMaintenanceController extends Controller {
  /** Where the last run is. Reads memory only. */
  @Get("qdrant-workspace")
  public async getQdrantWorkspaceStatus(): Promise<QdrantWorkspaceBackfillResponse> {
    return getQdrantWorkspaceBackfillStatus();
  }

  /** Starts counting the Qdrant points that lack their workspace. Changes nothing. */
  @Post("qdrant-workspace/check")
  public async checkQdrantWorkspace(): Promise<QdrantWorkspaceBackfillResponse> {
    return startQdrantWorkspaceBackfill(false);
  }

  /**
   * Starts stamping the Qdrant points that lack their workspace. Safe to
   * repeat and to run while the platform is in use.
   */
  @Post("qdrant-workspace/apply")
  public async applyQdrantWorkspace(
    @Request() request: AuthenticatedRequest,
  ): Promise<QdrantWorkspaceBackfillResponse> {
    const started = startQdrantWorkspaceBackfill(true);
    const admin = request.user?.uid
      ? await prisma.user.findUnique({
          where: { firebaseUid: request.user.uid },
          select: { id: true, email: true },
        })
      : null;
    await recordAudit({
      actor: admin ?? { email: request.user?.email ?? null },
      action: "platform_admin.qdrant_workspace_backfill",
      metadata: { started: started.startedAt ?? "" },
      request,
    });
    return started;
  }
}
