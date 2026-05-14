import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import EnvUtils from "../utils/EnvUtils";
import { NotionIntegrationMetadata } from "./integrationMetadataTypes";
import { Client as NotionClient } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { logger } from "../utils/logger";

export interface NotionSummaryResponse {
  totalPages: number;
  recentPages: string[];
}

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const DEFAULT_CALLBACK_PATH = "/api/notion/callback";
const DEFAULT_FRONTEND_REDIRECT_PATH = "/integrations?provider=notion";

class NotionIntegrationService {
  private readonly clientId = EnvUtils.get("NOTION_CLIENT_ID");
  private readonly clientSecret = EnvUtils.get("NOTION_CLIENT_SECRET");
  private readonly frontendUrl = EnvUtils.get("FRONTEND_URL");
  private readonly callbackPath = process.env.NOTION_CALLBACK_PATH ?? DEFAULT_CALLBACK_PATH;
  private readonly frontendRedirectPath =
    process.env.NOTION_FRONTEND_REDIRECT_PATH ?? DEFAULT_FRONTEND_REDIRECT_PATH;

  public buildAuthorizationUrl(redirectUri: string, state?: string) {
    const url = new URL(NOTION_AUTH_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("owner", "user");
    url.searchParams.set("redirect_uri", redirectUri);
    if (state) {
      url.searchParams.set("state", state);
    }
    return url.toString();
  }

  public buildRedirectUri(baseUrl: string) {
    if (process.env.NOTION_REDIRECT_URI) {
      return process.env.NOTION_REDIRECT_URI;
    }
    return new URL(this.callbackPath, this.ensureTrailingSlash(baseUrl)).toString();
  }

  public buildFrontendRedirectUrl(result: "success" | "error", message?: string, state?: string) {
    const redirectUrl = new URL(
      this.frontendRedirectPath,
      this.ensureTrailingSlash(this.frontendUrl),
    );
    redirectUrl.searchParams.set("status", result);
    if (message) {
      redirectUrl.searchParams.set("message", message);
    }
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }
    return redirectUrl.toString();
  }

  private ensureTrailingSlash(url: string) {
    return url.endsWith("/") ? url : `${url}/`;
  }

  public async exchangeCodeForToken(code: string, redirectUri: string) {
    const encodedCredentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      "base64",
    );

