import {
  Body,
  Get,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Response,
  Query,
  SuccessResponse,
} from "tsoa";
import * as express from "express";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { linearIntegrationService } from "../services/linearIntegrationService";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";

interface LinearManualConnectRequest {
  apiKey: string;
}

interface LinearSummaryResponse {
  totalIssues: number | null;
  totalProjects: number | null;
  latestTeams: string[];
}

interface LinearTeamItem {
  id: string;
  name: string;
}

interface SetDefaultTeamRequest {
  teamId: string;
}

@Route("api/linear")
@Tags("Integrations")
export class LinearController extends BaseWorkspaceController {
  @Post("manual-connect")
  @Security("ClientLevel")
  @Response<ApiResponse<null>>(400, "Validation Error")
  public async manualConnect(
    @Request() request: AuthenticatedRequest,
    @Body() body: LinearManualConnectRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    try {
      await linearIntegrationService.verifyManualCredentials(workspaceId, body);
      return {
        status: 200,
        data: null,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to connect to Linear",
      };
    }
  }

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
    const url = linearIntegrationService.getAuthUrl(state);

    return {
      status: 200,
      data: {
        authorizationUrl: url,
      },
    };
  }

  @SuccessResponse("302", "Redirect")
  @Get("callback")
  public async handleLinearCallback(
    @Request() request: express.Request, // Express specific
    @Query() code: string,
    @Query() state?: string,
  ): Promise<void> {
    const res = request.res;

    const baseUrl = EnvUtils.get("FRONTEND_URL", "http://localhost:3000");

    if (!state) {
      if (res) {
        const targetUrl = new URL("/integrations", baseUrl);
        targetUrl.searchParams.set("provider", "linear");
        targetUrl.searchParams.set("status", "error");
        targetUrl.searchParams.set("message", "MissingState");
        return res.redirect(targetUrl.toString());
      }
      throw new Error("Missing state");
    }

    try {
      const stateObj = JSON.parse(decodeURIComponent(state));
      const firebaseUid = stateObj.uid;
      const workspaceId = stateObj.workspaceId;
      const redirectPath = stateObj.redirectPath || "/integrations?provider=linear";

      if (!workspaceId) {
        if (res) {
          const targetUrl = new URL(redirectPath, baseUrl);
          targetUrl.searchParams.set("status", "error");
          targetUrl.searchParams.set("message", "MissingWorkspace");
          return res.redirect(targetUrl.toString());
        }
        throw new Error("Missing workspaceId in state");
      }

      const user = await prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        if (res) {
          const targetUrl = new URL(redirectPath, baseUrl);
          targetUrl.searchParams.set("status", "error");
          targetUrl.searchParams.set("message", "UserNotFound");
          return res.redirect(targetUrl.toString());
        }
        throw new Error("User not found.");
      }

      // Exchange code via service
      const tokens = await linearIntegrationService.exchangeCode(code);

      // Upsert the workspace integration record
      await prisma.workspaceIntegration.upsert({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider: "LINEAR",
          },
        },
        update: {
          status: "CONNECTED",
          accessToken: tokens.accessToken,
          accountId: tokens.accountId,
          accountName: tokens.accountName,
          metadata: { authType: "OAUTH" },
        },
        create: {
          workspaceId,
          provider: "LINEAR",
          status: "CONNECTED",
          accessToken: tokens.accessToken,
          accountId: tokens.accountId,
          accountName: tokens.accountName,
          metadata: { authType: "OAUTH" },
        },
      });

      if (res) {
        const targetUrl = new URL(redirectPath, baseUrl);
        targetUrl.searchParams.set("status", "success");
        return res.redirect(targetUrl.toString());
      }
    } catch (err: unknown) {
      console.error("Linear OAuth Callback Error:", err);
      if (res) {
        const targetUrl = new URL("/integrations", baseUrl);
        targetUrl.searchParams.set("provider", "linear");
        targetUrl.searchParams.set("status", "error");
        targetUrl.searchParams.set("message", "ExchangeFailed");
        return res.redirect(targetUrl.toString());
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Linear binding failed: ${errorMessage}`);
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<LinearSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await linearIntegrationService.getLinearSummary(workspaceId);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Linear summary",
      };
    }
  }

  @Get("teams")
  @Security("ClientLevel")
  public async getTeams(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<LinearTeamItem[]>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const teams = await linearIntegrationService.listLinearTeams(workspaceId);
      return { status: 200, data: teams };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Linear teams",
      };
    }
  }

  @Post("default-team")
  @Security("ClientLevel")
  public async setDefaultTeam(
    @Request() request: AuthenticatedRequest,
    @Body() body: SetDefaultTeamRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    console.log(
      `[LinearController] setDefaultTeam called for workspace ${workspaceId} with body:`,
      body,
    );
    try {
      await linearIntegrationService.setDefaultLinearTeam(workspaceId, body.teamId);
      console.log(`[LinearController] setDefaultTeam SUCCESS for workspace ${workspaceId}`);
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default Linear team",
      };
    }
  }
}
