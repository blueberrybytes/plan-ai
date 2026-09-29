import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import {
  resolveWorkspaceAccess,
  workspaceIdFromHeaders,
  type WorkspaceAccess,
  type WorkspaceAccessError,
} from "../services/workspaceAccess";
import { logger } from "../utils/logger";

export interface WorkspaceRequest extends AuthenticatedRequest {
  workspaceAccess?: WorkspaceAccess;
}

/**
 * For Express routers (TSOA controllers use BaseWorkspaceController). Goes
 * after authenticateUser and checks the caller is a member of the workspace
 * in X-Workspace-Id, so handlers can trust that header.
 */
export const requireWorkspaceMember = async (
  req: WorkspaceRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    req.workspaceAccess = await resolveWorkspaceAccess({
      firebaseUid: req.user.uid,
      workspaceId: workspaceIdFromHeaders(req.headers),
      signIn: req.user,
      request: req,
    });
    next();
  } catch (err) {
    const accessError = err as WorkspaceAccessError;
    if (typeof accessError?.status === "number") {
      res.status(accessError.status).json({
        message: accessError.message,
        ...(accessError.code ? { code: accessError.code } : {}),
      });
      return;
    }
    logger.error("[WorkspaceMiddleware] Could not resolve workspace access", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
