import { Body, Controller, Get, Put, Path, Route, Security, Tags, Response, Post } from "tsoa";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { Role } from "@prisma/client";
import { ApiResponse, GenericResponse } from "./controllerTypes";
import { firebaseAdmin, setUserRole } from "../firebase/firebaseAdmin";

export interface UserDetailResponse {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserRoleRequest {
  role: Role;
}

export interface UserOrphanResponse {
  firebaseUid: string;
  email: string | null;
  name: string | null;
  creationTime: string;
}

export interface SyncOrphanRequest {
  firebaseUid: string;
}

@Route("api/users")
@Tags("Users")
export class UserController extends Controller {
  /**
   * Get all users.
   * Admin only.
   */
  @Get("/")
  @Security("AdminOnly")
  @Response<ApiResponse<UserDetailResponse[]>>(200, "Successfully retrieved users")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(403, "Forbidden")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async getUsers(): Promise<ApiResponse<UserDetailResponse[]>> {
    try {
      const users = await prisma.user.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      const userResponses: UserDetailResponse[] = users.map((u) => ({
        id: u.id,
        firebaseUid: u.firebaseUid,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        role: u.role,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      return {
        status: 200,
        data: userResponses,
      };
    } catch (error) {
      logger.error("Error fetching users:", error);
      this.setStatus(500);
      return {
        status: 500,
        data: [] as unknown as UserDetailResponse[], // Type conformance for tsoa
        message: "Failed to fetch users",
      };
    }
  }

  /**
   * Update a user's role.
   * Admin only.
   */
  @Put("/{userId}/role")
  @Security("AdminOnly")
  @Response<ApiResponse<UserDetailResponse>>(200, "Successfully updated user role")
  @Response<GenericResponse>(400, "Bad Request")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(403, "Forbidden")
  @Response<GenericResponse>(404, "Not Found")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async updateUserRole(
    @Path("userId") userId: string,
    @Body() body: UpdateUserRoleRequest,
  ): Promise<ApiResponse<UserDetailResponse>> {
    try {
      if (!Object.values(Role).includes(body.role)) {
        this.setStatus(400);
        return {
          status: 400,
          data: null as unknown as UserDetailResponse,
          message: "Invalid role provided",
        };
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.setStatus(404);
        return {
          status: 404,
          data: null as unknown as UserDetailResponse,
          message: "User not found",
        };
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: body.role },
      });

      // Update role in Firebase custom claims to keep them in sync
      try {
        await setUserRole(updatedUser.firebaseUid, body.role);
      } catch (fbError) {
        logger.error(`Failed to sync role to Firebase for user ${userId}`, fbError);
        // We do not fail the request if firebase sync fails but log the error
      }

      const userResponse: UserDetailResponse = {
        id: updatedUser.id,
        firebaseUid: updatedUser.firebaseUid,
        email: updatedUser.email,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      return {
        status: 200,
        data: userResponse,
        message: "User role updated successfully",
      };
    } catch (error) {
      logger.error(`Error updating user role for ${userId}:`, error);
      this.setStatus(500);
      return {
        status: 500,
        data: null as unknown as UserDetailResponse,
        message: "Failed to update user role",
      };
    }
  }

  /**
   * Get all Firebase users that don't exist in the database (Orphans).
   * Admin only.
   */
  @Get("/orphans")
  @Security("AdminOnly")
  @Response<ApiResponse<UserOrphanResponse[]>>(200, "Successfully retrieved orphaned users")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(403, "Forbidden")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async getOrphans(): Promise<ApiResponse<UserOrphanResponse[]>> {
    try {
      // 1. Get all Firebase users (up to 1000 for now)
      const listUsersResult = await firebaseAdmin.auth().listUsers(1000);
      const firebaseUsers = listUsersResult.users;

      // 2. Get all postgres users Firebase UIDs
      const dbUsers = await prisma.user.findMany({
        select: { firebaseUid: true },
      });
      const dbUids = new Set(dbUsers.map((u) => u.firebaseUid));

      // 3. Filter orphans
      const orphans = firebaseUsers
        .filter((user) => !dbUids.has(user.uid))
        .map((user) => ({
          firebaseUid: user.uid,
          email: user.email || null,
          name: user.displayName || null,
          creationTime: user.metadata.creationTime || new Date().toISOString(),
        }));

      return {
        status: 200,
        data: orphans,
      };
    } catch (error) {
      logger.error("Error fetching orphaned users:", error);
      this.setStatus(500);
      return {
        status: 500,
        data: [] as unknown as UserOrphanResponse[],
        message: "Failed to fetch orphaned users",
      };
    }
  }

  /**
   * Force verify a user's email address.
   * Admin only.
   */
  @Post("/{userId}/verify-email")
  @Security("AdminOnly")
  @Response<ApiResponse<UserDetailResponse>>(200, "Successfully verified user email")
  @Response<GenericResponse>(400, "Bad Request")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(403, "Forbidden")
  @Response<GenericResponse>(404, "Not Found")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async forceVerifyEmail(
    @Path("userId") userId: string,
  ): Promise<ApiResponse<UserDetailResponse>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.setStatus(404);
        return {
          status: 404,
          data: null as unknown as UserDetailResponse,
          message: "User not found",
        };
      }

      // Update Firebase record directly
      await firebaseAdmin.auth().updateUser(user.firebaseUid, {
        emailVerified: true,
      });

      const userResponse: UserDetailResponse = {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      return {
        status: 200,
        data: userResponse,
        message: "User email manually verified successfully",
      };
    } catch (error) {
      logger.error(`Error forcing email verification for ${userId}:`, error);
      this.setStatus(500);
      return {
        status: 500,
        data: null as unknown as UserDetailResponse,
        message: "Failed to verify user email",
      };
    }
  }

