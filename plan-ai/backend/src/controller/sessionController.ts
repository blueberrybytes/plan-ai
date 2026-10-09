/* eslint-disable @typescript-eslint/no-explicit-any */
import { trackFeatureFor } from "../services/featureUsageService";
import {
  Route,
  Tags,
  Response,
  Post,
  Delete,
  UploadedFile,
  Security,
  Get,
  Request,
  Body,
} from "tsoa";
import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { ApiResponse, GenericResponse } from "./controllerTypes";
import { Role } from "@prisma/client";
import { firebaseAdmin, setUserRole } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import {
  AuthenticatedRequest,
  signInClaims,
  verifyFirebaseIdToken,
} from "../middleware/authMiddleware";
import { acceptPendingInvitations } from "../services/invitationService";
import crypto from "crypto";
import { createOAuthState, readOAuthState } from "../utils/oauthState";
import {
  DISPLAY_URL_TTL_MS,
  deletePrefix,
  deleteStoredObject,
  readableUrl,
  uploadPrivateFile,
} from "../firebase/privateStorage";
import { logger } from "../utils/logger";

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
  hasCompletedHomeTour: boolean;
  hasVoiceProfile: boolean;
  voiceProfileUrl: string | null;
}

/**
 * The voice profile is stored as a private gs:// URI. The mobile app plays it
 * back, so responses carry a signed URL. If signing fails the profile still
 * exists; the player just has nothing to play.
 */
