import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import type { WorkspaceIntegration } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import type { JiraMyselfResponse, JiraSearchResponse, JiraBoardResponse } from "./jiraTypes";
import type { JiraIntegrationMetadata } from "./integrationMetadataTypes";
import type { TaskMetadata } from "./taskMetadataTypes";

type JiraTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type AuthorizationStatePayload = {
  workspaceId: string;
  nonce: string;
  issuedAt: number;
  clientState?: string | null;
};

type AuthorizationStateInput = {
  workspaceId: string;
  nonce?: string;
  issuedAt?: number;
  clientState?: string | null;
};

type JiraAccessibleResource = {
  id: string;
  name: string;
  url?: string;
  scopes?: string[];
  avatarUrl?: string;
};

type AuthorizeUrlParams = {
  redirectUri: string;
  state?: string;
};

type FrontendRedirectParams = {
  result: "success" | "error";
  message?: string;
  state?: string;
};

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_AUDIENCE = "api.atlassian.com";
const DEFAULT_CALLBACK_PATH = "/api/jira/callback";
const DEFAULT_FRONTEND_REDIRECT_PATH = "/integrations?provider=jira";

type JiraIssueType = {
  id: string;
  name: string;
  subtask: boolean;
};

// In-memory cache of available Jira issue types per (workspace, project).
// 5-minute TTL — Jira issue-type configuration rarely changes, but a short
// TTL keeps us responsive to admin changes without restarting.
const ISSUE_TYPE_CACHE_TTL_MS = 5 * 60 * 1000;
const jiraIssueTypeCache = new Map<string, { types: JiraIssueType[]; expiresAt: number }>();

class JiraIntegrationService {
  private readonly clientId = EnvUtils.get("JIRA_CLIENT_ID");

  private readonly clientSecret = EnvUtils.get("JIRA_CLIENT_SECRET");

  private readonly frontendUrl = EnvUtils.get("FRONTEND_URL");

  private readonly callbackPath = process.env.JIRA_CALLBACK_PATH ?? DEFAULT_CALLBACK_PATH;

  private readonly frontendRedirectPath =
    process.env.JIRA_FRONTEND_REDIRECT_PATH ?? DEFAULT_FRONTEND_REDIRECT_PATH;

  private readonly scope = this.buildScopeString([
    "read:jira-work",
    "write:jira-work",
    "read:board-scope:jira-software",
    process.env.JIRA_INCLUDE_USER_SCOPE === "true" ? "read:jira-user" : null,
    "offline_access",
  ]);

  private readonly stateHmacSecret = EnvUtils.get("JIRA_STATE_SECRET", this.clientSecret);

  public buildAuthorizationUrl({ redirectUri, state }: AuthorizeUrlParams) {
    const url = new URL(ATLASSIAN_AUTH_URL);
    url.searchParams.set("audience", ATLASSIAN_AUDIENCE);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("scope", this.scope);
    url.searchParams.set("redirect_uri", redirectUri);
    if (state) {
      url.searchParams.set("state", state);
    }
    url.searchParams.set("response_type", "code");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  public buildRedirectUri(baseUrl: string) {
    if (process.env.JIRA_REDIRECT_URI) {
      return process.env.JIRA_REDIRECT_URI;
    }
    return new URL(this.callbackPath, this.ensureTrailingSlash(baseUrl)).toString();
  }

  public buildFrontendRedirectUrl({ result, message, state }: FrontendRedirectParams) {
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

  public async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<JiraTokenResponse> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      logger.error("Failed to exchange Jira code", {
        status: response.status,
        body: rawBody,
      });
      throw new Error("Failed to exchange Jira code");
    }

    const parsed = JSON.parse(rawBody) as unknown;

    if (!this.isTokenResponse(parsed)) {
      logger.error("Unexpected Jira token response shape", { rawBody });
      throw new Error("Failed to complete Jira authorization");
    }

    return parsed;
  }

