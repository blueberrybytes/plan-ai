/* eslint-disable @typescript-eslint/no-explicit-any */
import { Route, Tags, Response, Post, Body, Security, Get, Request } from "tsoa";
import { ApiResponse, GenericResponse } from "./controllerTypes";
import { Role } from "@prisma/client";
import { firebaseAdmin, setUserRole } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

interface UserResponse {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  googleId: string | null;
  isGoogleAccount: boolean;
  role: Role;
}

@Route("api/session")
@Tags("Session")
export class SessionController {
  /**
   * Login with Firebase token.
   * Verifies the token and returns user information.
   * Creates a new user if one doesn't exist with the given Firebase UID.
   */
  @Post("login")
  @Response<ApiResponse<UserResponse>>(200, "Successfully logged in")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async login(
    @Body() body: { uuid: string; token: string },
  ): Promise<ApiResponse<UserResponse>> {
    try {
      console.log(`Login attempt for uid: ${body.uuid}, token length: ${body.token?.length || 0}`);

      if (!body.token) {
        throw {
          status: 400,
          message: "Missing token in request body",
        };
      }

      // Verify the Firebase token
      let decodedToken;
      try {
        decodedToken = await firebaseAdmin.auth().verifyIdToken(body.token);
        console.log("Token verification successful. Firebase UID:", decodedToken.uid);
      } catch (tokenError: any) {
        console.error("Firebase token verification failed:", tokenError.message);
        throw {
          status: 401,
          message: tokenError.message,
          error: tokenError,
        };
      }

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email || "";
      const name = decodedToken.name || decodedToken.display_name || null;
      const avatarUrl = decodedToken.picture || null;

      // Extract Google ID and determine account type
      const googleIdRaw = decodedToken.firebase?.identities?.["google.com"]?.[0];
      const googleId = googleIdRaw && googleIdRaw.trim() !== "" ? googleIdRaw : null;
      const isGoogleAccount = googleId !== null;

      console.log(
        `User details - Email: ${email}, Name: ${name}, Google ID: ${googleId || "N/A (email/password signup)"}, isGoogleAccount: ${isGoogleAccount}`,
      );

      // Check if user exists in the database by Firebase UID
      let user = await prisma.user.findFirst({
        where: { firebaseUid: firebaseUid },
      });

      // If not found by Firebase UID, try looking up by email
      // This handles cases where the user was created another way but with the same email
      if (!user && email) {
        console.log("User not found by Firebase UID, trying to find by email...");
        user = await prisma.user.findFirst({
          where: { email: email },
        });

        // If found by email, update the Firebase UID
        if (user) {
          console.log("User found by email, updating Firebase UID...");
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              firebaseUid: firebaseUid,
              name: name || user.name,
              avatarUrl: avatarUrl || user.avatarUrl,
              googleId: googleId || user.googleId,
              isGoogleAccount: isGoogleAccount || user.isGoogleAccount,
            },
          });
          console.log("Firebase UID updated successfully");
        }
      }

      console.log(`User exists in database: ${!!user}`);

      // If user doesn't exist, create a new one
      if (!user) {
        console.log("Creating new user in database...");
        try {
          user = await prisma.user.create({
            data: {
              id: body.uuid,
              firebaseUid: firebaseUid,
              email: email,
              name: name,
              avatarUrl: avatarUrl,
              googleId: googleId,
              isGoogleAccount: isGoogleAccount,
              role: Role.CLIENT, // Default role
            },
          });
          console.log("User created successfully in database with ID:", user.id);

          // Set the role in Firebase custom claims
          await setUserRole(firebaseUid, Role.CLIENT);
          console.log("Role set in Firebase custom claims");
        } catch (dbError: any) {
          console.error("Error creating user in database:", dbError);
          throw {
            status: 500,
            message: "Failed to create user in database",
            error: dbError,
          };
        }
      }

      // Return user data without sensitive fields
      const userResponse: UserResponse = {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        isGoogleAccount: user.isGoogleAccount,
        role: user.role,
      };

      return {
        status: 200,
        data: userResponse,
      };
    } catch (error: any) {
      console.error("Error on login:", error);
      throw {
        status: error.status || 500,
        message: error.message || "Internal Server Error",
      };
    }
  }

  /**
   * Get current user information.
   * Requires authentication.
   */
  @Get("me")
  @Security("ClientLevel")
  @Response<ApiResponse<UserResponse>>(200, "Successfully retrieved user information")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async getCurrentUser(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<UserResponse>> {
    try {
      // The user's Firebase UID is available from the request after authentication
      if (!request.user) {
        throw {
          status: 401,
          message: "Unauthorized: User not authenticated",
        };
      }

      const firebaseUid = request.user.uid;

      // Fetch user from database
      const user = await prisma.user.findFirst({
        where: { firebaseUid: firebaseUid },
      });

      if (!user) {
        throw {
          status: 404,
          message: "User not found",
        };
      }

      // Return user data without sensitive fields
      const userResponse: UserResponse = {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        isGoogleAccount: user.isGoogleAccount,
        role: user.role,
      };

      return {
        status: 200,
        data: userResponse,
      };
    } catch (error: any) {
      console.error("Error fetching current user:", error);
      throw {
        status: error.status || 500,
        message: error.message || "Internal Server Error",
      };
    }
  }
}
