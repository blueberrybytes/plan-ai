/* eslint-disable @typescript-eslint/no-explicit-any */
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { LinearClient } from "@linear/sdk";
import { logger } from "../utils/logger";
import type { LinearSummaryResponse, LinearManualConnectRequest } from "./linearTypes";
import type { LinearIntegrationMetadata } from "./integrationMetadataTypes";

class LinearIntegrationService {
  public async verifyManualCredentials(userId: string, payload: LinearManualConnectRequest) {
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

      await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId,
            provider: IntegrationProvider.LINEAR,
          },
        },
        create: {
          userId,
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

  public async getLinearSummary(userId: string): Promise<LinearSummaryResponse> {
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: IntegrationProvider.LINEAR,
        },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear is not connected");
    }

    const client = new LinearClient({ apiKey: integration.accessToken });

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
      logger.error("Failed to construct Linear summary", error);
      throw new Error("Failed to fetch Linear repository information");
    }
  }

  public async listLinearTeams(userId: string): Promise<{ id: string; name: string }[]> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.LINEAR } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear is not connected");
    }
    const client = new LinearClient({ apiKey: integration.accessToken });
    const teamsRes = await client.teams();
    return teamsRes.nodes.map((t) => ({ id: t.id, name: t.name }));
  }

  public async setDefaultLinearTeam(userId: string, teamId: string): Promise<void> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.LINEAR } },
    });
    if (!integration) throw new Error("Linear integration not found");

    const client = new LinearClient({ apiKey: integration.accessToken });
    const team = await client.team(teamId);

    const currentMeta = (integration.metadata ?? {}) as Record<string, unknown>;
    const newMetadata = {
      ...currentMeta,
      defaultTeamId: teamId,
      teamKey: team.key,
    } as unknown as Prisma.InputJsonObject;
    console.log(
      `[linearIntegrationService] Updating metadata for ${userId} to:`,
      JSON.stringify(newMetadata),
    );

    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider: IntegrationProvider.LINEAR } },
      data: { metadata: newMetadata },
    });
    console.log(`[linearIntegrationService] update complete for ${userId}`);
  }

  public async createLinearIssue(
    userId: string,
    taskId: string,
    teamId: string,
  ): Promise<{ issueId: string; identifier: string; url: string }> {
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: { userId, provider: IntegrationProvider.LINEAR },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Linear integration not found or unauthorized");
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Local task not found");
    }

    const client = new LinearClient({ apiKey: integration.accessToken });

    let description = "Generated via Blueberry Plan AI\n\n";
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
      const parentMeta = parentTask?.metadata as Record<string, any>;
      if (
        parentMeta &&
        parentMeta.linear &&
        (parentMeta.linear as Record<string, unknown>).issueId
      ) {
        linearParentId = (parentMeta.linear as Record<string, unknown>).issueId as string;
      }
    }

    const issuePayload = await client.createIssue({
      teamId,
      title: task.title || `Extracted Task ${task.id}`,
      description,
      estimate: task.storyPoints ?? undefined,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : undefined,
      parentId: linearParentId,
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