  public async refreshTokenIfExpired(
    workspaceId: string,
    integration: WorkspaceIntegration,
  ): Promise<WorkspaceIntegration> {
    const meta = integration.metadata as unknown as JiraIntegrationMetadata;
    const isBasic = meta?.authType === "BASIC";
    if (isBasic || !integration.refreshToken) {
      return integration; // Basic auth doesn't expire, and we need a refresh token for OAuth
    }

    // Check if token is within 5 minutes of expiring
    const buffer = 5 * 60 * 1000;
    if (integration.expiresAt && integration.expiresAt.getTime() - buffer > Date.now()) {
      return integration;
    }

    try {
      const response = await fetch(ATLASSIAN_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: integration.refreshToken,
        }),
      });

      const rawBody = await response.text();
      if (!response.ok) {
        logger.error("Failed to refresh Jira token", { status: response.status, body: rawBody });
        throw new Error("Failed to refresh Jira token");
      }

      const parsed = JSON.parse(rawBody) as unknown;
      if (!this.isTokenResponse(parsed)) {
        throw new Error("Unexpected token response shape");
      }

      const expiresAt = this.computeExpiry(parsed.expires_in);

      const updated = await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token, // Atlassian may issue a new refresh token
          expiresAt,
        },
      });

      return updated;
    } catch (error) {
      logger.error("Error refreshing Jira token", error);
      await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ERROR },
      });
      throw new Error("Jira token expired and could not be refreshed. Please reconnect Jira.");
    }
  }

  public async listAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
    const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      logger.error("Failed to list Jira accessible resources", {
        status: response.status,
        body: bodyText,
      });
      throw new Error("Failed to determine Jira site details");
    }

    const parsed = JSON.parse(bodyText) as unknown;
    if (!Array.isArray(parsed)) {
      logger.error("Unexpected Jira accessible resources payload", {
        bodyText,
      });
      throw new Error("Failed to determine Jira site details");
    }

    const resources = parsed.filter((item) =>
      this.isAccessibleResource(item),
    ) as JiraAccessibleResource[];

    if (resources.length === 0) {
      throw new Error("No Jira cloud sites available for this account");
    }

    return resources;
  }

  public async upsertIntegration(params: {
    workspaceId: string;
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    scope?: string;
    resource: JiraAccessibleResource;
  }): Promise<WorkspaceIntegration> {
    const expiresAt = this.computeExpiry(params.expiresInSeconds);
    const metadata: JiraIntegrationMetadata = {
      authType: "OAUTH",
      jiraSiteId: params.resource.id,
      jiraSiteUrl: params.resource.url ?? null,
      scopes: params.resource.scopes ?? [],
      connectedAt: new Date().toISOString(),
    };

    const integration = await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: params.workspaceId,
          provider: IntegrationProvider.JIRA,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken ?? null,
        expiresAt,
        scope: params.scope ?? null,
        accountId: params.resource.id,
        accountName: params.resource.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
      create: {
        workspaceId: params.workspaceId,
        provider: IntegrationProvider.JIRA,
        status: IntegrationStatus.CONNECTED,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken ?? null,
        expiresAt,
        scope: params.scope ?? null,
        accountId: params.resource.id,
        accountName: params.resource.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
    });

    return integration;
  }

  public async verifyManualCredentials(
    workspaceId: string,
    siteUrl: string,
    email: string,
    apiToken: string,
  ): Promise<WorkspaceIntegration> {
    const cleanUrl = siteUrl.trim().replace(/\/$/, "");
    const basicAuth = Buffer.from(`${email.trim()}:${apiToken.trim()}`).toString("base64");

    const response = await fetch(`${cleanUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      logger.error("Failed to verify manual Jira credentials", {
        status: response.status,
        bodyText,
      });
      throw new Error("Invalid Jira credentials or site URL");
    }

    const userData = JSON.parse(bodyText) as JiraMyselfResponse;
    const accountId = userData.accountId || email;
    const accountName = userData.displayName || email;

    const integration = await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.JIRA,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: basicAuth,
        refreshToken: null,
        expiresAt: null,
        scope: "read:jira-work write:jira-work",
        accountId: accountId,
        accountName: accountName,
        metadata: {
          jiraSiteId: accountId,
          jiraSiteUrl: cleanUrl,
          email: email.trim(),
          authType: "BASIC",
          connectedAt: new Date().toISOString(),
        } as JiraIntegrationMetadata as unknown as Prisma.InputJsonObject,
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.JIRA,
        status: IntegrationStatus.CONNECTED,
        accessToken: basicAuth,
        refreshToken: null,
        expiresAt: null,
        scope: "read:jira-work write:jira-work",
        accountId: accountId,
        accountName: accountName,
        metadata: {
          jiraSiteId: accountId,
          jiraSiteUrl: cleanUrl,
          email: email.trim(),
          authType: "BASIC",
          connectedAt: new Date().toISOString(),
        } as JiraIntegrationMetadata as unknown as Prisma.InputJsonObject,
      },
    });

    return integration;
  }

  public async getJiraSummary(
    workspaceId: string,
  ): Promise<{ totalIssues: string | null; totalProjects: number | null; latestBoards: string[] }> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Jira is not connected");
    }

    // Attempt to refresh token if expired
    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const meta = integration.metadata as unknown as JiraIntegrationMetadata;
    const isBasic = meta?.authType === "BASIC";

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: isBasic
        ? `Basic ${integration.accessToken}`
        : `Bearer ${integration.accessToken}`,
    };

    const siteUrl = isBasic
      ? meta?.jiraSiteUrl
      : `https://api.atlassian.com/ex/jira/${integration.accountId}`;

    if (!siteUrl) {
      throw new Error("Jira site URL is unavailable");
    }

    const cleanUrl = siteUrl.replace(/\/$/, "");

    let totalIssues: string | null = null;
    let totalProjects: number | null = null;
    let latestBoards: string[] = [];

    const [searchRes, projectRes, boardRes] = await Promise.allSettled([
      fetch(`${cleanUrl}/rest/api/3/search/jql?jql=assignee=currentUser()&maxResults=50`, {
        headers,
      }),
      fetch(`${cleanUrl}/rest/api/3/project`, { headers }),
      fetch(`${cleanUrl}/rest/agile/1.0/board?maxResults=5`, { headers }),
    ]);

    if (searchRes.status === "fulfilled") {
      if (searchRes.value.ok) {
        try {
          const textBody = await searchRes.value.text();
          const data = JSON.parse(textBody) as JiraSearchResponse;
          const count = data.issues?.length || 0;
          if (data.isLast === false) {
            totalIssues = `${count}+`;
          } else {
            totalIssues = count.toString();
          }
        } catch (e) {
          logger.error("Failed to parse Jira search response", e);
        }
      } else {
        const errorText = await searchRes.value.text();
        logger.error("Jira search endpoint failed", {
          status: searchRes.value.status,
          body: errorText,
          url: `${cleanUrl}/rest/api/3/search/jql?jql=assignee=currentUser()&maxResults=50`,
        });
      }
    } else {
      logger.error("Jira search network request rejected", { error: searchRes.reason });
    }

    if (projectRes.status === "fulfilled") {
      if (projectRes.value.ok) {
        try {
          const data = (await projectRes.value.json()) as Array<unknown>;
          totalProjects = Array.isArray(data) ? data.length : null;
        } catch (e) {
          logger.error("Failed to parse Jira project response", e);
        }
      } else {
        const errorText = await projectRes.value.text();
        logger.error("Jira project endpoint failed", {
          status: projectRes.value.status,
          body: errorText,
        });
      }
    }

    if (boardRes.status === "fulfilled") {
      if (boardRes.value.ok) {
        try {
          const data = (await boardRes.value.json()) as JiraBoardResponse;
          if (data.values && Array.isArray(data.values)) {
            latestBoards = data.values.map((b) => b.name);
          }
        } catch (e) {
          logger.error("Failed to parse Jira board response", e);
        }
      } else {
        const errorText = await boardRes.value.text();
        if (boardRes.value.status === 401 || boardRes.value.status === 403) {
          logger.warn("Jira board endpoint failed (likely missing read:board-scope:jira-software scope)", {
            status: boardRes.value.status,
            body: errorText,
          });
        } else {
          logger.error("Jira board endpoint failed", {
            status: boardRes.value.status,
            body: errorText,
          });
        }
      }
    }

    return { totalIssues, totalProjects, latestBoards };
  }

  public async listJiraProjects(
    workspaceId: string,
  ): Promise<{ id: string; name: string; key: string }[]> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Jira is not connected");
    }

    // Attempt to refresh token if expired
    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const meta = integration.metadata as unknown as JiraIntegrationMetadata;
    const isBasic = meta?.authType === "BASIC";
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: isBasic
        ? `Basic ${integration.accessToken}`
        : `Bearer ${integration.accessToken}`,
    };

    const siteUrl = isBasic
      ? meta?.jiraSiteUrl
      : `https://api.atlassian.com/ex/jira/${integration.accountId}`;
    if (!siteUrl) throw new Error("Jira site URL is unavailable");

    const response = await fetch(`${siteUrl.replace(/\/$/, "")}/rest/api/3/project`, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[jiraIntegrationService] listJiraProjects failed:",
        response.status,
        errorText,
      );
      throw new Error(
        `Failed to fetch Jira projects: ${response.status} ${errorText.substring(0, 100)}`,
      );
    }

    const data = (await response.json()) as { id: string; name: string; key: string }[];
    return data.map((p) => ({ id: p.id, name: p.name, key: p.key }));
  }

  public async setDefaultJiraProject(workspaceId: string, projectId: string): Promise<void> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA } },
    });
    if (!integration) throw new Error("Jira integration not found");

    const currentMeta = (integration.metadata ?? {}) as unknown as JiraIntegrationMetadata;
    const newMetadata: JiraIntegrationMetadata = {
      ...currentMeta,
      defaultProjectId: projectId,
    };
    console.log(
      `[jiraIntegrationService] Updating metadata for workspace ${workspaceId} to:`,
      JSON.stringify(newMetadata),
    );

    await prisma.workspaceIntegration.update({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA } },
      data: { metadata: newMetadata as unknown as Prisma.InputJsonObject },
    });
    console.log(`[jiraIntegrationService] update complete for workspace ${workspaceId}`);
  }

  private async fetchProjectIssueTypes(
    workspaceId: string,
    projectId: string,
    cleanUrl: string,
    headers: Record<string, string>,
  ): Promise<JiraIssueType[]> {
    const cacheKey = `${workspaceId}:${projectId}`;
    const cached = jiraIssueTypeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.types;
    }

    const url = `${cleanUrl}/rest/api/3/issuetype/project?projectId=${encodeURIComponent(projectId)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      logger.warn("Failed to fetch Jira issue types — caching empty list", {
        status: response.status,
        projectId,
      });
      const empty: JiraIssueType[] = [];
      jiraIssueTypeCache.set(cacheKey, {
        types: empty,
        expiresAt: Date.now() + ISSUE_TYPE_CACHE_TTL_MS,
      });
      return empty;
    }

    const raw = (await response.json()) as Array<{
      id: string;
      name: string;
      subtask?: boolean;
    }>;
    const types: JiraIssueType[] = raw.map((it) => ({
      id: it.id,
      name: it.name,
      subtask: Boolean(it.subtask),
    }));
    jiraIssueTypeCache.set(cacheKey, {
      types,
      expiresAt: Date.now() + ISSUE_TYPE_CACHE_TTL_MS,
    });
    return types;
  }

  private pickJiraIssueType(
    taskType: string | null | undefined,
    available: JiraIssueType[],
    isSubtask: boolean,
  ): JiraIssueType | null {
    if (available.length === 0) return null;

    // Subtasks must use a subtask-flagged issue type; top-level tasks must not.
    const pool = available.filter((it) => it.subtask === isSubtask);
    const fallbackPool = pool.length > 0 ? pool : available;

    const desired =
      taskType === "BUG"
        ? "bug"
        : taskType === "STORY"
          ? "story"
          : taskType === "EPIC"
            ? "epic"
            : "task";

    const exact = fallbackPool.find((it) => it.name.toLowerCase() === desired);
    if (exact) return exact;

    // Common alternative names by locale / Jira project template.
    const alternativesByDesired: Record<string, string[]> = {
      task: ["tarea", "item", "issue", "ticket", "to-do", "todo"],
      bug: ["defect", "error", "fault", "issue", "incidencia"],
      story: ["user story", "feature", "requirement", "historia"],
      epic: ["initiative", "theme"],
    };
    const alts = alternativesByDesired[desired] || [];
    for (const alt of alts) {
      const altMatch = fallbackPool.find((it) => it.name.toLowerCase() === alt);
      if (altMatch) return altMatch;
    }

    // Last-resort fallback: first available in the correct pool.
    return fallbackPool[0];
  }

  public async createJiraIssue(
    workspaceId: string,
    taskId: string,
    projectId: string,
  ): Promise<{ issueId: string; issueKey: string; url: string }> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA },
      },
    });

    if (!integration || !integration.accessToken) {
      throw new Error("Jira integration not found or unauthorized");
    }

    // Refresh token if expired before creating the issue
    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new Error("Local task not found");
    }

    const meta = integration.metadata as unknown as JiraIntegrationMetadata;
    const isBasic = meta?.authType === "BASIC";
    const accessToken = integration.accessToken;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: isBasic ? `Basic ${accessToken}` : `Bearer ${accessToken}`,
    };

    const siteUrl = isBasic
      ? meta?.jiraSiteUrl
      : `https://api.atlassian.com/ex/jira/${integration.accountId}`;

    if (!siteUrl) {
      throw new Error("Jira site URL is unavailable");
    }

    const cleanUrl = siteUrl.replace(/\/$/, "");

    const documentContent: Record<string, unknown>[] = [];
    documentContent.push({
      type: "paragraph",
      content: [{ type: "text", text: `🤖 Plan AI Auto-Task | 📁 Project: ${task.project.title}` }],
    });

    if (task.summary) {
      documentContent.push({
        type: "paragraph",
        content: [{ type: "text", text: task.summary }],
      });
    }
    if (task.acceptanceCriteria) {
      documentContent.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Acceptance Criteria" }],
      });
      documentContent.push({
        type: "paragraph",
        content: [{ type: "text", text: task.acceptanceCriteria }],
      });
    }
    if (task.storyPoints) {
      documentContent.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "AI Story Points Estimate" }],
      });
      documentContent.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `⭐ ${task.storyPoints} Points (Determined via Blueberry Plan AI complexity analysis)`,
          },
        ],
      });
    }
    if (task.dueDate) {
      documentContent.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Due Date" }],
      });
      documentContent.push({
        type: "paragraph",
        content: [{ type: "text", text: `🗓️ ${new Date(task.dueDate).toLocaleDateString()}` }],
      });
    }

    let jiraParentId: string | undefined = undefined;
    if (task.parentId) {
      const parentTask = await prisma.task.findUnique({ where: { id: task.parentId } });
      const parentMeta = parentTask?.metadata as unknown as TaskMetadata | null;
      if (parentMeta?.jira?.issueId) {
        jiraParentId = parentMeta.jira.issueId;
      }
    }

    const sanitizedProjectName = task.project.title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const labels = ["Plan-AI"];
    if (sanitizedProjectName) {
      labels.push(sanitizedProjectName);
    }

    const buildPayload = (issueType: JiraIssueType): Record<string, unknown> => {
      const payload: Record<string, unknown> = {
        fields: {
          project: { id: projectId },
          summary: (
            `[📁 ${task.project.title}] ` + (task.title || `Extracted Task ${task.id}`)
          ).substring(0, 250),
          labels,
          duedate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : undefined,
          description: {
            type: "doc",
            version: 1,
            content:
              documentContent.length > 0
                ? documentContent
                : [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Generated via Blueberry Plan AI" }],
                    },
                  ],
          },
          issuetype: { id: issueType.id },
        },
      };
      if (jiraParentId) {
        (payload.fields as Record<string, unknown>).parent = { id: jiraParentId };
      }
      return payload;
    };

    const postIssue = async (
      issueTypes: JiraIssueType[],
    ): Promise<{ ok: true; data: { id: string; key: string } } | { ok: false; status: number; body: string }> => {
      const issueType = this.pickJiraIssueType(task.type, issueTypes, Boolean(jiraParentId));
      if (!issueType) {
        throw new Error(`No Jira issue types available for project ${projectId}`);
      }
      const response = await fetch(`${cleanUrl}/rest/api/3/issue`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildPayload(issueType)),
      });
      const responseText = await response.text();
      if (!response.ok) {
        return { ok: false, status: response.status, body: responseText };
      }
      return { ok: true, data: JSON.parse(responseText) };
    };

    let issueTypes = await this.fetchProjectIssueTypes(workspaceId, projectId, cleanUrl, headers);
    let result = await postIssue(issueTypes);

    // If Jira rejects the issue type (e.g. cache stale after a config change),
    // invalidate the cache and retry once with a fresh discovery.
    if (!result.ok && result.status === 400 && result.body.includes("issuetype")) {
      logger.warn("Jira rejected issuetype — refreshing cache and retrying once", {
        projectId,
        body: result.body,
      });
      jiraIssueTypeCache.delete(`${workspaceId}:${projectId}`);
      issueTypes = await this.fetchProjectIssueTypes(workspaceId, projectId, cleanUrl, headers);
      result = await postIssue(issueTypes);
    }

    if (!result.ok) {
      logger.error("Failed to create Jira issue", {
        status: result.status,
        body: result.body,
      });
      throw new Error("Jira issue creation failed");
    }

    return {
      issueId: result.data.id,
      issueKey: result.data.key,
      url: `${cleanUrl}/browse/${result.data.key}`,
    };
  }

  public createStateToken(payload: AuthorizationStateInput): string {
    const issuedAt = payload.issuedAt ?? Date.now();
    const data: AuthorizationStatePayload = {
      workspaceId: payload.workspaceId,
      nonce: payload.nonce ?? randomUUID(),
      issuedAt,
      clientState: payload.clientState,
    };

    const serialized = JSON.stringify(data);
    const signature = this.signState(serialized);
    return `${Buffer.from(serialized).toString("base64url")}.${signature}`;
  }

  public parseAndValidateState(stateToken: string): AuthorizationStatePayload | null {
    if (!stateToken) {
      return null;
    }

    const [encodedPayload, providedSignature] = stateToken.split(".");
    if (!encodedPayload || !providedSignature) {
      return null;
    }

    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedSignature = this.signState(payloadJson);

    if (!this.constantTimeEquals(providedSignature, expectedSignature)) {
      logger.warn("Jira state signature mismatch");
      return null;
    }

    try {
      const parsed = JSON.parse(payloadJson) as AuthorizationStatePayload;

      if (!parsed.workspaceId || !parsed.nonce || !parsed.issuedAt) {
        return null;
      }

      const maxAgeMs = 1000 * 60 * 10; // 10 minutes
      if (Date.now() - parsed.issuedAt > maxAgeMs) {
        logger.warn("Jira state token expired");
        return null;
      }

      return parsed;
    } catch (error) {
      logger.error("Failed to parse Jira state token", error);
      return null;
    }
  }

  private computeExpiry(expiresInSeconds?: number) {
    if (!expiresInSeconds || expiresInSeconds <= 0) {
      return null;
    }

    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + expiresInSeconds);
    return expires;
  }

  private signState(payload: string): string {
    const hmac = createHmac("sha256", this.stateHmacSecret);
    hmac.update(payload);
    return hmac.digest("base64url");
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
  }

  private ensureTrailingSlash(baseUrl: string) {
    if (baseUrl.endsWith("/")) {
      return baseUrl;
    }
    return `${baseUrl}/`;
  }

  private buildScopeString(scopes: Array<string | null>) {
    return scopes.filter(Boolean).join(" ");
  }

  private isTokenResponse(value: unknown): value is JiraTokenResponse {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.access_token === "string" &&
      typeof candidate.expires_in === "number" &&
      typeof candidate.token_type === "string"
    );
  }

  private isAccessibleResource(value: unknown): value is JiraAccessibleResource {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === "string" && typeof candidate.name === "string";
  }
}

export const jiraIntegrationService = new JiraIntegrationService();