const voiceProfileDisplayUrl = async (stored: string | null): Promise<string | null> => {
  if (!stored) return null;
  try {
    return await readableUrl(stored, DISPLAY_URL_TTL_MS);
  } catch (err) {
    logger.warn("[Session] Couldn't sign the voice profile URL", err);
    return null;
  }
};

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
      if (!body.token) {
        throw {
          status: 400,
          message: "Missing token in request body",
        };
      }

      // Verify the Firebase token
      let decodedToken;
      try {
        decodedToken = await verifyFirebaseIdToken(body.token);
      } catch (tokenError: any) {
        logger.warn(
          `[Session] Firebase token rejected: ${tokenError?.code ?? tokenError?.message}`,
        );
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

      // Google and Apple only hand out verified addresses. Any other sign-in
      // (password, Microsoft) counts only when Firebase marks the email
      // verified. An unverified email must never take over an existing
      // account or claim someone's invitation.
      const signInProvider = decodedToken.firebase?.sign_in_provider ?? "";
      const emailTrusted =
        !!email &&
        (decodedToken.email_verified === true ||
          signInProvider === "google.com" ||
          signInProvider === "apple.com");

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

      // Check if user exists in the database by Firebase UID
      let user = await prisma.user.findFirst({
        where: { firebaseUid: firebaseUid },
      });

      // If not found by Firebase UID, try looking up by email
      // This handles cases where the user was created another way but with the same email
      if (!user && email) {
        user = await prisma.user.findFirst({
          where: { email: email },
        });
        if (user && !emailTrusted) {
          throw {
            status: 409,
            message:
              "An account with this email already exists. Verify your email address, or sign in the way you did before.",
          };
        }

        // If found by email, update the Firebase UID
        if (user) {
          logger.info(`[Session] Linking user ${user.id} to a new Firebase UID`);
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
        }
      }

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
        try {
          const initialRole = Role.CLIENT;

          // The primary key is generated here. It used to be taken from the
          // request body, so a client could pick its own user id.
          user = await prisma.user.create({
            data: {
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
              role: initialRole, // All new users are CLIENT; invited users also get added to workspace(s) below
            },
          });
          // Set the role in Firebase custom claims
          await setUserRole(firebaseUid, initialRole);
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

      // Invitations are accepted on any login once the email is trusted, so an
      // invite sent before the address was verified is picked up later.
      if (emailTrusted) {
        await acceptPendingInvitations(user, email);
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
        hasCompletedHomeTour: user.hasCompletedHomeTour,
        hasVoiceProfile: user.hasVoiceProfile,
        voiceProfileUrl: await voiceProfileDisplayUrl(user.voiceProfileUrl),
      };

      return {
        status: 200,
        data: userResponse,
      };
    } catch (error: any) {
      if (!error?.status || error.status >= 500) logger.error("[Session] Login failed", error);
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
        hasCompletedHomeTour: user.hasCompletedHomeTour,
        hasVoiceProfile: user.hasVoiceProfile,
        voiceProfileUrl: await voiceProfileDisplayUrl(user.voiceProfileUrl),
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
        // A voice print is biometric data: private, signed URLs only.
        const ext = voiceFile.originalname.split(".").pop() || "m4a";
        voiceProfileUrl = await uploadPrivateFile(
          `voice-profiles/${user.id}/profile.${ext}`,
          voiceFile.buffer,
          voiceFile.mimetype,
        );
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          hasVoiceProfile: true,
          voiceProfileUrl,
        },
        include: { customTheme: true },
      });
      trackFeatureFor(request, "voice_profile.saved", user.id, "");

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
        hasCompletedHomeTour: updatedUser.hasCompletedHomeTour,
        hasVoiceProfile: updatedUser.hasVoiceProfile,
        voiceProfileUrl: await voiceProfileDisplayUrl(updatedUser.voiceProfileUrl),
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
   * Delete the voice profile. A voice print is biometric data, so the user
   * can remove it at any time; speaker names then stop being matched by voice.
   */
  @Delete("me/voice-profile")
  @Security("BearerAuth")
  public async deleteVoiceProfile(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!request.user) throw { status: 401, message: "Unauthorized" };
    const user = await prisma.user.findFirst({ where: { firebaseUid: request.user.uid } });
    if (!user) throw { status: 404, message: "User not found" };

    if (user.voiceProfileUrl) await deleteStoredObject(user.voiceProfileUrl);
    await deletePrefix(`voice-profiles/${user.id}/`);
    await prisma.user.update({
      where: { id: user.id },
      data: { hasVoiceProfile: false, voiceProfileUrl: null },
    });
    return { status: 200, data: { deleted: true } };
  }

  /**
   * Mark home tour as completed.
   */
  @Post("me/home-tour")
  @Security("BearerAuth")
  @Response<ApiResponse<UserResponse>>(200, "Successfully marked home tour as completed")
  @Response<GenericResponse>(401, "Unauthorized")
  @Response<GenericResponse>(500, "Internal Server Error")
  public async completeHomeTour(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<UserResponse>> {
    try {
      if (!request.user) throw { status: 401, message: "Unauthorized" };

      const user = await prisma.user.findFirst({
        where: { firebaseUid: request.user.uid },
        include: { customTheme: true },
      });

      if (!user) throw { status: 404, message: "User not found" };

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          hasCompletedHomeTour: true,
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
        hasCompletedHomeTour: updatedUser.hasCompletedHomeTour,
        hasVoiceProfile: updatedUser.hasVoiceProfile,
        voiceProfileUrl: await voiceProfileDisplayUrl(updatedUser.voiceProfileUrl),
      };

      return {
        status: 200,
        data: userResponse,
      };
    } catch (error: any) {
      console.error("Error saving home tour:", error);
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
          signInProvider: request.user?.signInProvider?.slice(0, 64) ?? null,
          secondFactor: request.user?.secondFactor?.slice(0, 32) ?? null,
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
      // Find the code and eagerly delete it to prevent replay attacks
      const authRecord = await prisma.desktopAuthCode.findUnique({
        where: { code: body.code },
        include: { user: true },
      });

      // A mobile code is only valid with its PKCE verifier (mobile-exchange).
      if (!authRecord || authRecord.codeChallenge) {
        throw new Error("Invalid or expired authorization code.");
      }

      // Immediately burn the code
      await prisma.desktopAuthCode.delete({
        where: { id: authRecord.id },
      });

      // Verify expiration strictly
      if (authRecord.expiresAt.getTime() < Date.now()) {
        throw new Error("Authorization code expired.");
      }

      // Generate the massive Firebase Custom JWT and hand it over!
      const customToken = await firebaseAdmin
        .auth()
        .createCustomToken(authRecord.user.firebaseUid, signInClaims(authRecord));

      return {
        status: 200,
        data: { customToken },
      };
    } catch (error: any) {
      logger.warn(`[Session] Desktop code exchange failed: ${error?.message}`);
      throw {
        status: error.status || 401,
        message: error.message || "Failed to exchange desktop auth code",
      };
    }
  }

  /**
   * Mobile Microsoft sign-in, last step. The app sends the one-time code it
   * got through the deep link plus the PKCE verifier it kept in memory, and
   * gets a Firebase custom token. A code caught by another app is useless
   * without the verifier.
   */
  @Post("mobile-exchange")
  public async exchangeMobileCode(
    @Body() body: { code: string; codeVerifier: string },
  ): Promise<ApiResponse<{ customToken: string }>> {
    const invalid = { status: 401, message: "Invalid or expired authorization code." };
    if (typeof body?.code !== "string" || typeof body?.codeVerifier !== "string") throw invalid;

    const authRecord = await prisma.desktopAuthCode.findUnique({
      where: { code: body.code },
      include: { user: true },
    });
    if (!authRecord || !authRecord.codeChallenge) throw invalid;
    // Burn it before anything else, so a wrong verifier cannot be retried.
    await prisma.desktopAuthCode.delete({ where: { id: authRecord.id } });
    if (authRecord.expiresAt.getTime() < Date.now()) throw invalid;
    if (!pkceMatches(body.codeVerifier, authRecord.codeChallenge)) throw invalid;

    const customToken = await firebaseAdmin
      .auth()
      .createCustomToken(authRecord.user.firebaseUid, signInClaims(authRecord));
    return { status: 200, data: { customToken } };
  }
}

/** True when base64url(SHA-256(verifier)) equals the stored challenge. */
export const pkceMatches = (verifier: string, challenge: string): boolean => {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
};

