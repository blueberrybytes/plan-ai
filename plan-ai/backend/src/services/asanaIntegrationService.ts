import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import type { WorkspaceIntegration } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import type { AsanaIntegrationMetadata } from "./integrationMetadataTypes";
import type { TaskMetadata } from "./taskMetadataTypes";

type AsanaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  data?: { id: string; name: string; email: string };
};

type AsanaUserResponse = {
  data: {
    gid: string;
    name: string;
    email: string;
    workspaces: { gid: string; name: string }[];
  };
};

type AsanaProjectResponse = {
  data: { gid: string; name: string }[];
};

type AsanaTaskCreatedResponse = {
  data: {
    gid: string;
    permalink_url: string;
    name: string;
  };
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

type AuthorizeUrlParams = {
  redirectUri: string;
  state?: string;
};

type FrontendRedirectParams = {
  result: "success" | "error";
  message?: string;
  state?: string;
};

const ASANA_AUTH_URL = "https://app.asana.com/-/oauth_authorize";
const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ASANA_API_BASE = "https://app.asana.com/api/1.0";
const DEFAULT_CALLBACK_PATH = "/api/asana/callback";
const DEFAULT_FRONTEND_REDIRECT_PATH = "/integrations?provider=asana";

class AsanaIntegrationService {
  private readonly clientId = EnvUtils.get("ASANA_CLIENT_ID");

  private readonly clientSecret = EnvUtils.get("ASANA_CLIENT_SECRET");

  private readonly frontendUrl = EnvUtils.get("FRONTEND_URL");

  private readonly callbackPath = process.env.ASANA_CALLBACK_PATH ?? DEFAULT_CALLBACK_PATH;

  private readonly frontendRedirectPath =
    process.env.ASANA_FRONTEND_REDIRECT_PATH ?? DEFAULT_FRONTEND_REDIRECT_PATH;

  private readonly stateHmacSecret = EnvUtils.get("ASANA_STATE_SECRET", this.clientSecret);

  public buildAuthorizationUrl({ redirectUri, state }: AuthorizeUrlParams) {
    const url = new URL(ASANA_AUTH_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    if (state) {
      url.searchParams.set("state", state);
    }
    return url.toString();
  }

  public buildRedirectUri(baseUrl: string) {
    if (process.env.ASANA_REDIRECT_URI) {
      return process.env.ASANA_REDIRECT_URI;
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
  ): Promise<AsanaTokenResponse> {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", this.clientId);
    params.append("client_secret", this.clientSecret);
    params.append("redirect_uri", redirectUri);
    params.append("code", code);

    const response = await fetch(ASANA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      logger.error("Failed to exchange Asana code", {
        status: response.status,
        body: rawBody,
      });
      throw new Error("Failed to exchange Asana code");
    }

    const parsed = JSON.parse(rawBody) as unknown;

    if (!this.isTokenResponse(parsed)) {
      logger.error("Unexpected Asana token response shape", { rawBody });
      throw new Error("Failed to complete Asana authorization");
    }

    return parsed;
  }

  /**
   * Proactively refreshes the access token if it is within 5 minutes of expiring.
   * On failure, marks the integration as ERROR so the user is prompted to reconnect.
   */
  public async refreshTokenIfExpired(
    workspaceId: string,
    integration: WorkspaceIntegration,
  ): Promise<WorkspaceIntegration> {
    const meta = integration.metadata as unknown as AsanaIntegrationMetadata;
    const isPat = meta?.authType === "PAT";
    if (isPat || !integration.refreshToken) {
      return integration; // PATs don't expire, and we need a refresh token for OAuth
    }

    // Check if token is within 5 minutes of expiring
    const buffer = 5 * 60 * 1000;
    if (integration.expiresAt && integration.expiresAt.getTime() - buffer > Date.now()) {
      return integration;
    }

    try {
      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("client_id", this.clientId);
      params.append("client_secret", this.clientSecret);
      params.append("refresh_token", integration.refreshToken);

      const response = await fetch(ASANA_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const rawBody = await response.text();
      if (!response.ok) {
        logger.error("Failed to refresh Asana token", { status: response.status, body: rawBody });
        throw new Error("Failed to refresh Asana token");
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
          refreshToken: parsed.refresh_token ?? integration.refreshToken,
          expiresAt,
        },
      });

      return updated;
    } catch (error) {
      logger.error("Error refreshing Asana token", error);
      await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ERROR },
      });
      throw new Error("Asana token expired and could not be refreshed. Please reconnect Asana.");
    }
  }

  public async getCurrentUser(accessToken: string): Promise<AsanaUserResponse["data"]> {
    const response = await fetch(`${ASANA_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      logger.error("Failed to get Asana current user", {
        status: response.status,
        body: bodyText,
      });
      throw new Error("Failed to get Asana user details");
    }

    const parsed = JSON.parse(bodyText) as AsanaUserResponse;
    return parsed.data;
  }

  public async upsertIntegration(params: {
    workspaceId: string;
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    asanaUser: AsanaUserResponse["data"];
  }): Promise<WorkspaceIntegration> {
    const expiresAt = this.computeExpiry(params.expiresInSeconds);
    const primaryWorkspace = params.asanaUser.workspaces?.[0];

    const metadata: AsanaIntegrationMetadata = {
      authType: "OAUTH",
      asanaWorkspaceGid: primaryWorkspace?.gid ?? null,
      asanaWorkspaceName: primaryWorkspace?.name ?? null,
      connectedAt: new Date().toISOString(),
    };

    const integration = await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: params.workspaceId,
          provider: IntegrationProvider.ASANA,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken ?? null,
        expiresAt,
        accountId: params.asanaUser.gid,
        accountName: params.asanaUser.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
      create: {
        workspaceId: params.workspaceId,
        provider: IntegrationProvider.ASANA,
        status: IntegrationStatus.CONNECTED,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken ?? null,
        expiresAt,
        accountId: params.asanaUser.gid,
        accountName: params.asanaUser.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
    });

    return integration;
  }

  public async verifyManualCredentials(
    workspaceId: string,
    personalAccessToken: string,
  ): Promise<WorkspaceIntegration> {
    const response = await fetch(`${ASANA_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${personalAccessToken.trim()}`,
        Accept: "application/json",
      },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      logger.error("Failed to verify Asana PAT", {
        status: response.status,
        bodyText,
      });
      throw new Error("Invalid Asana Personal Access Token");
    }

    const userData = JSON.parse(bodyText) as AsanaUserResponse;
    const user = userData.data;
    const primaryWorkspace = user.workspaces?.[0];

    const metadata: AsanaIntegrationMetadata = {
      authType: "PAT",
      asanaWorkspaceGid: primaryWorkspace?.gid ?? null,
      asanaWorkspaceName: primaryWorkspace?.name ?? null,
      connectedAt: new Date().toISOString(),
    };

    const integration = await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.ASANA,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: personalAccessToken.trim(),
        refreshToken: null,
        expiresAt: null,
        accountId: user.gid,
        accountName: user.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.ASANA,
        status: IntegrationStatus.CONNECTED,
        accessToken: personalAccessToken.trim(),
        refreshToken: null,
        expiresAt: null,
        accountId: user.gid,
        accountName: user.name,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
    });

    return integration;
  }

  public async getAsanaSummary(
    workspaceId: string,
  ): Promise<{ totalTasks: number | null; totalProjects: number | null }> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Asana is not connected");
    }

    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const meta = integration.metadata as unknown as AsanaIntegrationMetadata;
    const asanaWorkspaceGid = meta?.asanaWorkspaceGid;
    const headers = {
      Authorization: `Bearer ${integration.accessToken}`,
      Accept: "application/json",
    };

    let totalTasks: number | null = null;
    let totalProjects: number | null = null;

    // Fetch projects
    if (asanaWorkspaceGid) {
      try {
        const projectsRes = await fetch(
          `${ASANA_API_BASE}/projects?workspace=${asanaWorkspaceGid}&opt_fields=name&limit=100`,
          { headers },
        );
        if (projectsRes.ok) {
          const data = (await projectsRes.json()) as AsanaProjectResponse;
          totalProjects = data.data?.length ?? 0;
        }
      } catch (e) {
        logger.error("Failed to fetch Asana projects for summary", e);
      }

      // Fetch assigned tasks (approximation)
      try {
        const tasksRes = await fetch(
          `${ASANA_API_BASE}/tasks?assignee=me&workspace=${asanaWorkspaceGid}&opt_fields=name&limit=100&completed_since=now`,
          { headers },
        );
        if (tasksRes.ok) {
          const data = (await tasksRes.json()) as { data: unknown[] };
          totalTasks = data.data?.length ?? 0;
        }
      } catch (e) {
        logger.error("Failed to fetch Asana tasks for summary", e);
      }
    }

    return { totalTasks, totalProjects };
  }

  public async listAsanaProjects(
    workspaceId: string,
  ): Promise<{ gid: string; name: string }[]> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new Error("Asana is not connected");
    }

    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const meta = integration.metadata as unknown as AsanaIntegrationMetadata;
    const asanaWorkspaceGid = meta?.asanaWorkspaceGid;

    if (!asanaWorkspaceGid) {
      throw new Error("Asana workspace GID is unavailable");
    }

    const response = await fetch(
      `${ASANA_API_BASE}/projects?workspace=${asanaWorkspaceGid}&opt_fields=name&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to list Asana projects", { status: response.status, body: errorText });
      throw new Error(`Failed to fetch Asana projects: ${response.status}`);
    }

    const data = (await response.json()) as AsanaProjectResponse;
    return data.data.map((p) => ({ gid: p.gid, name: p.name }));
  }

  public async setDefaultAsanaProject(workspaceId: string, projectGid: string): Promise<void> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA } },
    });
    if (!integration) throw new Error("Asana integration not found");

    const currentMeta = (integration.metadata ?? {}) as unknown as AsanaIntegrationMetadata;
    const newMetadata: AsanaIntegrationMetadata = {
      ...currentMeta,
      defaultProjectGid: projectGid,
    };

    await prisma.workspaceIntegration.update({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA } },
      data: { metadata: newMetadata as unknown as Prisma.InputJsonObject },
    });
  }

  public async createAsanaTask(
    workspaceId: string,
    taskId: string,
    projectGid: string,
  ): Promise<{ taskGid: string; url: string }> {
    let integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA },
      },
    });

    if (!integration || !integration.accessToken) {
      throw new Error("Asana integration not found or unauthorized");
    }

    // Refresh token before creating the task
    integration = await this.refreshTokenIfExpired(workspaceId, integration);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new Error("Local task not found");
    }

    // Build task description
    let notes = `🤖 Plan AI Auto-Task | 📁 Project: ${task.project.title}\n---\n\n`;
    if (task.summary) {
      notes += `${task.summary}\n\n`;
    }
    if (task.acceptanceCriteria) {
      notes += `Acceptance Criteria:\n${task.acceptanceCriteria}\n\n`;
    }
    if (task.storyPoints) {
      notes += `⭐ ${task.storyPoints} Story Points (AI estimated)\n\n`;
    }
    if (task.dueDate) {
      notes += `🗓️ Due: ${new Date(task.dueDate).toLocaleDateString()}\n\n`;
    }

    // Handle parent task linking
    let asanaParentGid: string | undefined = undefined;
    if (task.parentId) {
      const parentTask = await prisma.task.findUnique({ where: { id: task.parentId } });
      const parentMeta = parentTask?.metadata as unknown as TaskMetadata | null;
      if (parentMeta?.asana?.taskGid) {
        asanaParentGid = parentMeta.asana.taskGid;
      }
    }

    const payload: Record<string, unknown> = {
      data: {
        name: (`[📁 ${task.project.title}] ` + (task.title || `Extracted Task ${task.id}`)).substring(0, 250),
        notes,
        projects: [projectGid],
        due_on: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : undefined,
        parent: asanaParentGid ?? undefined,
      },
    };

    const response = await fetch(`${ASANA_API_BASE}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    if (!response.ok) {
      logger.error("Failed to create Asana task", { status: response.status, body: responseText });
      throw new Error("Asana task creation failed");
    }

    const data = JSON.parse(responseText) as AsanaTaskCreatedResponse;
    return {
      taskGid: data.data.gid,
      url: data.data.permalink_url,
    };
  }

  // ─── State Token (CSRF protection) ────────────────────────────────

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
      logger.warn("Asana state signature mismatch");
      return null;
    }

    try {
      const parsed = JSON.parse(payloadJson) as AuthorizationStatePayload;

      if (!parsed.workspaceId || !parsed.nonce || !parsed.issuedAt) {
        return null;
      }

      const maxAgeMs = 1000 * 60 * 10; // 10 minutes
      if (Date.now() - parsed.issuedAt > maxAgeMs) {
        logger.warn("Asana state token expired");
        return null;
      }

      return parsed;
    } catch (error) {
      logger.error("Failed to parse Asana state token", error);
      return null;
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private computeExpiry(expiresInSeconds?: number) {
    if (!expiresInSeconds || expiresInSeconds <= 0) {
      return null;
    }

    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + expiresInSeconds);
    return expires;
  }

  private signState(payload: string): string {
    return createHmac("sha256", this.stateHmacSecret).update(payload).digest("base64url");
  }

  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private ensureTrailingSlash(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
  }

  private isTokenResponse(value: unknown): value is AsanaTokenResponse {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.access_token === "string";
  }
}

export const asanaIntegrationService = new AsanaIntegrationService();
