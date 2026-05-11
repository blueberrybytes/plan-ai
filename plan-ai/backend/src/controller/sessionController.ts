/* eslint-disable @typescript-eslint/no-explicit-any */
import { Route, Tags, Response, Post, UploadedFile, Security, Get, Request, Body } from "tsoa";
import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { ApiResponse, GenericResponse } from "./controllerTypes";
import { Role } from "@prisma/client";
import { firebaseAdmin, setUserRole } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import crypto from "crypto";

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const MS_TENANT = process.env.MICROSOFT_TENANT_ID ?? "common";
const rawBackendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";
const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "");
// Allowlist of registered redirect URIs (app deep link + Electron)
const ALLOWED_MOBILE_REDIRECT_PREFIXES = ["planaimobile://", "blueberrybytes-recorder://"];

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
  hasCompletedOnboarding: boolean;
  hasVoiceProfile: boolean;
  voiceProfileUrl: string | null;
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
          // Check if there are any valid (non-expired) pending Workspace Invitations for this email
          const pendingInvitations = await prisma.workspaceInvitation.findMany({
            where: {
              email: email,
              status: "PENDING",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          });

          const initialRole = pendingInvitations.length > 0 ? Role.CLIENT : Role.ADMIN;

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
              role: initialRole, // Set to CLIENT if invited, else PENDING
            },
          });
          console.log("User created successfully in database with ID:", user.id);

          if (pendingInvitations.length > 0) {
            console.log(
              `Found ${pendingInvitations.length} pending invitations for user. Assigning workspaces and granting CLIENT role.`,
            );

            // Add user to all workspaces they were invited to
            for (const invite of pendingInvitations) {
              await prisma.workspaceMember.create({
                data: {
                  userId: user.id,
                  workspaceId: invite.workspaceId,
                  role: invite.role,
                  personas: invite.personas,
                  personaNotes: invite.personaNotes,
                },
              });

              // Mark invite as ACCEPTED
              await prisma.workspaceInvitation.update({
                where: { id: invite.id },
                data: { status: "ACCEPTED" },
              });
            }
          }

          // Set the role in Firebase custom claims
          await setUserRole(firebaseUid, initialRole);
          console.log(`Role set in Firebase custom claims to ${initialRole}`);
        } catch (dbError: any) {
          if (dbError?.code === "P2002") {
            console.log("Race condition: User already created by another request. Fetching...");
            user = await prisma.user.findFirst({ where: { firebaseUid } });
            if (!user) {
              console.error("Failed to recover from P2002 race condition.");
              throw {
                status: 500,
                message: "Failed to create user in database (race condition recovery failed)",
                error: dbError,
              };
            }
          } else {
            console.error("Error creating user in database:", dbError);
            throw {
              status: 500,
              message: "Failed to create user in database",
              error: dbError,
            };
          }
        }
      }

      // Removed automatic Personal Workspace and Default Blueberry Bytes Theme creation.
      // This is now handled exclusively by the new Onboarding flow (onboardingController).

      // Return user data without sensitive fields
      // CustomTheme is only created in onboardingController — the reliable signal for onboarding completion
      const customTheme = await prisma.customTheme.findUnique({ where: { userId: user.id } });
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
        hasCompletedOnboarding: customTheme !== null,
        hasVoiceProfile: user.hasVoiceProfile,
        voiceProfileUrl: user.voiceProfileUrl,
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
  @Security("BearerAuth")
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
        include: { customTheme: true },
      });

      if (!user) {
        throw {
          status: 404,
          message: "User not found",
        };
      }

      // Return user data without sensitive fields
      // CustomTheme is only created in onboardingController — the reliable signal for onboarding completion
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
        hasCompletedOnboarding: user.customTheme !== null,
        hasVoiceProfile: user.hasVoiceProfile,
        voiceProfileUrl: user.voiceProfileUrl,
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
   * Save Voice Profile.
   * Updates the user to indicate they have completed voice enrollment.
   */
  @Post("me/voice-profile")
  @Security("BearerAuth")
  @Response<ApiResponse<UserResponse>>(200, "Successfully saved voice profile")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async saveVoiceProfile(
    @Request() request: AuthenticatedRequest,
    @UploadedFile("voiceFile") voiceFile?: Express.Multer.File,
  ): Promise<ApiResponse<UserResponse>> {
    try {
      if (!request.user) throw { status: 401, message: "Unauthorized" };

      const user = await prisma.user.findFirst({
        where: { firebaseUid: request.user.uid },
        include: { customTheme: true },
      });

      if (!user) throw { status: 404, message: "User not found" };

      let voiceProfileUrl = user.voiceProfileUrl;
      if (voiceFile) {
        const bucket = firebaseAdmin.storage().bucket();
        const ext = voiceFile.originalname.split(".").pop() || "m4a";
        const fileRef = bucket.file(`voice-profiles/${user.id}/profile.${ext}`);
        await fileRef.save(voiceFile.buffer, { contentType: voiceFile.mimetype });
        await fileRef.makePublic();
        voiceProfileUrl = fileRef.publicUrl();
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          hasVoiceProfile: true,
          voiceProfileUrl,
        },
        include: { customTheme: true },
      });

      const userResponse: UserResponse = {
        id: updatedUser.id,
        firebaseUid: updatedUser.firebaseUid,
        email: updatedUser.email,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl,
        googleId: updatedUser.googleId,
        appleId: updatedUser.appleId,
        microsoftId: updatedUser.microsoftId,
        isGoogleAccount: updatedUser.isGoogleAccount,
        isAppleAccount: updatedUser.isAppleAccount,
        isMicrosoftAccount: updatedUser.isMicrosoftAccount,
        role: updatedUser.role,
        hasCompletedOnboarding: updatedUser.customTheme !== null,
        hasVoiceProfile: updatedUser.hasVoiceProfile,
        voiceProfileUrl: updatedUser.voiceProfileUrl,
      };

      return {
        status: 200,
        data: userResponse,
      };
    } catch (error: any) {
      console.error("Error saving voice profile:", error);
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
  @Security("BearerAuth")
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

// ─────────────────────────────────────────────────────────────────
// Microsoft Mobile OAuth — Raw Express handlers (not TSOA-managed)
// Mounted manually in app.ts as:
//   app.get("/api/auth/microsoft/mobile-start", microsoftMobileStart)
//   app.get("/api/auth/microsoft/mobile-callback", microsoftMobileCallback)
// ─────────────────────────────────────────────────────────────────

export async function microsoftMobileStart(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const redirect_uri = req.query["redirect_uri"] as string | undefined;

  if (!redirect_uri || !ALLOWED_MOBILE_REDIRECT_PREFIXES.some((p) => redirect_uri.startsWith(p))) {
    res.status(400).json({ error: "Invalid or missing redirect_uri" });
    return;
  }

  if (!MS_CLIENT_ID) {
    res.status(500).json({ error: "Microsoft OAuth not configured on this server." });
    return;
  }

  // Store the mobile redirect_uri in a short-lived state token (prevents CSRF)
  const state = Buffer.from(
    JSON.stringify({ redirect_uri, nonce: crypto.randomBytes(16).toString("hex") }),
  ).toString("base64url");
  const backendCallback = `${BACKEND_URL}/api/auth/microsoft/mobile-callback`;

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: backendCallback,
    response_mode: "query",
    scope: "openid profile email User.Read",
    state,
  });

  res.redirect(
    `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${params.toString()}`,
  );
}

