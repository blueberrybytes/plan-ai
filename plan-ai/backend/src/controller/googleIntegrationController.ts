/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Get, Route, Request, Tags, SuccessResponse, Security, Query } from "tsoa";
import { PrismaClient } from "@prisma/client";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { googleIntegrationService } from "../services/googleIntegrationService";
import { type ApiResponse } from "./controllerTypes";
import EnvUtils from "../utils/EnvUtils";

const prisma = new PrismaClient();

@Tags("Integrations")
@Route("api/integrations")
export class GoogleIntegrationController extends Controller {
  /**
   * Returns the OAuth authorization URL for Google Drive
   */
  @SuccessResponse("200", "URL fetched successfully")
  @Security("ClientLevel")
  @Get("google/auth-url")
  public async getAuthUrl(
    @Request() request: AuthenticatedRequest,
    @Query() redirectPath?: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized.");
    }

    const stateObj = { uid: request.user.uid, redirectPath };
    const state = encodeURIComponent(JSON.stringify(stateObj));
    const url = googleIntegrationService.getAuthUrl(state);

    return {
      status: 200,
      data: {
        authorizationUrl: url,
      },
    };
  }

  /**
   * OAuth Callback handler. Exchanges code for tokens, binds to user, and redirects to frontend.
   */
  @SuccessResponse("302", "Redirect")
  @Get("google/callback")
  public async handleGoogleCallback(
    @Request() request: any, // Express specific
    @Query() code: string,
    @Query() state?: string,
  ): Promise<void> {
    const res = request.res;
    // Note: To map this securely, we should have passed `uid` in `state`!
    // Since Google OAuth redirect doesn't carry Bearer tokens, we encode the user's Firebase UID into `state` when generating the auth URL.

    if (!state) {
      if (res)
        return res.redirect(
          `${EnvUtils.get("FRONTEND_URL", "http://localhost:3000")}/integrations/google?status=error&message=MissingState`,
        );
      throw new Error("Missing state");
    }

    try {
      const stateObj = JSON.parse(decodeURIComponent(state));
      const firebaseUid = stateObj.uid;
      const redirectPath = stateObj.redirectPath || "/integrations/google";

      const user = await prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        if (res)
          return res.redirect(
            `${EnvUtils.get("FRONTEND_URL", "http://localhost:3000")}${redirectPath}?status=error&message=UserNotFound`,
          );
        throw new Error("User not found.");
      }

      // Exchange code via service
      const tokens = await googleIntegrationService.exchangeCode(code);

      // Upsert the integration record
      await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: "GOOGLE_DRIVE",
          },
        },
        update: {
          status: "CONNECTED",
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
          expiresAt: tokens.expiresAt,
          accountId: tokens.accountId,
          accountName: tokens.accountName,
        },
        create: {
          userId: user.id,
          provider: "GOOGLE_DRIVE",
          status: "CONNECTED",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || "",
          expiresAt: tokens.expiresAt,
          accountId: tokens.accountId,
          accountName: tokens.accountName,
        },
      });

      if (res)
        return res.redirect(
          `${EnvUtils.get("FRONTEND_URL", "http://localhost:3000")}${redirectPath}?status=success`,
        );
    } catch (err: any) {
      console.error("Google OAuth Callback Error:", err);
      if (res)
        return res.redirect(
          `${EnvUtils.get("FRONTEND_URL", "http://localhost:3000")}/integrations/google?status=error&message=ExchangeFailed`,
        );
      throw new Error(`Google binding failed: ${err.message}`);
    }
  }
}
