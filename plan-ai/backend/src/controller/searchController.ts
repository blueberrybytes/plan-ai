import { countFeature } from "../services/featureUsageService";
import { Get, Query, Request, Route, Security, Tags } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type ApiResponse } from "./controllerTypes";
import {
  SearchQueryError,
  searchWorkspace,
  type GlobalSearchResult,
  type SearchHit,
  type SearchHitType,
} from "../services/globalSearchService";

export type SearchHitTypeValue = SearchHitType;
export type SearchHitResponse = SearchHit;
export type GlobalSearchResponse = GlobalSearchResult;

@Route("api/search")
@Tags("Search")
export class SearchController extends BaseWorkspaceController {
  /**
   * Searches meetings, tasks, documents and projects of the workspace.
   * `q` needs at least 2 characters and is cut at 200. `limit` defaults to 20
   * and stops at 50.
   */
  @Get()
  @Security("ClientLevel")
  public async searchWorkspace(
    @Request() request: AuthenticatedRequest,
    @Query() q: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<GlobalSearchResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    countFeature("search.used");
    try {
      return { status: 200, data: await searchWorkspace(workspaceId, q, limit) };
    } catch (err) {
      if (err instanceof SearchQueryError) {
        this.setStatus(400);
        throw { status: 400, message: err.message };
      }
      throw err;
    }
  }
}
