import { Get, Path, Request, Route, Security, Tags } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type ApiResponse, type TsoaJsonObject } from "./controllerTypes";
import { integrationService } from "../services/integrationService";
import type { UserIntegrationSummary } from "../services/integrationService";
import { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import type { TrelloIntegrationMetadata, JiraIntegrationMetadata } from "../services/integrationMetadataTypes";

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
}

@Route("api/integrations")
@Tags("Integrations")
export class IntegrationController extends BaseWorkspaceController {
  @Get("")
  @Security("ClientLevel")
  public async listIntegrations(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<IntegrationSummaryResponse[]>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    const integrations = await integrationService.listIntegrationsForUser(user.id);

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
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    const providerEnum = this.parseProvider(provider);

    if (!providerEnum) {
      this.setStatus(400);
      return {
        status: 400,
        data: null,
        message: "Unknown integration provider",
      };
    }

    const integration = await integrationService.getIntegrationForUser(user.id, providerEnum);

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

  private mapIntegrationResponse(integration: UserIntegrationSummary): IntegrationSummaryResponse {
    let defaultBoardUrl = null;

    if (integration.provider === "TRELLO") {
      const metadata = (integration.metadata ?? {}) as Partial<TrelloIntegrationMetadata>;
      if (metadata.defaultBoardId) {
        defaultBoardUrl = `https://trello.com/b/${metadata.defaultBoardId}`;
      }
    } else if (integration.provider === "LINEAR") {
      defaultBoardUrl = `https://linear.app`;
    } else if (integration.provider === "JIRA") {
      const metadata = (integration.metadata ?? {}) as Partial<JiraIntegrationMetadata>;
      if (metadata.jiraSiteUrl) {
        defaultBoardUrl = metadata.defaultProjectId 
          ? `${metadata.jiraSiteUrl}/browse/${metadata.defaultProjectId}`
          : metadata.jiraSiteUrl;
      }
    }

    return {
      ...integration,
      metadata: integration.metadata as TsoaJsonObject | null,
      defaultBoardUrl,
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
