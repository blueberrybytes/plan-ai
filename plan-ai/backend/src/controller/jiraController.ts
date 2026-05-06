import type { Request as ExpressRequest } from "express";
import { Get, Query, Request, Route, Security, Tags, Post, Body } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { jiraIntegrationService } from "../services/jiraIntegrationService";
import { logger } from "../utils/logger";

interface JiraAuthorizationResponse {
  authorizationUrl: string;
}

interface JiraManualConnectRequest {
  siteUrl: string;
  email: string;
  apiToken: string;
}

interface JiraSummaryResponse {
  totalIssues: string | null;
  totalProjects: number | null;
  latestBoards: string[];
}

interface JiraProjectItem {
  id: string;
  name: string;
  key: string;
}

interface SetDefaultProjectRequest {
  projectId: string;
}

@Route("api/jira")
@Tags("Integrations")
export class JiraController extends BaseWorkspaceController {
  @Get("auth")
  @Security("ClientLevel")
  public async getAuthorizationUrl(
    @Request() request: AuthenticatedRequest,
    @Query() state?: string,
  ): Promise<ApiResponse<JiraAuthorizationResponse>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    const baseUrl = this.getBaseUrl(request);
    const redirectUri = jiraIntegrationService.buildRedirectUri(baseUrl);
    const stateToken = jiraIntegrationService.createStateToken({
      userId: user.id,
      issuedAt: Date.now(),
      clientState: state ?? null,
    });
    const authorizationUrl = jiraIntegrationService.buildAuthorizationUrl({
      redirectUri,
      state: stateToken,
    });

    return {
      status: 200,
      data: { authorizationUrl },
    };
  }

  @Get("callback")
  public async handleCallback(
    @Request() request: ExpressRequest,
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
    @Query("error_description") errorDescription?: string,
  ): Promise<void> {
    if (error) {
      logger.warn("Jira authorization returned error", {
        error,
        errorDescription,
        state,
      });
      this.redirectToFrontend({
        result: "error",
        message: errorDescription ?? error,
        state,
      });
      return;
    }

    if (!code) {
      logger.warn("Jira authorization callback missing code", { state });
      this.redirectToFrontend({
        result: "error",
        message: "Missing authorization code",
        state: undefined,
      });
      return;
    }

    const statePayload = state ? jiraIntegrationService.parseAndValidateState(state) : null;

    if (!statePayload) {
      logger.warn("Invalid or missing Jira state token", { state });
      this.redirectToFrontend({
        result: "error",
        message: "Invalid authorization state",
        state: undefined,
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: statePayload.userId },
    });

    if (!user) {
      logger.warn("Jira callback received for unknown user", {
        userId: statePayload.userId,
      });
      return;
    }

    const baseUrl = this.getBaseUrl(request);
    const redirectUri = jiraIntegrationService.buildRedirectUri(baseUrl);

    try {
      const tokenResponse = await jiraIntegrationService.exchangeCodeForTokens(code, redirectUri);

      const accessibleResources = await jiraIntegrationService.listAccessibleResources(
        tokenResponse.access_token,
      );

      const primaryResource = accessibleResources[0];

      await jiraIntegrationService.upsertIntegration({
        userId: user.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresInSeconds: tokenResponse.expires_in,
        scope: tokenResponse.scope,
        resource: primaryResource,
      });
    } catch (integrationError: unknown) {
      logger.error("Failed to complete Jira integration", integrationError);
      this.redirectToFrontend({
        result: "error",
        message: "Failed to complete Jira authorization",
        state: statePayload.clientState ?? undefined,
      });
      return;
    }

    this.redirectToFrontend({
      result: "success",
      message: "Jira account connected",
      state: statePayload.clientState ?? undefined,
    });
  }

  @Post("manual-connect")
  @Security("ClientLevel")
  public async manualConnect(
    @Request() request: AuthenticatedRequest,
    @Body() body: JiraManualConnectRequest,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      await jiraIntegrationService.verifyManualCredentials(
        user.id,
        body.siteUrl,
        body.email,
        body.apiToken,
      );

      return {
        status: 200,
        data: { success: true },
        message: "Jira manually connected successfully",
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to connect to Jira",
      };
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<JiraSummaryResponse>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await jiraIntegrationService.getJiraSummary(user.id);
      return {
        status: 200,
        data: summary,
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Jira summary",
      };
    }
  }

  @Get("projects")
  @Security("ClientLevel")
  public async getProjects(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<JiraProjectItem[]>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const projects = await jiraIntegrationService.listJiraProjects(user.id);
      return { status: 200, data: projects };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Jira projects",
      };
    }
  }

  @Post("default-project")
  @Security("ClientLevel")
  public async setDefaultProject(
    @Request() request: AuthenticatedRequest,
    @Body() body: SetDefaultProjectRequest,
  ): Promise<ApiResponse<null>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    console.log(`[JiraController] setDefaultProject called by ${user.id} with body:`, body);
    try {
      await jiraIntegrationService.setDefaultJiraProject(user.id, body.projectId);
      console.log(`[JiraController] setDefaultProject SUCCESS for ${user.id}`);
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default Jira project",
      };
    }
  }

  private redirectToFrontend(params: {
    result: "success" | "error";
    message?: string;
    state?: string;
  }) {
    const redirectUrl = jiraIntegrationService.buildFrontendRedirectUrl(params);
    this.setHeader("Location", redirectUrl);
    this.setStatus(302);
  }

  private getBaseUrl(request: ExpressRequest): string {
    const forwardedProto = request.headers["x-forwarded-proto"];
    const forwardedHost = request.headers["x-forwarded-host"];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : (forwardedProto ?? request.protocol);

    const hostHeader = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : (forwardedHost ?? request.headers.host ?? request.get("host"));

    if (hostHeader) {
      return `${protocol}://${hostHeader}`;
    }

    const fallback = process.env.BACKEND_URL ?? "http://localhost:8080";
    return fallback;
  }
}