    const response = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedCredentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Notion code exchange failed", {
        status: response.status,
        body: errorText,
      });
      throw new Error("Failed to exchange code with Notion");
    }

    const data = await response.json();
    return {
      accessToken: data.access_token as string,
      workspaceId: data.workspace_id as string,
      workspaceName: data.workspace_name as string,
      botId: data.bot_id as string,
    };
  }

  public async handleOAuthCallback(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<void> {
    const { accessToken, workspaceName, botId } = await this.exchangeCodeForToken(
      code,
      redirectUri,
    );

    const metadata: NotionIntegrationMetadata = {
      authType: "OAUTH",
      connectedAt: new Date().toISOString(),
    };

    await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.NOTION,
        },
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.NOTION,
        status: IntegrationStatus.CONNECTED,
        accessToken,
        accountId: botId,
        accountName: workspaceName,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken,
        accountId: botId,
        accountName: workspaceName,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
    });
  }

  public async getNotionSummary(workspaceId: string): Promise<NotionSummaryResponse> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Notion is not connected");
    }

    const notion = new NotionClient({ auth: integration.accessToken });

    try {
      const response = await notion.search({
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 5,
      });

      const pages = response.results;
      const totalPages = pages.length;

      const recentPages = pages.map((page) => {
        if ("properties" in page && page.properties) {
          // Try to extract a title from the first title property found
          for (const prop of Object.values(page.properties)) {
            if (prop.type === "title" && "title" in prop && Array.isArray(prop.title)) {
              const text = prop.title[0]?.plain_text;
              if (text) return text;
            }
          }
        }
        return "Untitled Page";
      });

      return {
        totalPages,
        recentPages,
      };
    } catch (error) {
      logger.error("Failed to fetch Notion summary", { error });
      throw new Error("Failed to fetch Notion summary");
    }
  }

  public async getDatabases(workspaceId: string) {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Notion is not connected");
    }

    const notion = new NotionClient({ auth: integration.accessToken });
    const response = await notion.search({
      filter: { property: "object", value: "data_source" },
    });

    const databases = response.results;
    return databases.map((db) => {
      let name = "Untitled Database";
      if ("title" in db && Array.isArray(db.title)) {
        name = db.title[0]?.plain_text || "Untitled Database";
      }

      return {
        id: db.id,
        name,
        url: "url" in db && typeof db.url === "string" ? db.url : "",
      };
    });
  }

  public async setDefaultDatabase(workspaceId: string, databaseId: string): Promise<void> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
    });

    if (!integration) {
      throw new Error("Notion integration not found");
    }

    const meta = integration.metadata as Record<string, unknown> | null;
    await prisma.workspaceIntegration.update({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
      data: {
        metadata: {
          ...meta,
          defaultDatabaseId: databaseId,
        },
      },
    });
  }

  /**
   * Creates a standalone Notion page for a task.
   * No database required — the page is created directly in the user's workspace.
   * If a databaseId is provided and accessible, it will be used as the parent.
   */
  public async createNotionPage(
    workspaceId: string,
    taskId: string,
    databaseId?: string,
  ): Promise<{ pageId: string; url: string }> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Notion is not connected");
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignee: true, project: true },
    });

    if (!task || task.project.workspaceId !== workspaceId) {
      throw new Error("Task not found");
    }

    const notion = new NotionClient({ auth: integration.accessToken });

    // Build rich page body with task details
    const children: Parameters<typeof notion.pages.create>[0]["children"] = [];

    // Description block
    if (task.description) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: task.description },
            },
          ],
        },
      });
    }

    // Divider
    children.push({
      object: "block",
      type: "divider",
      divider: {},
    });

    // Metadata block
    const metaLines = [
      `Priority: ${task.priority || "N/A"}`,
      `Status: ${task.status || "N/A"}`,
      `Project: ${task.project.title || "N/A"}`,
    ];
    if (task.acceptanceCriteria) {
      metaLines.push(`\nAcceptance Criteria:\n${task.acceptanceCriteria}`);
    }

    children.push({
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "📋" },
        rich_text: [
          {
            type: "text",
            text: { content: metaLines.join("\n") },
          },
        ],
      },
    });

    // Try database-backed page first if databaseId is provided
    if (databaseId) {
      try {
        const response = await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: task.title,
                  },
                },
              ],
            },
          },
          children,
        });

        return {
          pageId: response.id,
          url: (response as PageObjectResponse).url,
        };
      } catch (dbError) {
        logger.warn("Failed to create Notion page in database, falling back to standalone page", {
          databaseId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
        // Fall through to standalone page creation
      }
    }

    // Create standalone page (no database required)
    try {
      // Search for a page the integration has access to, to use as parent
      const searchResult = await notion.search({
        filter: { property: "object", value: "page" },
        page_size: 1,
      });

      let parent: { page_id: string } | { workspace: true };

      if (searchResult.results.length > 0) {
        parent = { page_id: searchResult.results[0].id };
      } else {
        // Last resort: create in workspace root (requires workspace-level access)
        parent = { workspace: true };
      }

      const response = await notion.pages.create({
        parent,
        properties: {
          title: {
            title: [
              {
                text: {
                  content: `[Plan AI] ${task.title}`,
                },
              },
            ],
          },
        },
        children,
      } as Parameters<typeof notion.pages.create>[0]);

      return {
        pageId: response.id,
        url: (response as PageObjectResponse).url,
      };
    } catch (error) {
      logger.error("Failed to create standalone Notion page", {
        error,
        taskId,
      });
      throw error;
    }
  }
}

export const notionIntegrationService = new NotionIntegrationService();
