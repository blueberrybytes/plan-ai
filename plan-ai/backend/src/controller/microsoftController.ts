import {
  Get,
  Request,
  Route,
  Security,
  Tags,
  Query,
  SuccessResponse,
} from "tsoa";
import * as express from "express";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { microsoftIntegrationService, MicrosoftSummaryResponse } from "../services/microsoftIntegrationService";
import EnvUtils from "../utils/EnvUtils";

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

    const stateObj = { uid: request.user.uid, workspaceId, redirectPath };
    // Safe base64 encoding for state
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    
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
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "OAuthDeclined")
        );
      }
      throw new Error(`OAuth Error: ${error}`);
    }

    if (!state || !code) {
      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "MissingParams")
        );
      }
      throw new Error("Missing code or state");
    }

    try {
      const stateJson = Buffer.from(state, "base64").toString("utf-8");
      const stateObj = JSON.parse(stateJson);
      const workspaceId = stateObj.workspaceId;

      if (!workspaceId) {
        if (res) {
          return res.redirect(
            microsoftIntegrationService.buildFrontendRedirectUrl("error", "MissingWorkspace", stateJson)
          );
        }
        throw new Error("Missing workspaceId in state");
      }

      await microsoftIntegrationService.handleOAuthCallback(workspaceId, code, redirectUri);

      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("success", undefined, stateJson)
        );
      }
    } catch (err: unknown) {
      console.error("Microsoft OAuth Callback Error:", err);
      if (res) {
        return res.redirect(
          microsoftIntegrationService.buildFrontendRedirectUrl("error", "ExchangeFailed")
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
}
