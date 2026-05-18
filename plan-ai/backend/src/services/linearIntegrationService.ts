
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { LinearClient } from "@linear/sdk";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";
import type { LinearSummaryResponse, LinearManualConnectRequest } from "./linearTypes";
import type { LinearIntegrationMetadata } from "./integrationMetadataTypes";
import type { TaskMetadata } from "./taskMetadataTypes";
import type { WorkspaceIntegration } from "@prisma/client";

interface LinearTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

class LinearIntegrationService {
  private getLinearClient(integration: WorkspaceIntegration): LinearClient {
    const metadata = integration.metadata as LinearIntegrationMetadata | null;
    if (metadata?.authType === "API_KEY") {
      return new LinearClient({ apiKey: integration.accessToken });
    }
    return new LinearClient({ accessToken: integration.accessToken });
  }
  public getAuthUrl(state: string): string {
    const clientId = EnvUtils.get("LINEAR_CLIENT_ID");
    const redirectUri = EnvUtils.get(
      "LINEAR_REDIRECT_URI",
      "http://localhost:8080/api/linear/callback",
    );
    if (!clientId) {
      throw new Error("LINEAR_CLIENT_ID is not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: state,
      scope: "read,write,issues:create",
      prompt: "consent",
    });

    return `https://linear.app/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCode(
    code: string,
  ): Promise<{ accessToken: string; accountId: string; accountName: string; refreshToken?: string; expiresIn?: number }> {
    const clientId = EnvUtils.get("LINEAR_CLIENT_ID");
    const clientSecret = EnvUtils.get("LINEAR_CLIENT_SECRET");
    const redirectUri = EnvUtils.get(
      "LINEAR_REDIRECT_URI",
      "http://localhost:8080/api/linear/callback",
    );

    if (!clientId || !clientSecret) {
      throw new Error("Linear OAuth credentials are not configured");
    }

    const params = new URLSearchParams();
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("grant_type", "authorization_code");

    const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error("Linear token exchange failed", errorText);
      throw new Error("Failed to exchange Linear authorization code");
    }

    const tokenData = await tokenResponse.json() as LinearTokenResponse;
    if (!tokenData.access_token) {
      throw new Error("No access token returned from Linear");
    }

    // Verify token by querying viewer
    const client = new LinearClient({ accessToken: tokenData.access_token });
    const viewer = await client.viewer;

    return {
      accessToken: tokenData.access_token,
      accountId: viewer.id,
      accountName: viewer.name,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    };
  }

  public async refreshTokenIfExpired(
    workspaceId: string,
    integration: WorkspaceIntegration,
  ): Promise<WorkspaceIntegration> {
    const meta = integration.metadata as unknown as LinearIntegrationMetadata;
    const isApiKey = meta?.authType === "API_KEY";
    if (isApiKey || !integration.refreshToken) {
      return integration;
    }

    const buffer = 5 * 60 * 1000;
    if (integration.expiresAt && integration.expiresAt.getTime() - buffer > Date.now()) {
      return integration;
    }

    try {
      const clientId = EnvUtils.get("LINEAR_CLIENT_ID");
      const clientSecret = EnvUtils.get("LINEAR_CLIENT_SECRET");

      if (!clientId || !clientSecret) {
        throw new Error("Linear OAuth credentials are not configured");
      }

      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("refresh_token", integration.refreshToken);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);

      const response = await fetch("https://api.linear.app/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const rawBody = await response.text();
      if (!response.ok) {
        logger.error("Failed to refresh Linear token", { status: response.status, body: rawBody });
        throw new Error("Failed to refresh Linear token");
      }

      const parsed = JSON.parse(rawBody) as LinearTokenResponse;

      let expiresAt: Date | null = null;
      if (parsed.expires_in) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + parsed.expires_in);
      }

      const updated = await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token ?? integration.refreshToken,
          expiresAt,
        },
      });

      return updated;
    } catch (error) {
      logger.error("Error refreshing Linear token", error);
      await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.DISCONNECTED },
      });
      throw new Error("Linear token expired and could not be refreshed. Please reconnect.");
    }
  }

  public async verifyManualCredentials(workspaceId: string, payload: LinearManualConnectRequest) {
    const { apiKey } = payload;
    if (!apiKey) {
      throw new Error("Missing Linear API Key");
    }

    try {
      const client = new LinearClient({ apiKey });
      const viewer = await client.viewer;
      const org = await viewer.organization;

      if (!viewer || !viewer.id) {
        throw new Error("Invalid API Key");
      }

      await prisma.workspaceIntegration.upsert({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider: IntegrationProvider.LINEAR,
          },
        },
        create: {
          workspaceId,
          provider: IntegrationProvider.LINEAR,
          status: IntegrationStatus.CONNECTED,
          accessToken: apiKey,
          accountId: viewer.id,
          accountName: viewer.name,
          metadata: {
            authType: "API_KEY",
            organizationUrlKey: org.urlKey,
          } as LinearIntegrationMetadata as unknown as Prisma.InputJsonObject,
        },
        update: {
          status: IntegrationStatus.CONNECTED,
          accessToken: apiKey,
          accountId: viewer.id,
          accountName: viewer.name,
          metadata: {
            authType: "API_KEY",
            organizationUrlKey: org.urlKey,
          } as LinearIntegrationMetadata as unknown as Prisma.InputJsonObject,
        },
      });
      return { success: true };
    } catch (error) {
      logger.error("Linear basic auth verification failed", error);
      throw new Error("Invalid format or unauthorized API Key. Please verify your token.");
    }
  }

  public async getLinearSummary(workspaceId: string): Promise<LinearSummaryResponse> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.LINEAR,
        },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear is not connected");
    }

    integration = await this.refreshTokenIfExpired(workspaceId, integration);
    const client = this.getLinearClient(integration);

    try {
      const [issuesRes, projectsRes, teamsRes] = await Promise.all([
        client.issues({ filter: { assignee: { id: { eq: integration.accountId || "" } } } }),
        client.projects(),
        client.teams({ first: 5 }),
      ]);

      const totalIssues = issuesRes.nodes.length;
      const totalProjects = projectsRes.nodes.length;
      const latestTeams = teamsRes.nodes.map((t) => t.name);

      return {
        totalIssues,
        totalProjects,
        latestTeams,
      };
    } catch (error) {
      logger.error("Failed to construct Linear summary - Full error object:", error, {
        workspaceId,
        accountId: integration.accountId,
        hasAccessToken: !!integration.accessToken,
      });
      throw new Error("Failed to fetch Linear repository information");
    }
  }

  public async listLinearTeams(workspaceId: string): Promise<{ id: string; name: string }[]> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear is not connected");
    }
    integration = await this.refreshTokenIfExpired(workspaceId, integration);
    const client = this.getLinearClient(integration);
    const teamsRes = await client.teams();
    return teamsRes.nodes.map((t) => ({ id: t.id, name: t.name }));
  }

  public async setDefaultLinearTeam(workspaceId: string, teamId: string): Promise<void> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
    });
    if (!integration) throw new Error("Linear integration not found");

    integration = await this.refreshTokenIfExpired(workspaceId, integration);
    const client = this.getLinearClient(integration);
    const team = await client.team(teamId);

    const currentMeta = (integration.metadata ?? {}) as unknown as LinearIntegrationMetadata;
    const newMetadata: LinearIntegrationMetadata = {
      ...currentMeta,
      defaultTeamId: teamId,
      teamKey: team.key,
    };
    console.log(
      `[linearIntegrationService] Updating metadata for workspace ${workspaceId} to:`,
      JSON.stringify(newMetadata),
    );

    await prisma.workspaceIntegration.update({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
      data: { metadata: newMetadata as unknown as Prisma.InputJsonObject },
    });
    console.log(`[linearIntegrationService] update complete for workspace ${workspaceId}`);
  }

  public async ensurePlanAiLabel(workspaceId: string): Promise<string | undefined> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) return undefined;

    integration = await this.refreshTokenIfExpired(workspaceId, integration);
    const client = this.getLinearClient(integration);
    try {
      const labelsRes = await client.issueLabels({ filter: { name: { eq: "Plan AI" } } });
      let label = labelsRes.nodes.find((l) => l.name === "Plan AI");
      if (!label) {
        const payload = await client.createIssueLabel({
          name: "Plan AI",
          color: "#5E6AD2",
        });
        label = await payload.issueLabel;
      }
      if (label?.id) {
        const currentMeta = (integration.metadata ?? {}) as unknown as LinearIntegrationMetadata;
        const newMetadata: LinearIntegrationMetadata = {
          ...currentMeta,
          planAiLabelId: label.id,
        };
        await prisma.workspaceIntegration.update({
          where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
          data: { metadata: newMetadata as unknown as Prisma.InputJsonObject },
        });
      }
      return label?.id;
    } catch (e) {
      logger.error("Failed to ensure Plan AI label", e);
      return undefined;
    }
  }

  public async createLinearIssue(
    workspaceId: string,
    taskId: string,
    teamId: string,
  ): Promise<{ issueId: string; identifier: string; url: string }> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear integration not found or unauthorized");
    }

    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new Error("Local task not found");
    }

    const client = this.getLinearClient(integration);

    let description = `🤖 **Plan AI Auto-Task** | 📁 **Project:** ${task.project.title}\n---\n\n`;
    if (task.summary) {
      description += `${task.summary}\n\n`;
    }
    if (task.acceptanceCriteria) {
      description += `### Acceptance Criteria\n${task.acceptanceCriteria}\n\n`;
    }
    if (task.dueDate) {
      description += `### Due Date\n🗓️ ${new Date(task.dueDate).toLocaleDateString()}\n\n`;
    }

    let linearParentId: string | undefined = undefined;
    if (task.parentId) {
      const parentTask = await prisma.task.findUnique({ where: { id: task.parentId } });
      const parentMeta = parentTask?.metadata as unknown as TaskMetadata | null;
      if (parentMeta?.linear?.issueId) {
        linearParentId = parentMeta.linear.issueId;
      }
    }

    const currentMeta = (integration.metadata ?? {}) as unknown as LinearIntegrationMetadata;
    const labelIds: string[] = [];
    if (currentMeta.planAiLabelId) {
      labelIds.push(currentMeta.planAiLabelId);
    }

    const prefix = `[📁 ${task.project.title}] `;
    const issuePayload = await client.createIssue({
      teamId,
      title: `${prefix}${task.title || `Extracted Task ${task.id}`}`,
      description,
      estimate: task.storyPoints ?? undefined,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : undefined,
      parentId: linearParentId,
      labelIds: labelIds.length > 0 ? labelIds : undefined,
    });

    const issue = await issuePayload.issue;
    if (!issue) {
      throw new Error("Failed to create Linear issue natively");
    }

    return {
      issueId: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    };
  }
}

export const linearIntegrationService = new LinearIntegrationService();
