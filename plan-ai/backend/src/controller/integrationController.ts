import { Get, Delete, Path, Request, Route, Security, Tags } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type ApiResponse, type TsoaJsonObject } from "./controllerTypes";
import { integrationService } from "../services/integrationService";
import type { IntegrationSummary } from "../services/integrationService";
import { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import type {
  TrelloIntegrationMetadata,
  JiraIntegrationMetadata,
  AsanaIntegrationMetadata,
} from "../services/integrationMetadataTypes";

interface IntegrationSummaryResponse {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountId: string | null;
  accountName: string | null;
  metadata: TsoaJsonObject | null;
  scope: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hasRefreshToken: boolean;
  defaultBoardUrl?: string | null;
  isWorkspaceLevel: boolean;
}

@Route("api/integrations")
@Tags("Integrations")
export class IntegrationController extends BaseWorkspaceController {
  @Get("")
  @Security("ClientLevel")
  public async listIntegrations(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<IntegrationSummaryResponse[]>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const integrations = await integrationService.listIntegrationsForContext(workspaceId, user.id);

    return {
      status: 200,
      data: integrations.map((i) => this.mapIntegrationResponse(i)),
    };
  }

  @Get("{provider}")
  @Security("ClientLevel")
  public async getIntegration(
    @Request() request: AuthenticatedRequest,
    @Path() provider: string,
  ): Promise<ApiResponse<IntegrationSummaryResponse | null>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const providerEnum = this.parseProvider(provider);

    if (!providerEnum) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: "Unknown integration provider",
      };
    }

    const integration = await integrationService.getIntegrationForContext(
      workspaceId,
      user.id,
      providerEnum,
    );

    if (!integration) {
      this.setStatus(404);
      return {
        status: 404,
        data: null,
        message: "Integration not found",
      };
    }

    return {
      status: 200,
      data: this.mapIntegrationResponse(integration),
    };
  }

  @Delete("{provider}")
  @Security("ClientLevel")
  public async disconnectIntegration(
    @Request() request: AuthenticatedRequest,
    @Path() provider: string,
  ): Promise<ApiResponse<null>> {
    const providerEnum = this.parseProvider(provider);

    if (!providerEnum) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: "Unknown integration provider",
      };
    }

    // Workspace-level integrations require ADMIN/OWNER to disconnect
    if (integrationService.isWorkspaceProvider(providerEnum)) {
      const { workspaceId } = await this.requireAdminOrOwner(request);
      const success = await integrationService.deleteIntegrationForContext(
        workspaceId,
        "",
        providerEnum,
      );

      if (!success) {
        this.setStatus(404);
        return { status: 404, data: null, message: "Integration not found" };
      }
    } else {
      // User-level integrations (GitHub, Google Drive) — user can disconnect their own
      const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
      const success = await integrationService.deleteIntegrationForContext(
        workspaceId,
        user.id,
        providerEnum,
      );

      if (!success) {
        this.setStatus(404);
        return { status: 404, data: null, message: "Integration not found" };
      }
    }

    return {
      status: 200,
      data: null,
      message: "Integration disconnected successfully",
    };
  }

  private mapIntegrationResponse(integration: IntegrationSummary): IntegrationSummaryResponse {
    let defaultBoardUrl = null;

    if (integration.provider === "TRELLO") {
      const metadata = (integration.metadata ?? {}) as Partial<TrelloIntegrationMetadata>;
      if (metadata.defaultBoardId) {
        defaultBoardUrl = `https://trello.com/b/${metadata.defaultBoardId}`;
      }
    } else if (integration.provider === "LINEAR") {
      const metadata = (integration.metadata ?? {}) as Record<string, string>;
      if (metadata.organizationUrlKey && metadata.teamKey) {
        defaultBoardUrl = `https://linear.app/${metadata.organizationUrlKey}/team/${metadata.teamKey}/all`;
      } else {
        defaultBoardUrl = `https://linear.app`;
      }
    } else if (integration.provider === "JIRA") {
      const metadata = (integration.metadata ?? {}) as Partial<JiraIntegrationMetadata>;
      if (metadata.jiraSiteUrl) {
        defaultBoardUrl = metadata.defaultProjectId
          ? `${metadata.jiraSiteUrl}/browse/${metadata.defaultProjectId}`
          : metadata.jiraSiteUrl;
      }
    } else if (integration.provider === "ASANA") {
      const metadata = (integration.metadata ?? {}) as Partial<AsanaIntegrationMetadata>;
      if (metadata.defaultProjectGid) {
        defaultBoardUrl = `https://app.asana.com/0/${metadata.defaultProjectGid}`;
      } else {
        defaultBoardUrl = "https://app.asana.com";
      }
    }

    return {
      ...integration,
      metadata: integration.metadata as TsoaJsonObject | null,
      defaultBoardUrl,
      isWorkspaceLevel: integration.isWorkspaceLevel,
    };
  }

  private parseProvider(value: string): IntegrationProvider | null {
    const upperCased = value.toUpperCase();
    if (upperCased in IntegrationProvider) {
      return IntegrationProvider[upperCased as keyof typeof IntegrationProvider];
    }
    return null;
  }
}
