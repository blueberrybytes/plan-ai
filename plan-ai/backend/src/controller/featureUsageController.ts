import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import {
  getFeatureUsageReport,
  trackClientFeature,
  type FeatureUsageReport,
} from "../services/featureUsageService";

/**
 * What an app sends to count one use of a feature. Only `feature` and
 * `client` are read. Anything else in the body is ignored and never stored.
 */
export interface TrackFeatureBody {
  /** A name from the fixed list in services/featureUsageService.ts. */
  feature: string;
  /** "web", "recorder" or "mobile". */
  client: string;
  [ignored: string]: unknown;
}

export type FeatureUsageReportResponse = FeatureUsageReport;

/**
 * Counts for the things only an app can see, such as opening a section or
 * downloading a file made in the browser. A name outside the list is dropped
 * without an error, so an old app version never breaks on a removed name.
 */
@Tags("Usage")
@Route("api/usage")
export class FeatureUsageController extends BaseWorkspaceController {
  @Post("feature")
  @Security("ClientLevel")
  @SuccessResponse(204, "Counted or dropped")
  public async trackFeatureUse(
    @Request() request: AuthenticatedRequest,
    @Body() body: TrackFeatureBody,
  ): Promise<void> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    trackClientFeature({
      feature: body?.feature,
      client: body?.client,
      workspaceId,
      userId: user.id,
    });
    this.setStatus(204);
  }
}

/** Which features are used, for platform admins. Counts only. */
@Tags("Admin")
@Route("api/admin/feature-usage")
@Security("AdminOnly")
export class AdminFeatureUsageController extends Controller {
  /**
   * Every feature of the catalogue with its uses in the last `days` days
   * (default 30, at most 365), the unused ones included.
   */
  @Get()
  public async getFeatureUsage(@Query() days?: number): Promise<FeatureUsageReportResponse> {
    return getFeatureUsageReport(days);
  }
}