const MICROSOFT_MOBILE_STATE_PURPOSE = "microsoft-mobile-login";
const MOBILE_CODE_TTL_MS = 2 * 60_000;
const oauthStateSecret = () => process.env.OAUTH_STATE_SECRET || MS_CLIENT_SECRET;

/**
 * The email to trust from Microsoft Graph. `mail` can be set to any address
 * by the admin of any Entra tenant (the "nOAuth" issue), so it is never used.
 * A userPrincipalName can only use a domain the tenant has verified. Guest
 * UPNs ("...#EXT#@tenant") do not name the person's own address.
 */
export const trustedMicrosoftEmail = (msUser: { userPrincipalName?: string }): string | null => {
  const upn = (msUser.userPrincipalName ?? "").trim().toLowerCase();
  if (!upn || upn.includes("#ext#")) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(upn) ? upn : null;
};

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

  // The app keeps a PKCE verifier and a random app state in memory. The
  // challenge goes into the signed state so the callback can bind the
  // one-time code to it; the app state comes back in the deep link so the
  // app can refuse a sign-in it did not start.
  const codeChallenge = req.query["code_challenge"];
  const appState = req.query["app_state"];

  // Apps up to 4.4.0 send neither and expect the token in the deep link, as
  // before PKCE. They keep working until they are gone from the stores; an
  // app that sends one of the two must send both, valid.
  const legacyApp = codeChallenge === undefined && appState === undefined;
  if (legacyApp) {
    const legacyState = createOAuthState(
      MICROSOFT_MOBILE_STATE_PURPOSE,
      { redirect_uri, legacy: true },
      oauthStateSecret(),
    );
    const legacyParams = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${BACKEND_URL}/api/auth/microsoft/mobile-callback`,
      response_mode: "query",
      scope: "openid profile email User.Read",
      state: legacyState,
    });
    res.redirect(
      `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${legacyParams.toString()}`,
    );
    return;
  }

  if (typeof codeChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    res.status(400).json({ error: "Missing or invalid code_challenge. Update the app." });
    return;
  }
  if (typeof appState !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(appState)) {
    res.status(400).json({ error: "Missing or invalid app_state. Update the app." });
    return;
  }
  const state = createOAuthState(
    MICROSOFT_MOBILE_STATE_PURPOSE,
    { redirect_uri, codeChallenge, appState },
    oauthStateSecret(),
  );
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

  const decoded = readOAuthState<{
    redirect_uri: string;
    codeChallenge?: string;
    appState?: string;
    legacy?: boolean;
  }>(MICROSOFT_MOBILE_STATE_PURPOSE, state, oauthStateSecret());
  const redirect_uri = decoded?.redirect_uri;
  if (
    !decoded ||
    !redirect_uri ||
    !ALLOWED_MOBILE_REDIRECT_PREFIXES.some((p) => redirect_uri.startsWith(p))
  ) {
    res.status(400).send("Invalid or expired state parameter");
    return;
  }
  // An app up to 4.4.0 reads `token` and `error` and sends no app state.
  const legacyApp = decoded.legacy === true;
  const withAppState = (params: Record<string, string>) =>
    `${redirect_uri}?${new URLSearchParams(
      legacyApp || !decoded.appState ? params : { ...params, state: decoded.appState },
    ).toString()}`;

  if (msError || !code) {
    res.redirect(withAppState({ error: "Microsoft sign-in was cancelled or failed." }));
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
    const email = trustedMicrosoftEmail(msUser);
    if (!email) {
      throw new Error(
        "This Microsoft account has no verified sign-in address. Use another sign-in method.",
      );
    }
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

    if (legacyApp) {
      const legacyToken = await firebaseAdmin
        .auth()
        .createCustomToken(
          firebaseUserRecord.uid,
          signInClaims({ signInProvider: "microsoft.com" }),
        );
      res.redirect(withAppState({ token: legacyToken }));
      return;
    }

    // Hand the app a one-time code, not the token itself. The app exchanges
    // it with its PKCE verifier through POST /api/session/mobile-exchange.
    const dbUser = await prisma.user.findFirstOrThrow({
      where: { firebaseUid: firebaseUserRecord.uid },
    });
    const oneTimeCode = crypto.randomBytes(32).toString("hex");
    await prisma.desktopAuthCode.create({
      data: {
        code: oneTimeCode,
        userId: dbUser.id,
        codeChallenge: decoded.codeChallenge,
        signInProvider: "microsoft.com",
        expiresAt: new Date(Date.now() + MOBILE_CODE_TTL_MS),
      },
    });
    res.redirect(withAppState({ code: oneTimeCode }));
  } catch (err: any) {
    logger.error("[Microsoft Mobile OAuth] Callback error", err);
    const known =
      typeof err?.message === "string" && err.message.startsWith("This Microsoft account");
    res.redirect(withAppState({ error: known ? err.message : "Microsoft sign-in failed." }));
  }
}
