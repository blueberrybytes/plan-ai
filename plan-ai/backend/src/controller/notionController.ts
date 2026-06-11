import { Body, Get, Post, Request, Route, Security, Tags, Query, SuccessResponse } from "tsoa";
import * as express from "express";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import {
  notionIntegrationService,
  NotionSummaryResponse,
} from "../services/notionIntegrationService";
import EnvUtils from "../utils/EnvUtils";

interface NotionDatabaseItem {
  id: string;
  name: string;
  url: string;
}

interface SetDefaultDatabaseRequest {
  databaseId: string;
}

@Route("api/notion")
@Tags("Integrations")
export class NotionController extends BaseWorkspaceController {
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
    const state = encodeURIComponent(JSON.stringify(stateObj));

    // We get the server's base URL and configure the Notion redirect URI correctly
    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = notionIntegrationService.buildRedirectUri(backendUrl);

    const url = notionIntegrationService.buildAuthorizationUrl(redirectUri, state);

    return {
      status: 200,
      data: {
        authorizationUrl: url,
      },
    };
  }

  @SuccessResponse("302", "Redirect")
  @Get("callback")
  public async handleNotionCallback(
    @Request() request: express.Request,
    @Query() code: string,
    @Query() state?: string,
  ): Promise<void> {
    const res = request.res;
    const backendUrl = EnvUtils.get("BACKEND_URL", "http://localhost:8080");
    const redirectUri = notionIntegrationService.buildRedirectUri(backendUrl);

    if (!state) {
      if (res) {
        return res.redirect(
          notionIntegrationService.buildFrontendRedirectUrl("error", "MissingState"),
        );
      }
      throw new Error("Missing state");
    }

    try {
      const stateObj = JSON.parse(decodeURIComponent(state));
      const workspaceId = stateObj.workspaceId;

      if (!workspaceId) {
        if (res) {
          return res.redirect(
            notionIntegrationService.buildFrontendRedirectUrl("error", "MissingWorkspace", state),
          );
        }
        throw new Error("Missing workspaceId in state");
      }

      await notionIntegrationService.handleOAuthCallback(workspaceId, code, redirectUri);

      if (res) {
        return res.redirect(
          notionIntegrationService.buildFrontendRedirectUrl("success", undefined, state),
        );
      }
    } catch (err: unknown) {
      console.error("Notion OAuth Callback Error:", err);
      if (res) {
        return res.redirect(
          notionIntegrationService.buildFrontendRedirectUrl("error", "ExchangeFailed", state),
        );
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Notion binding failed: ${errorMessage}`);
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<NotionSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await notionIntegrationService.getNotionSummary(workspaceId);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Notion summary",
      };
    }
  }

  @Get("databases")
  @Security("ClientLevel")
  public async getDatabases(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<NotionDatabaseItem[]>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const databases = await notionIntegrationService.getDatabases(workspaceId);
      return { status: 200, data: databases };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Notion databases",
      };
    }
  }

  @Post("default-database")
  @Security("ClientLevel")
  public async setDefaultDatabase(
    @Request() request: AuthenticatedRequest,
    @Body() body: SetDefaultDatabaseRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    console.log(
      `[NotionController] setDefaultDatabase called for workspace ${workspaceId} with body:`,
      body,
    );
    try {
      await notionIntegrationService.setDefaultDatabase(workspaceId, body.databaseId);
      console.log(`[NotionController] setDefaultDatabase SUCCESS for workspace ${workspaceId}`);
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default Notion database",
      };
    }
  }
}
