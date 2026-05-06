import { Body, Get, Post, Request, Route, Security, Tags, Response } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { linearIntegrationService } from "../services/linearIntegrationService";

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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      await linearIntegrationService.verifyManualCredentials(user.id, body);
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

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<LinearSummaryResponse>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await linearIntegrationService.getLinearSummary(user.id);
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const teams = await linearIntegrationService.listLinearTeams(user.id);
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    console.log(`[LinearController] setDefaultTeam called by ${user.id} with body:`, body);
    try {
      await linearIntegrationService.setDefaultLinearTeam(user.id, body.teamId);
      console.log(`[LinearController] setDefaultTeam SUCCESS for ${user.id}`);
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
