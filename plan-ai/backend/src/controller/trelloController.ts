import { Body, Get, Post, Request, Route, Security, Tags, Response, Path, Query } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { trelloIntegrationService } from "../services/trelloIntegrationService";
import type {
  TrelloManualConnectRequest,
  TrelloSummaryResponse,
  TrelloBoardItem,
  TrelloListItem,
  SetDefaultTrelloBoardListRequest,
} from "../services/trelloTypes";

@Route("api/trello")
@Tags("Integrations")
export class TrelloController extends BaseWorkspaceController {
  @Post("manual-connect")
  @Security("ClientLevel")
  @Response<ApiResponse<null>>(400, "Validation Error")
  public async manualConnect(
    @Request() request: AuthenticatedRequest,
    @Body() body: TrelloManualConnectRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    try {
      await trelloIntegrationService.verifyManualCredentials(workspaceId, body);
      return {
        status: 200,
        data: null,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to connect to Trello",
      };
    }
  }

  @Get("auth")
  @Security("ClientLevel")
  public async getAuthorizationUrl(
    @Request() request: AuthenticatedRequest,
    @Query() returnUrl: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    await this.requireAdminOrOwner(request);
    
    const apiKey = process.env.TRELLO_GLOBAL_API_KEY;
    if (!apiKey) {
      this.setStatus(500);
      return { status: 500, data: null as any, message: "Trello Global API Key is not configured" };
    }

    const authorizationUrl = `https://trello.com/1/authorize?key=${apiKey}&name=Plan%20AI&scope=read,write&expiration=never&response_type=token&return_url=${encodeURIComponent(returnUrl)}`;
    return { status: 200, data: { authorizationUrl } };
  }

  @Post("auto-connect")
  @Security("ClientLevel")
  @Response<ApiResponse<null>>(400, "Validation Error")
  public async autoConnect(
    @Request() request: AuthenticatedRequest,
    @Body() body: { token: string },
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    try {
      await trelloIntegrationService.verifyAutoConnectToken(workspaceId, body.token);
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to auto-connect to Trello",
      };
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<TrelloSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await trelloIntegrationService.getTrelloSummary(workspaceId);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Trello summary",
      };
    }
  }

  @Get("boards")
  @Security("ClientLevel")
  public async getBoards(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<TrelloBoardItem[]>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const boards = await trelloIntegrationService.listTrelloBoards(workspaceId);
      return { status: 200, data: boards };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Trello boards",
      };
    }
  }

  @Get("boards/{boardId}/lists")
  @Security("ClientLevel")
  public async getLists(
    @Request() request: AuthenticatedRequest,
    @Path() boardId: string,
  ): Promise<ApiResponse<TrelloListItem[]>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const lists = await trelloIntegrationService.listTrelloLists(workspaceId, boardId);
      return { status: 200, data: lists };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Trello lists",
      };
    }
  }

  @Post("default-board-list")
  @Security("ClientLevel")
  public async setDefaultBoardAndList(
    @Request() request: AuthenticatedRequest,
    @Body() body: SetDefaultTrelloBoardListRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    try {
      await trelloIntegrationService.setDefaultTrelloBoardAndList(
        workspaceId,
        body.boardId,
        body.listId,
      );
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default Trello context",
      };
    }
  }
}
