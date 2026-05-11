import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import type { TrelloManualConnectRequest, TrelloSummaryResponse } from "./trelloTypes";
import type { TrelloIntegrationMetadata } from "./integrationMetadataTypes";

class TrelloIntegrationService {
  private async fetchTrello<T>(
    path: string,
    apiKey: string,
    token: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = new URL(`https://api.trello.com/1${path}`);
    url.searchParams.set("key", apiKey.trim());
    url.searchParams.set("token", token.trim());

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  public async verifyManualCredentials(userId: string, payload: TrelloManualConnectRequest) {
    const { apiKey, token } = payload;
    if (!apiKey || !token) {
      throw new Error("Missing Trello API Key or Token");
    }

    try {
      // Validate credentials by fetching the user's profile
      const viewer = await this.fetchTrello<{ id: string; fullName: string }>(
        "/members/me",
        apiKey,
        token,
      );

      if (!viewer || !viewer.id) {
        throw new Error("Invalid API Key or Token");
      }

      await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId,
            provider: IntegrationProvider.TRELLO,
          },
        },
        create: {
          userId,
          provider: IntegrationProvider.TRELLO,
          status: IntegrationStatus.CONNECTED,
          accessToken: `${apiKey}:${token}`, // Store them bound together to avoid adding a new column
          accountId: viewer.id,
          accountName: viewer.fullName,
          metadata: {
            authType: "API_KEY",
          } as TrelloIntegrationMetadata as unknown as Prisma.InputJsonObject,
        },
        update: {
          status: IntegrationStatus.CONNECTED,
          accessToken: `${apiKey}:${token}`,
          accountId: viewer.id,
          accountName: viewer.fullName,
          metadata: {
            authType: "API_KEY",
          } as TrelloIntegrationMetadata as unknown as Prisma.InputJsonObject,
        },
      });
      return { success: true };
    } catch (error) {
      logger.error("Trello basic auth verification failed", error);
      throw new Error(
        "Invalid format or unauthorized API Key/Token. Please verify your credentials.",
      );
    }
  }

  private getCredentials(accessToken: string): { apiKey: string; token: string } {
    const [apiKey, token] = accessToken.split(":");
    return { apiKey, token };
  }

  public async getTrelloSummary(userId: string): Promise<TrelloSummaryResponse> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Trello is not connected");
    }

    const { apiKey, token } = this.getCredentials(integration.accessToken);

    try {
      // Fetch user's boards
      const boards = await this.fetchTrello<Array<{ id: string; name: string }>>(
        `/members/me/boards?filter=open`,
        apiKey,
        token,
      );

      const totalBoards = boards.length;
      const latestBoards = boards.slice(0, 5).map((b) => b.name);

      return {
        totalBoards,
        latestBoards,
      };
    } catch (error) {
      logger.error("Failed to construct Trello summary", error);
      throw new Error("Failed to fetch Trello repository information");
    }
  }

  public async listTrelloBoards(userId: string): Promise<{ id: string; name: string }[]> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Trello is not connected");
    }
    const { apiKey, token } = this.getCredentials(integration.accessToken);
    const boards = await this.fetchTrello<Array<{ id: string; name: string }>>(
      "/members/me/boards?filter=open",
      apiKey,
      token,
    );
    return boards.map((b) => ({ id: b.id, name: b.name }));
  }

  public async listTrelloLists(
    userId: string,
    boardId: string,
  ): Promise<{ id: string; name: string }[]> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Trello is not connected");
    }
    const { apiKey, token } = this.getCredentials(integration.accessToken);
    const lists = await this.fetchTrello<Array<{ id: string; name: string }>>(
      `/boards/${boardId}/lists?filter=open`,
      apiKey,
      token,
    );
    return lists.map((l) => ({ id: l.id, name: l.name }));
  }

  public async setDefaultTrelloBoardAndList(
    userId: string,
    boardId: string,
    listId: string,
  ): Promise<void> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
    });
    if (!integration) throw new Error("Trello integration not found");

    const currentMeta = (integration.metadata ?? {}) as Record<string, unknown>;
    const newMetadata = {
      ...currentMeta,
      defaultBoardId: boardId,
      defaultListId: listId,
    } as unknown as Prisma.InputJsonObject;

    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
      data: { metadata: newMetadata },
    });
  }

  public async createTrelloCard(
    userId: string,
    taskId: string,
    boardId: string,
    listId: string,
  ): Promise<{ cardId: string; shortLink: string; url: string }> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.TRELLO } },
    });
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Trello is not connected");
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Task not found");

    const descLines = [];
    if (task.summary) descLines.push(`**Summary**\n${task.summary}\n`);
    if (task.description) descLines.push(`**Description**\n${task.description}\n`);
    if (task.acceptanceCriteria)
      descLines.push(`**Acceptance Criteria**\n${task.acceptanceCriteria}\n`);
    if (task.storyPoints)
      descLines.push(`\n**AI Story Points Estimate:** ⭐ ${task.storyPoints} Points\n`);
    if (task.dueDate)
      descLines.push(`\n**Due Date:** 🗓️ ${new Date(task.dueDate).toLocaleDateString()}\n`);
    descLines.push(`\n_Auto-generated by Plan AI_ `);

    const { apiKey, token } = this.getCredentials(integration.accessToken);

    const qsParams: Record<string, string> = {
      name: task.title,
      desc: descLines.join("\n"),
      idList: listId,
    };
    if (task.dueDate) {
      qsParams.due = new Date(task.dueDate).toISOString();
    }
    const qs = new URLSearchParams(qsParams);

    const card = await this.fetchTrello<{ id: string; shortLink: string; shortUrl: string }>(
      `/cards?${qs.toString()}`,
      apiKey,
      token,
      { method: "POST" },
    );

    return {
      cardId: card.id,
      shortLink: card.shortLink,
      url: card.shortUrl,
    };
  }
}

export const trelloIntegrationService = new TrelloIntegrationService();
