import { Body, Get, Post, Query, Request, Route, Security, SuccessResponse, Tags } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { calendarService, type CalendarConnectResult } from "../services/calendarService";
import type { CalendarProvider, CurrentMeeting } from "../services/calendarEvents";

export interface CurrentMeetingResponse {
  event: CurrentMeeting | null;
}

/** What Google or Microsoft put in the web app URL after the consent screen. */
export interface CalendarConnectRequest {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * Google Calendar and Outlook Calendar. Each member connects their own
 * calendar (personal integration), so any member can connect, not only
 * admins. Disconnect goes through DELETE /api/integrations/{provider}.
 *
 * The consent screen sends the browser back to the web app, which posts the
 * code to `connect` with the user's session. The state must belong to that
 * user, so a connect link forwarded to someone else is useless.
 */
@Route("api/calendar")
@Tags("Calendar")
export class CalendarController extends BaseWorkspaceController {
  /**
   * The meeting the user is in now, or the next one within 15 minutes, from
   * every connected calendar. `event` is null when there is none or the
   * calendars cannot be read.
   */
  @Get("current-meeting")
  @Security("ClientLevel")
  public async getCurrentMeeting(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<CurrentMeetingResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const event = await calendarService.getCurrentMeeting(user.id, workspaceId);
    return { status: 200, data: { event } };
  }

  @SuccessResponse("200", "URL fetched successfully")
  @Security("ClientLevel")
  @Get("google/auth-url")
  public async getGoogleCalendarAuthUrl(
    @Request() request: AuthenticatedRequest,
    @Query() redirectPath?: string,
    @Query() appOrigin?: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    return this.authUrl(request, "GOOGLE_CALENDAR", redirectPath, appOrigin);
  }

  @Security("ClientLevel")
  @Post("google/connect")
  public async connectGoogleCalendar(
    @Request() request: AuthenticatedRequest,
    @Body() body: CalendarConnectRequest,
  ): Promise<ApiResponse<CalendarConnectResult>> {
    return this.connect(request, "GOOGLE_CALENDAR", body);
  }

  @SuccessResponse("200", "URL fetched successfully")
  @Security("ClientLevel")
  @Get("outlook/auth-url")
  public async getOutlookCalendarAuthUrl(
    @Request() request: AuthenticatedRequest,
    @Query() redirectPath?: string,
    @Query() appOrigin?: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    return this.authUrl(request, "OUTLOOK_CALENDAR", redirectPath, appOrigin);
  }

  @Security("ClientLevel")
  @Post("outlook/connect")
  public async connectOutlookCalendar(
    @Request() request: AuthenticatedRequest,
    @Body() body: CalendarConnectRequest,
  ): Promise<ApiResponse<CalendarConnectResult>> {
    return this.connect(request, "OUTLOOK_CALENDAR", body);
  }

  private async connect(
    request: AuthenticatedRequest,
    provider: CalendarProvider,
    body: CalendarConnectRequest,
  ): Promise<ApiResponse<CalendarConnectResult>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    const result = await calendarService.completeOAuth(provider, user.id, body ?? {});
    return { status: 200, data: result };
  }

  private async authUrl(
    request: AuthenticatedRequest,
    provider: CalendarProvider,
    redirectPath?: string,
    appOrigin?: string,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const authorizationUrl = calendarService.getAuthorizationUrl(
        provider,
        user.id,
        workspaceId,
        redirectPath,
        appOrigin,
      );
      return { status: 200, data: { authorizationUrl } };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Could not start the calendar connection",
      };
    }
  }
}
