import { Controller } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";

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

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });

    if (!membership) {
      this.setStatus(403);
      throw { status: 403, message: "Forbidden: Not a member of this workspace" };
    }

    return { user, workspaceId, role: membership.role };
  }
}
