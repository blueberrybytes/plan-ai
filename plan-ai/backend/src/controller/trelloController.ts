import { Body, Get, Post, Request, Route, Security, Tags, Response, Path } from "tsoa";
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      await trelloIntegrationService.verifyManualCredentials(user.id, body);
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

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<TrelloSummaryResponse>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await trelloIntegrationService.getTrelloSummary(user.id);
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const boards = await trelloIntegrationService.listTrelloBoards(user.id);
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const lists = await trelloIntegrationService.listTrelloLists(user.id, boardId);
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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      await trelloIntegrationService.setDefaultTrelloBoardAndList(
        user.id,
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
