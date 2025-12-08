import { Body, Controller, Delete, Get, Put, Request, Route, Security, Tags } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { logger } from "../utils/logger";
import { ApiResponse } from "./controllerTypes";
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
  configJson?: Prisma.JsonValue | null;
}

@Route("account")
@Tags("Account")
export class AccountController extends Controller {
  @Security("ClientLevel")
  @Get("theme")
  public async getCustomTheme(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<CustomTheme | null>> {
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
        data: theme,
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

  @Security("ClientLevel")
  @Put("theme")
  public async upsertCustomTheme(
    @Body() body: UpdateCustomThemeRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<CustomTheme>> {
    try {
      const firebaseUid = request.user?.uid;
      if (!firebaseUid) {
        this.setStatus(401);
        return {
          status: 401,
          data: null as unknown as CustomTheme,
          message: "User not authenticated",
        };
      }

      const user = await prisma.user.findUnique({ where: { firebaseUid } });
      if (!user) {
        this.setStatus(404);
        return {
          status: 404,
          data: null as unknown as CustomTheme,
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
        configJson: body.configJson ?? null,
      });

      return {
        status: 200,
        data: theme,
        message: "Theme saved successfully",
      };
    } catch (error) {
      logger.error("Failed to save custom theme", error);
      this.setStatus(500);
      return {
        status: 500,
        data: null as unknown as CustomTheme,
        message: "Failed to save custom theme",
      };
    }
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
      const isAdmin = request.user?.authRole === "ADMIN";

      if (!isAdmin && requestingUserId !== userToDelete.firebaseUid) {
        return {
          status: 403,
          data: false,
          message: "You can only delete your own account unless you are an admin",
        };
      }

      // Start a transaction to delete all related records
      await prisma.$transaction(async (tx) => {
        // 8. Finally delete the user
        await tx.user.delete({
          where: { id: userId },
        });
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
   */
  @Security("ClientLevel")
  @Delete("self")
  public async deleteMyAccount(
    @Request() request: AuthenticatedRequest,
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

      // Find the user by Firebase UID
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

      // Start a transaction to delete all related records
      await prisma.$transaction(async (tx) => {
        // 8. Finally delete the user
        await tx.user.delete({
          where: { id: userId },
        });
      });

      // Delete the user from Firebase Auth
      try {
        await firebaseAdmin.auth().deleteUser(firebaseUid);
      } catch (firebaseError) {
        logger.error("Error deleting Firebase user:", firebaseError);
        // Continue with the response even if Firebase deletion fails
        // The database user is already deleted at this point
      }

      return {
        status: 200,
        data: true,
        message: "Your account and all associated data deleted successfully",
      };
    } catch (error) {
      logger.error("Error deleting user account:", error);
      return {
        status: 500,
        data: false,
        message: "Failed to delete your account",
      };
    }
  }
}
