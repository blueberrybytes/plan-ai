import type {
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
  UserIntegration,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";

export interface UserIntegrationSummary {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountId: string | null;
  accountName: string | null;
  metadata: Prisma.JsonValue | null;
  scope: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hasRefreshToken: boolean;
}

class IntegrationService {
  public async listIntegrationsForUser(userId: string): Promise<UserIntegrationSummary[]> {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return integrations.map((integration) => this.toSummary(integration));
  }

  public async getIntegrationForUser(
    userId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegrationSummary | null> {
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!integration) {
      return null;
    }

    return this.toSummary(integration);
  }

  private toSummary(integration: UserIntegration): UserIntegrationSummary {
    return {
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      accountId: integration.accountId ?? null,
      accountName: integration.accountName ?? null,
      metadata: integration.metadata ?? null,
      scope: integration.scope ?? null,
      expiresAt: integration.expiresAt ?? null,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      hasRefreshToken: Boolean(integration.refreshToken),
    };
  }
}

export const integrationService = new IntegrationService();
