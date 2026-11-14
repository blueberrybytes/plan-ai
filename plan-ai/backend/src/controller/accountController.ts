import { Body, Controller, Delete, Get, Put, Request, Route, Security, Tags } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { logger } from "../utils/logger";
import { AccountDeletionBlockedError, deleteUserData } from "../services/dataDeletionService";
import { recordAudit } from "../services/auditLogService";
import { ApiResponse, type TsoaJsonObject } from "./controllerTypes";
import { customThemeService } from "../services/customThemeService";
import type { CustomTheme, Prisma } from "@prisma/client";

interface UpdateCustomThemeRequest {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  textPrimaryColor?: string | null;
  textSecondaryColor?: string | null;
  fontFamily?: string | null;
  headingFontFamily?: string | null;
  borderRadius?: number | null;
  density?: number | null;
  configJson?: TsoaJsonObject | null;
}

interface CustomThemeResponse {
  id: string;
  userId: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
  textPrimaryColor: string | null;
  textSecondaryColor: string | null;
  fontFamily: string | null;
  headingFontFamily: string | null;
  borderRadius: number | null;
  density: number | null;
  configJson: TsoaJsonObject | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("account")
@Tags("Account")
export class AccountController extends Controller {
  @Security("BearerAuth")
  @Get("theme")
  public async getCustomTheme(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<CustomThemeResponse | null>> {
    try {
      const firebaseUid = request.user?.uid;
      if (!firebaseUid) {
        this.setStatus(401);
        return {
          status: 401,
          data: null,
          message: "User not authenticated",
        };
      }

      const user = await prisma.user.findUnique({ where: { firebaseUid } });
      if (!user) {
        this.setStatus(404);
        return {
          status: 404,
          data: null,
          message: "User not found",
        };
      }

      const theme = await customThemeService.getByUserId(user.id);

      return {
        status: 200,
        data: theme ? this.mapCustomThemeResponse(theme) : null,
        message: "Theme retrieved successfully",
      };
    } catch (error) {
      logger.error("Failed to fetch custom theme", error);
      this.setStatus(500);
      return {
        status: 500,
        data: null,
        message: "Failed to fetch custom theme",
      };
    }
  }

  @Security("BearerAuth")
  @Put("theme")
  public async upsertCustomTheme(
    @Body() body: UpdateCustomThemeRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<CustomThemeResponse>> {
    try {
      const firebaseUid = request.user?.uid;
      if (!firebaseUid) {
        this.setStatus(401);
        return {
          status: 401,
          data: null as unknown as CustomThemeResponse,
          message: "User not authenticated",
        };
      }

      const user = await prisma.user.findUnique({ where: { firebaseUid } });
      if (!user) {
        this.setStatus(404);
        return {
          status: 404,
          data: null as unknown as CustomThemeResponse,
          message: "User not found",
        };
      }

      const theme = await customThemeService.upsert({
        userId: user.id,
        primaryColor: body.primaryColor ?? null,
        secondaryColor: body.secondaryColor ?? null,
        backgroundColor: body.backgroundColor ?? null,
        surfaceColor: body.surfaceColor ?? null,
        textPrimaryColor: body.textPrimaryColor ?? null,
        textSecondaryColor: body.textSecondaryColor ?? null,
        fontFamily: body.fontFamily ?? null,
        headingFontFamily: body.headingFontFamily ?? null,
        borderRadius: body.borderRadius ?? null,
        density: body.density ?? null,
        configJson:
          body.configJson === undefined ? undefined : (body.configJson as Prisma.JsonValue | null),
      });

      return {
        status: 200,
        data: this.mapCustomThemeResponse(theme),
        message: "Theme saved successfully",
      };
    } catch (error) {
      logger.error("Failed to save custom theme", error);
      this.setStatus(500);
      return {
        status: 500,
        data: null as unknown as CustomThemeResponse,
        message: "Failed to save custom theme",
      };
    }
  }

  private mapCustomThemeResponse(theme: CustomTheme): CustomThemeResponse {
    return {
      ...theme,
      configJson: theme.configJson as TsoaJsonObject | null,
    };
  }

  /**
   * Delete a user account and all associated data (Admin only)
   * This is a careful operation that deletes all related records to avoid foreign key constraint errors
   * Only admins can delete other users
   */
  @Security("AdminOnly")
  @Delete("user/{userId}")
  public async deleteUser(
    userId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<boolean>> {
    try {
      // Check if the user exists
      const userToDelete = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userToDelete) {
        return {
          status: 404,
          data: false,
          message: "User not found",
        };
      }

      // Check permissions - only admins can delete other users
      const requestingUserId = request.user?.uid;
      const isAdmin = (request.user?.role ?? request.user?.authRole) === "ADMIN";

      if (!isAdmin && requestingUserId !== userToDelete.firebaseUid) {
        return {
          status: 403,
          data: false,
          message: "You can only delete your own account unless you are an admin",
        };
      }

      await deleteUserData(userId);
      await recordAudit({
        actor: { id: null, email: request.user?.email ?? null },
        action: "user.deleted_by_platform_admin",
        targetType: "user",
        targetId: userId,
        metadata: { email: userToDelete.email },
        request,
      });

      // Delete the user from Firebase Auth
      try {
        await firebaseAdmin.auth().deleteUser(userToDelete.firebaseUid);
      } catch (firebaseError) {
        logger.error("Error deleting Firebase user:", firebaseError);
        // Continue with the response even if Firebase deletion fails
        // The database user is already deleted at this point
      }

      return {
        status: 200,
        data: true,
        message: "User and all associated data deleted successfully",
      };
    } catch (error) {
      if (error instanceof AccountDeletionBlockedError) {
        return { status: 409, data: false, message: error.message };
      }
      logger.error("Error deleting user:", error);
      return {
        status: 500,
        data: false,
        message: "Failed to delete user",
      };
    }
  }

  /**
   * Delete your own user account and all associated data
   * This endpoint allows users to delete their own account without specifying a userId
   * The user ID is extracted from the authentication token
   *
   * The HTTP status is always 200; the real outcome is in the body. The web
   * reads it from there. The apps call DELETE /api/session/me, which uses the
   * same code and sends the real HTTP status.
   */
  @Security("ClientLevel")
  @Delete("self")
  public async deleteMyAccount(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<boolean>> {
    return deleteOwnAccount(request);
  }
}

/**
 * Deletes the signed-in user, their data and their Firebase account. The
 * result carries the status (200, 401, 404, 409 when they own a workspace
 * with other members, 500) without setting it on the response.
 */
export async function deleteOwnAccount(
  request: AuthenticatedRequest,
): Promise<ApiResponse<boolean>> {
  try {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      return {
        status: 401,
        data: false,
        message: "User not authenticated",
      };
    }

    const userToDelete = await prisma.user.findFirst({
      where: { firebaseUid },
    });

    if (!userToDelete) {
      return {
        status: 404,
        data: false,
        message: "User not found",
      };
    }

    const userId = userToDelete.id;

    // Meetings, files, vectors, voice profile and chat attachments, plus
    // every workspace where they are the only member.
    await deleteUserData(userId);
    await recordAudit({
      actor: { id: userId, email: userToDelete.email },
      action: "user.deleted_self",
      targetType: "user",
      targetId: userId,
      request,
    });

    // The database user is already gone, so a Firebase failure is logged
    // and the deletion still counts as done.
    try {
      await firebaseAdmin.auth().deleteUser(firebaseUid);
    } catch (firebaseError) {
      logger.error("Error deleting Firebase user:", firebaseError);
    }

    return {
      status: 200,
      data: true,
      message: "Your account and all associated data deleted successfully",
    };
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) {
      return { status: 409, data: false, message: error.message };
    }
    logger.error("Error deleting user account:", error);
    return {
      status: 500,
      data: false,
      message: "Failed to delete your account",
    };
  }
}

/**
 * DELETE /api/session/me, the account deletion the mobile app and the desktop
 * recorder have always called. It did not exist until 2026-11-14, so deleting
 * an account from the apps failed with a 404. Installed versions start
 * working without an update.
 *
 * Unlike account/self it sends the real HTTP status: the apps only look at
 * it, and a refusal answered with 200 would sign the user out as if the
 * account were gone.
 */
@Route("api/session")
@Tags("Session")
export class SessionAccountController extends Controller {
  @Security("ClientLevel")
  @Delete("me")
  public async deleteMe(@Request() request: AuthenticatedRequest): Promise<ApiResponse<boolean>> {
    const result = await deleteOwnAccount(request);
    this.setStatus(result.status);
    return result;
  }
}