  /**
   * Sync a specific orphaned Firebase user to PostgreSQL.
   * Admin only.
   */
  @Post("/sync-orphan")
  @Security("AdminOnly")
  @Response<ApiResponse<UserDetailResponse>>(200, "Successfully synced orphaned user")
  @Response<GenericResponse>(400, "Bad Request")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(403, "Forbidden")
  @Response<GenericResponse>(404, "Not Found")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async syncOrphan(
    @Body() body: SyncOrphanRequest,
  ): Promise<ApiResponse<UserDetailResponse>> {
    try {
      const { firebaseUid } = body;

      // Ensure user doesn't already exist
      const existingUser = await prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (existingUser) {
        this.setStatus(400);
        return {
          status: 400,
          data: null as unknown as UserDetailResponse,
          message: "User already exists in PostgreSQL",
        };
      }

      // Fetch from Firebase
      let firebaseRecord;
      try {
        firebaseRecord = await firebaseAdmin.auth().getUser(firebaseUid);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (fbError) {
        this.setStatus(404);
        return {
          status: 404,
          data: null as unknown as UserDetailResponse,
          message: "User not found in Firebase",
        };
      }

      // Identify providers
      const providerIds = firebaseRecord.providerData.map((p) => p.providerId);
      const isGoogleAccount = providerIds.includes("google.com");
      const isAppleAccount = providerIds.includes("apple.com");
      const isMicrosoftAccount = providerIds.includes("microsoft.com");

      // Set Postgres User
      const newUser = await prisma.user.create({
        data: {
          id: firebaseUid,
          firebaseUid: firebaseUid,
          email: firebaseRecord.email || `imported-${firebaseUid}@placeholder.net`,
          name: firebaseRecord.displayName || null,
          avatarUrl: firebaseRecord.photoURL || null,
          isGoogleAccount,
          isAppleAccount,
          isMicrosoftAccount,
          role: Role.ADMIN,
        },
      });

      // Create Personal Workspace
      const defaultWorkspace = await prisma.workspace.create({
        data: {
          name: `${firebaseRecord.displayName || "Personal"} Workspace`,
          members: {
            create: { userId: newUser.id, role: "OWNER" },
          },
        },
      });

      // Assign default theme
      await prisma.brandTheme.create({
        data: {
          workspaceId: defaultWorkspace.id,
          userId: newUser.id,
          name: "Blueberry Bytes",
          headingFont: "Inter",
          bodyFont: "Inter",
          primaryColor: "#4361EE",
          secondaryColor: "#a78bfa",
          backgroundColor: "#ffffff",
          textColor: "#0f172a",
          backgroundStyle: "solid",
          cardStyle: "flat",
        },
      });

      // Synchronize role explicitly on Firebase side just in case
      try {
        await setUserRole(firebaseUid, Role.ADMIN);
      } catch (e) {
        logger.warn(`Could not set Firebase claims for newly synced orphan ${firebaseUid}`, e);
      }

      const userResponse: UserDetailResponse = {
        id: newUser.id,
        firebaseUid: newUser.firebaseUid,
        email: newUser.email,
        name: newUser.name,
        avatarUrl: newUser.avatarUrl,
        role: newUser.role,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      };

      return {
        status: 200,
        data: userResponse,
        message: "Orphaned user successfully synced",
      };
    } catch (error) {
      logger.error(`Error syncing orphaned user:`, error);
      this.setStatus(500);
      return {
        status: 500,
        data: null as unknown as UserDetailResponse,
        message: "Failed to sync orphaned user",
      };
    }
  }
}