export async function microsoftMobileCallback(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const { code, state, error: msError } = req.query as Record<string, string>;

  let redirect_uri: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    redirect_uri = decoded.redirect_uri;
    if (!ALLOWED_MOBILE_REDIRECT_PREFIXES.some((p) => redirect_uri.startsWith(p)))
      throw new Error("bad_redirect");
  } catch {
    res.status(400).send("Invalid state parameter");
    return;
  }

  if (msError || !code) {
    const errorMsg = encodeURIComponent(msError || "Microsoft login failed");
    res.redirect(`${redirect_uri}?error=${errorMsg}`);
    return;
  }

  try {
    const backendCallback = `${BACKEND_URL}/api/auth/microsoft/mobile-callback`;

    // Exchange code for tokens with Microsoft
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          code,
          redirect_uri: backendCallback,
          grant_type: "authorization_code",
          scope: "openid profile email User.Read",
        }).toString(),
      },
    );

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.text();
      throw new Error(`MS token exchange failed: ${tokenErr}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; id_token: string };

    // Get Microsoft user info
    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const msUser = (await graphRes.json()) as {
      id: string;
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    const email = msUser.mail || msUser.userPrincipalName || "";
    const microsoftUid = `microsoft:${msUser.id}`;

    // Find or create Firebase user for this Microsoft account
    let firebaseUserRecord;
    try {
      firebaseUserRecord = await firebaseAdmin.auth().getUserByEmail(email);
    } catch {
      try {
        firebaseUserRecord = await firebaseAdmin.auth().createUser({
          uid: microsoftUid,
          email,
          displayName: msUser.displayName ?? undefined,
          emailVerified: true,
        });
      } catch (createErr: any) {
        // User may exist under a different UID (e.g., Google-linked)
        if (createErr.code === "auth/email-already-exists") {
          firebaseUserRecord = await firebaseAdmin.auth().getUserByEmail(email);
        } else {
          throw createErr;
        }
      }
    }

    // Find or create our Postgres user
    const existingDbUser = await prisma.user.findFirst({
      where: { firebaseUid: firebaseUserRecord.uid },
    });

    if (!existingDbUser) {
      await prisma.user.create({
        data: {
          firebaseUid: firebaseUserRecord.uid,
          email,
          name: msUser.displayName ?? null,
          microsoftId: msUser.id,
          isMicrosoftAccount: true,
        },
      });
    } else if (!existingDbUser.microsoftId) {
      await prisma.user.update({
        where: { id: existingDbUser.id },
        data: { microsoftId: msUser.id, isMicrosoftAccount: true },
      });
    }

    // Mint a Firebase Custom Token for the mobile app to sign in with
    const customToken = await firebaseAdmin.auth().createCustomToken(firebaseUserRecord.uid);

    // Redirect back to the mobile app deep link with the token
    res.redirect(`${redirect_uri}?token=${encodeURIComponent(customToken)}`);
  } catch (err: any) {
    console.error("[Microsoft Mobile OAuth] Callback error:", err.message || err);
    const errorMsg = encodeURIComponent(err.message || "Microsoft login failed");
    res.redirect(`${redirect_uri}?error=${errorMsg}`);
  }
}
