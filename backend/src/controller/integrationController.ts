import { Controller, Get, Path, Request, Route, Security, Tags } from "tsoa";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import type { ApiResponse } from "./controllerTypes";
import { integrationService } from "../services/integrationService";
import type { UserIntegrationSummary } from "../services/integrationService";
import { IntegrationProvider } from "@prisma/client";

@Route("api/integrations")
@Tags("Integrations")
export class IntegrationController extends Controller {
  @Get("")
  @Security("ClientLevel")
  public async listIntegrations(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<UserIntegrationSummary[]>> {
    const user = await this.getAuthorizedUser(request);
    const integrations = await integrationService.listIntegrationsForUser(user.id);

    return {
      status: 200,
      data: integrations,
    };
  }

  @Get("{provider}")
  @Security("ClientLevel")
  public async getIntegration(
    @Request() request: AuthenticatedRequest,
    @Path() provider: string,
  ): Promise<ApiResponse<UserIntegrationSummary | null>> {
    const user = await this.getAuthorizedUser(request);
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
      data: integration,
    };
  }

  private parseProvider(value: string): IntegrationProvider | null {
    const upperCased = value.toUpperCase();
    if (upperCased in IntegrationProvider) {
      return IntegrationProvider[upperCased as keyof typeof IntegrationProvider];
    }
    return null;
  }

  private async getAuthorizedUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(403);
      throw { status: 403, message: "User not registered" };
    }

    return user;
  }
}
