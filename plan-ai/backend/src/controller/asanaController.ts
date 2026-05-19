import type { Request as ExpressRequest } from "express";
import { Get, Query, Request, Route, Security, Tags, Post, Body } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { asanaIntegrationService } from "../services/asanaIntegrationService";
import { logger } from "../utils/logger";

interface AsanaAuthorizationResponse {
  authorizationUrl: string;
}

interface AsanaManualConnectRequest {
  personalAccessToken: string;
}

interface AsanaSummaryResponse {
  totalTasks: number | null;
  totalProjects: number | null;
}

interface AsanaProjectItem {
  gid: string;
  name: string;
}

interface AsanaSetDefaultProjectRequest {
  projectGid: string;
}

@Route("api/asana")
@Tags("Integrations")
export class AsanaController extends BaseWorkspaceController {
  @Get("auth")
  @Security("ClientLevel")
  public async getAuthorizationUrl(
    @Request() request: AuthenticatedRequest,
    @Query() state?: string,
  ): Promise<ApiResponse<AsanaAuthorizationResponse>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    const baseUrl = this.getBaseUrl(request);
    const redirectUri = asanaIntegrationService.buildRedirectUri(baseUrl);
    const stateToken = asanaIntegrationService.createStateToken({
      workspaceId,
      issuedAt: Date.now(),
      clientState: state ?? null,
    });
    const authorizationUrl = asanaIntegrationService.buildAuthorizationUrl({
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
  ): Promise<void> {
    if (error) {
      logger.warn("Asana authorization returned error", { error, state });
      this.redirectToFrontend({
        result: "error",
        message: error,
        state,
      });
      return;
    }

    if (!code) {
      logger.warn("Asana authorization callback missing code", { state });
      this.redirectToFrontend({
        result: "error",
        message: "Missing authorization code",
        state: undefined,
      });
      return;
    }

    const statePayload = state ? asanaIntegrationService.parseAndValidateState(state) : null;

    if (!statePayload) {
      logger.warn("Invalid or missing Asana state token", { state });
      this.redirectToFrontend({
        result: "error",
        message: "Invalid authorization state",
        state: undefined,
      });
      return;
    }

    // Validate the workspaceId exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: statePayload.workspaceId },
    });

    if (!workspace) {
      logger.warn("Asana callback received for unknown workspace", {
        workspaceId: statePayload.workspaceId,
      });
      return;
    }

    const baseUrl = this.getBaseUrl(request);
    const redirectUri = asanaIntegrationService.buildRedirectUri(baseUrl);

    try {
      const tokenResponse = await asanaIntegrationService.exchangeCodeForTokens(code, redirectUri);

      // Get the user info (workspaces, name, etc.)
      const asanaUser = await asanaIntegrationService.getCurrentUser(tokenResponse.access_token);

      await asanaIntegrationService.upsertIntegration({
        workspaceId: statePayload.workspaceId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresInSeconds: tokenResponse.expires_in,
        asanaUser,
      });
    } catch (integrationError: unknown) {
      logger.error("Failed to complete Asana integration", integrationError);
      this.redirectToFrontend({
        result: "error",
        message: "Failed to complete Asana authorization",
        state: statePayload.clientState ?? undefined,
      });
      return;
    }

    this.redirectToFrontend({
      result: "success",
      message: "Asana account connected",
      state: statePayload.clientState ?? undefined,
    });
  }

  @Post("manual-connect")
  @Security("ClientLevel")
  public async manualConnect(
    @Request() request: AuthenticatedRequest,
    @Body() body: AsanaManualConnectRequest,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);

    try {
      await asanaIntegrationService.verifyManualCredentials(
        workspaceId,
        body.personalAccessToken,
      );

      return {
        status: 200,
        data: { success: true },
        message: "Asana manually connected successfully",
      };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to connect to Asana",
      };
    }
  }

  @Get("summary")
  @Security("ClientLevel")
  public async getSummary(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<AsanaSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    try {
      const summary = await asanaIntegrationService.getAsanaSummary(workspaceId);
      return { status: 200, data: summary };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get Asana summary",
      };
    }
  }

  @Get("projects")
  @Security("ClientLevel")
  public async getProjects(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<AsanaProjectItem[]>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      const projects = await asanaIntegrationService.listAsanaProjects(workspaceId);
      return { status: 200, data: projects };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to list Asana projects",
      };
    }
  }

  @Post("default-project")
  @Security("ClientLevel")
  public async setDefaultProject(
    @Request() request: AuthenticatedRequest,
    @Body() body: AsanaSetDefaultProjectRequest,
  ): Promise<ApiResponse<null>> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    try {
      await asanaIntegrationService.setDefaultAsanaProject(workspaceId, body.projectGid);
      return { status: 200, data: null };
    } catch (error) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: error instanceof Error ? error.message : "Failed to set default Asana project",
      };
    }
  }

  private redirectToFrontend(params: {
    result: "success" | "error";
    message?: string;
    state?: string;
  }) {
    const redirectUrl = asanaIntegrationService.buildFrontendRedirectUrl(params);
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
