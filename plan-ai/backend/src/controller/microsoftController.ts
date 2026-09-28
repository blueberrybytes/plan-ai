import { Get, Post, Body, Request, Route, Security, Tags, Query, SuccessResponse } from "tsoa";
import * as express from "express";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import {
  microsoftIntegrationService,
  MicrosoftSummaryResponse,
} from "../services/microsoftIntegrationService";
import EnvUtils from "../utils/EnvUtils";
import { createOAuthState, readOAuthState, safeRedirectPath } from "../utils/oauthState";

const OAUTH_STATE_PURPOSE = "onedrive";

// Key for signing the OAuth state. A dedicated OAUTH_STATE_SECRET is better;
// the OAuth client secret is the fallback so no new setting is required.
const oauthStateSecret = (): string =>
  process.env.OAUTH_STATE_SECRET || EnvUtils.get("MICROSOFT_CLIENT_SECRET", "");

@Route("api/microsoft")
@Tags("Integrations")
export class MicrosoftController extends BaseWorkspaceController {
  @SuccessResponse("200", "URL fetched successfully")
  @Security("ClientLevel")
  @Get("auth-url")
  public async getAuthUrl(
    @Request() request: AuthenticatedRequest,
    @Query() redirectPath?: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized.");
    }

    // Signed and short-lived: the callback trusts the workspaceId inside it.
    const state = createOAuthState(
      OAUTH_STATE_PURPOSE,
      { uid: request.user.uid, workspaceId, redirectPath: safeRedirectPath(redirectPath) },
      oauthStateSecret(),
    );

    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = microsoftIntegrationService.buildRedirectUri(backendUrl);

    const url = microsoftIntegrationService.buildAuthorizationUrl(redirectUri, state);

    return {
      status: 200,
      data: {
        authorizationUrl: url,
      },
    };
  }

  @SuccessResponse("302", "Redirect")
  @Get("callback")
  public async handleMicrosoftCallback(
    @Request() request: express.Request,
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
    @Query() error_description?: string,
  ): Promise<void> {
    const res = request.res;
    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = microsoftIntegrationService.buildRedirectUri(backendUrl);

    if (error) {
      console.error(`Microsoft OAuth Error: ${error} - ${error_description}`);
      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "OAuthDeclined"),
        );
      }
      throw new Error(`OAuth Error: ${error}`);
    }

    if (!state || !code) {
      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "MissingParams"),
        );
      }
      throw new Error("Missing code or state");
    }

    try {
      const stateObj = readOAuthState<{ workspaceId?: string; redirectPath?: string }>(
        OAUTH_STATE_PURPOSE,
        state,
        oauthStateSecret(),
      );
      if (!stateObj) {
        if (res) {
          return res.redirect(
            microsoftIntegrationService.buildFrontendRedirectUrl("error", "InvalidState"),
          );
        }
        throw new Error("Invalid or expired OAuth state");
      }
      const stateJson = JSON.stringify(stateObj);
      const workspaceId = stateObj.workspaceId;

      if (!workspaceId) {
        if (res) {
          return res.redirect(
            microsoftIntegrationService.buildFrontendRedirectUrl(
              "error",
              "MissingWorkspace",
              stateJson,
            ),
          );
        }
        throw new Error("Missing workspaceId in state");
      }

      await microsoftIntegrationService.handleOAuthCallback(workspaceId, code, redirectUri);

      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("success", undefined, stateJson),
        );
      }
    } catch (err: unknown) {
      console.error("Microsoft OAuth Callback Error:", err);
      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "ExchangeFailed"),
        );
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Microsoft binding failed: ${errorMessage}`);
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<MicrosoftSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await microsoftIntegrationService.getMicrosoftSummary(workspaceId);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Microsoft summary",
      };
    }
  }

  @Post("default-folder")
  @Security("ClientLevel")
  public async setDefaultFolder(
    @Request() request: AuthenticatedRequest,
    @Body() body: { folderId: string; folderName: string },
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    try {
      await microsoftIntegrationService.setDefaultFolder(
        workspaceId,
        body.folderId,
        body.folderName,
      );
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default folder",
      };
    }
  }
}
