import {
  Get,
  Post,
  Body,
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
import { googleIntegrationService, GoogleSummaryResponse } from "../services/googleIntegrationService";
import EnvUtils from "../utils/EnvUtils";

@Route("api/google")
@Tags("Integrations")
export class GoogleController extends BaseWorkspaceController {
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
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    
    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = googleIntegrationService.buildRedirectUri(backendUrl);

    const url = googleIntegrationService.getAuthUrl(state, redirectUri);

    return {
      status: 200,
      data: {
        authorizationUrl: url,
      },
    };
  }

  @SuccessResponse("302", "Redirect")
  @Get("callback")
  public async handleGoogleCallback(
    @Request() request: express.Request,
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
  ): Promise<void> {
    const res = request.res;
    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = googleIntegrationService.buildRedirectUri(backendUrl);

    if (error) {
      console.error(`Google OAuth Error: ${error}`);
      if (res) {
        return res.redirect(
          googleIntegrationService.buildFrontendRedirectUrl("error", "OAuthDeclined")
        );
      }
      throw new Error(`OAuth Error: ${error}`);
    }

    if (!state || !code) {
      if (res) {
        return res.redirect(
          googleIntegrationService.buildFrontendRedirectUrl("error", "MissingParams")
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
            googleIntegrationService.buildFrontendRedirectUrl("error", "MissingWorkspace", stateJson)
          );
        }
        throw new Error("Missing workspaceId in state");
      }

      await googleIntegrationService.handleOAuthCallback(workspaceId, code, redirectUri);

      if (res) {
        return res.redirect(
          googleIntegrationService.buildFrontendRedirectUrl("success", undefined, stateJson)
        );
      }
    } catch (err: unknown) {
      console.error("Google OAuth Callback Error:", err);
      if (res) {
        return res.redirect(
          googleIntegrationService.buildFrontendRedirectUrl("error", "ExchangeFailed")
        );
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Google binding failed: ${errorMessage}`);
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<GoogleSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await googleIntegrationService.getGoogleSummary(workspaceId);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Google summary",
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
      await googleIntegrationService.setDefaultFolder(workspaceId, body.folderId, body.folderName);
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
