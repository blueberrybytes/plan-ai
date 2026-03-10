/* eslint-disable @typescript-eslint/no-explicit-any */
import { Route, Tags, Response, Post, Body, Security, Get, Request } from "tsoa";
import { ApiResponse, GenericResponse } from "./controllerTypes";
import { Role } from "@prisma/client";
import { firebaseAdmin, setUserRole } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import crypto from "crypto";

interface UserResponse {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  googleId: string | null;
  appleId: string | null;
  microsoftId: string | null;
  isGoogleAccount: boolean;
  isAppleAccount: boolean;
  isMicrosoftAccount: boolean;
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

      console.log(
        `\n\n[SESSION DEBUG] Full Firebase JWT Payload for UID ${firebaseUid}:`,
        JSON.stringify(decodedToken.firebase, null, 2),
      );

      // Extract Google ID and determine account type
      const googleIdRaw = decodedToken.firebase?.identities?.["google.com"]?.[0];
      const googleId = googleIdRaw && googleIdRaw.trim() !== "" ? googleIdRaw : null;
      const isGoogleAccount = googleId !== null;

      // Extract Apple ID
      const appleIdRaw = decodedToken.firebase?.identities?.["apple.com"]?.[0];
      const appleId = appleIdRaw && appleIdRaw.trim() !== "" ? appleIdRaw : null;
      const isAppleAccount = appleId !== null;

      // Extract Microsoft ID
      const microsoftIdRaw = decodedToken.firebase?.identities?.["microsoft.com"]?.[0];
      const microsoftId = microsoftIdRaw && microsoftIdRaw.trim() !== "" ? microsoftIdRaw : null;
      const isMicrosoftAccount = microsoftId !== null;

      console.log(
        `User details - Email: ${email}, Name: ${name}, Google ID: ${googleId || "N/A"}, Apple ID: ${appleId || "N/A"}, Microsoft ID: ${microsoftId || "N/A"}`,
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
              appleId: appleId || user.appleId,
              isAppleAccount: isAppleAccount || user.isAppleAccount,
              microsoftId: microsoftId || user.microsoftId,
              isMicrosoftAccount: isMicrosoftAccount || user.isMicrosoftAccount,
            },
          });
          console.log("Firebase UID updated successfully");
        }
      }

      console.log(`User exists in database: ${!!user}`);

      if (user) {
        // Aggressively sync OAuth identities on every login to catch users who link new providers
        const needsUpdate =
          (isGoogleAccount && !user.isGoogleAccount) ||
          (isAppleAccount && !user.isAppleAccount) ||
          (isMicrosoftAccount && !user.isMicrosoftAccount);

        if (needsUpdate) {
          console.log(`Syncing new OAuth Identities to existing Postgres User...`);
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              ...(isGoogleAccount && { googleId, isGoogleAccount: true }),
              ...(isAppleAccount && { appleId, isAppleAccount: true }),
              ...(isMicrosoftAccount && { microsoftId, isMicrosoftAccount: true }),
            },
          });
        }
      }

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
              appleId: appleId,
              microsoftId: microsoftId,
              isGoogleAccount: isGoogleAccount,
              isAppleAccount: isAppleAccount,
              isMicrosoftAccount: isMicrosoftAccount,
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
        appleId: user.appleId,
        microsoftId: user.microsoftId,
        isGoogleAccount: user.isGoogleAccount,
        isAppleAccount: user.isAppleAccount,
        isMicrosoftAccount: user.isMicrosoftAccount,
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
        appleId: user.appleId,
        microsoftId: user.microsoftId,
        isGoogleAccount: user.isGoogleAccount,
        isAppleAccount: user.isAppleAccount,
        isMicrosoftAccount: user.isMicrosoftAccount,
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

  /**
   * Generate a Firebase Custom Token for the authenticated user.
   * Called by the web app after the user logs in, to hand off auth to the Electron desktop recorder.
   */
  @Post("desktop-token")
  @Security("ClientLevel")
  public async getDesktopToken(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<{ code: string }>> {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { firebaseUid: request.user!.uid },
      });

      if (!dbUser) {
        throw new Error("User not found in database");
      }

      // Generate a secure 64-character random hex code
      const authCode = crypto.randomBytes(32).toString("hex");

      // Store in PostgreSQL, expires in 60 seconds
      await prisma.desktopAuthCode.create({
        data: {
          code: authCode,
          userId: dbUser.id,
          expiresAt: new Date(Date.now() + 60 * 1000),
        },
      });

      return {
        status: 200,
        data: { code: authCode },
      };
    } catch {
      throw {
        status: 500,
        message: "Failed to generate desktop auth code",
      };
    }
  }

  /**
   * Exchange the Short-Lived Code for a Firebase Custom Token.
   * Called securely behind the scenes by the Electron desktop recorder.
   */
  @Post("desktop-exchange")
  public async exchangeDesktopCode(
    @Body() body: { code: string },
  ): Promise<ApiResponse<{ customToken: string }>> {
    try {
      console.log(`[sessionController] Exchanging OTP code: "${body.code}"`);

      // Find the code and eagerly delete it to prevent replay attacks
      const authRecord = await prisma.desktopAuthCode.findUnique({
        where: { code: body.code },
        include: { user: true },
      });

      console.log(`[sessionController] Prisma lookup result:`, authRecord ? "FOUND" : "NOT FOUND");

      if (!authRecord) {
        throw new Error("Invalid or expired authorization code.");
      }

      console.log(
        `[sessionController] Code expires at: ${authRecord.expiresAt.toISOString()}, Current time: ${new Date().toISOString()}`,
      );

      // Immediately burn the code
      await prisma.desktopAuthCode.delete({
        where: { id: authRecord.id },
      });

      // Verify expiration strictly
      if (authRecord.expiresAt.getTime() < Date.now()) {
        throw new Error("Authorization code expired.");
      }

      // Generate the massive Firebase Custom JWT and hand it over!
      const customToken = await firebaseAdmin.auth().createCustomToken(authRecord.user.firebaseUid);

      console.log(
        `[sessionController] Successfully minted token for user ${authRecord.user.firebaseUid}. Returning.`,
      );

      return {
        status: 200,
        data: { customToken },
      };
    } catch (error: any) {
      console.error("[sessionController] Exchange failed:", error.message || error);
      throw {
        status: error.status || 401,
        message: error.message || "Failed to exchange desktop auth code",
      };
    }
  }
}
