import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";
import type { UserIntegration } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";

type JiraTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type AuthorizationStatePayload = {
  userId: string;
  nonce: string;
  issuedAt: number;
  clientState?: string | null;
};

type AuthorizationStateInput = {
  userId: string;
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
const DEFAULT_FRONTEND_REDIRECT_PATH = "/integrations/jira";

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
      logger.error("Jira token exchange failed", {
        status: response.status,
        body: rawBody,
      });
      throw new Error("Failed to complete Jira authorization");
    }

    const parsed = JSON.parse(rawBody) as unknown;
    if (!this.isTokenResponse(parsed)) {
      logger.error("Unexpected Jira token response shape", { rawBody });
      throw new Error("Failed to complete Jira authorization");
    }

    return parsed;
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
    userId: string;
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    scope?: string;
    resource: JiraAccessibleResource;
  }): Promise<UserIntegration> {
    const expiresAt = this.computeExpiry(params.expiresInSeconds);
    const metadata: Prisma.JsonObject = {
      jiraSiteId: params.resource.id,
      jiraSiteUrl: params.resource.url ?? null,
      scopes: params.resource.scopes ?? [],
      connectedAt: new Date().toISOString(),
    };

    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: params.userId,
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
        metadata,
      },
      create: {
        userId: params.userId,
        provider: IntegrationProvider.JIRA,
        status: IntegrationStatus.CONNECTED,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken ?? null,
        expiresAt,
        scope: params.scope ?? null,
        accountId: params.resource.id,
        accountName: params.resource.name,
        metadata,
      },
    });

    return integration;
  }

  public createStateToken(payload: AuthorizationStateInput): string {
    const issuedAt = payload.issuedAt ?? Date.now();
    const data: AuthorizationStatePayload = {
      userId: payload.userId,
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

      if (!parsed.userId || !parsed.nonce || !parsed.issuedAt) {
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
