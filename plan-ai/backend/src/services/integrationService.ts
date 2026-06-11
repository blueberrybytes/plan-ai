import type {
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
  UserIntegration,
  WorkspaceIntegration,
} from "@prisma/client";
import prisma from "../prisma/prismaClient";

/**
 * Providers managed at the Workspace level (ticketing tools).
 * OWNER/ADMIN connects once, all members can use them.
 */
const WORKSPACE_PROVIDERS: Set<string> = new Set(["JIRA", "LINEAR", "TRELLO", "ASANA"]);

/**
 * Providers managed at the User level (personal tokens).
 * Each user connects their own account.
 */
// const USER_PROVIDERS: Set<string> = new Set(["GITHUB", "GOOGLE_DRIVE"]);

export interface IntegrationSummary {
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
  /** Whether this integration is workspace-level (true) or user-level (false) */
  isWorkspaceLevel: boolean;
}

// Keep backward-compatible export alias
export type UserIntegrationSummary = IntegrationSummary;

class IntegrationService {
  /**
   * Returns a unified list of all integrations visible to a user in a workspace.
   * - Workspace-level: Jira, Linear, Trello (shared by all members)
   * - User-level: GitHub, Google Drive (personal)
   */
  public async listIntegrationsForContext(
    workspaceId: string,
    userId: string,
  ): Promise<IntegrationSummary[]> {
    const workspaceIntegrations = await prisma.workspaceIntegration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    const userIntegrations = await prisma.userIntegration.findMany({
      where: {
        userId,
        provider: { in: ["GITHUB", "GOOGLE_DRIVE"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return [
      ...workspaceIntegrations.map((i) => this.toSummaryFromWorkspace(i)),
      ...userIntegrations.map((i) => this.toSummaryFromUser(i)),
    ];
  }

  /**
   * @deprecated Use listIntegrationsForContext instead
   */
  public async listIntegrationsForUser(userId: string): Promise<IntegrationSummary[]> {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return integrations.map((integration) => this.toSummaryFromUser(integration));
  }

  /**
   * Gets a specific integration, checking workspace-level first for ticketing,
   * then user-level for personal integrations.
   */
  public async getIntegrationForContext(
    workspaceId: string,
    userId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationSummary | null> {
    if (WORKSPACE_PROVIDERS.has(provider)) {
      const integration = await prisma.workspaceIntegration.findUnique({
        where: {
          workspaceId_provider: { workspaceId, provider },
        },
      });
      return integration ? this.toSummaryFromWorkspace(integration) : null;
    }

    // User-level (GitHub, Google Drive)
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: { userId, provider },
      },
    });
    return integration ? this.toSummaryFromUser(integration) : null;
  }

  /**
   * @deprecated Use getIntegrationForContext instead
   */
  public async getIntegrationForUser(
    userId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationSummary | null> {
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

    return this.toSummaryFromUser(integration);
  }

  /**
   * Deletes an integration. Routes to workspace or user table based on provider.
   */
  public async deleteIntegrationForContext(
    workspaceId: string,
    userId: string,
    provider: IntegrationProvider,
  ): Promise<boolean> {
    if (WORKSPACE_PROVIDERS.has(provider)) {
      const deleted = await prisma.workspaceIntegration.deleteMany({
        where: { workspaceId, provider },
      });
      return deleted.count > 0;
    }

    // User-level
    const deleted = await prisma.userIntegration.deleteMany({
      where: { userId, provider },
    });
    return deleted.count > 0;
  }

  /**
   * @deprecated Use deleteIntegrationForContext instead
   */
  public async deleteIntegrationForUser(
    userId: string,
    provider: IntegrationProvider,
  ): Promise<boolean> {
    const deleted = await prisma.userIntegration.deleteMany({
      where: {
        userId,
        provider,
      },
    });
    return deleted.count > 0;
  }

  /**
   * Check if a provider is workspace-level
   */
  public isWorkspaceProvider(provider: IntegrationProvider): boolean {
    return WORKSPACE_PROVIDERS.has(provider);
  }

  private toSummaryFromWorkspace(integration: WorkspaceIntegration): IntegrationSummary {
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
      isWorkspaceLevel: true,
    };
  }

  private toSummaryFromUser(integration: UserIntegration): IntegrationSummary {
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
      isWorkspaceLevel: false,
    };
  }
}

export const integrationService = new IntegrationService();
