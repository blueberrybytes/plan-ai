import { App } from "octokit";
import { Webhooks } from "@octokit/webhooks";
import type { WebhookEventName } from "@octokit/webhooks-types";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
}

export interface GithubInstallationNode {
  orgName: string;
  orgAvatarUrl?: string;
  installationId: number;
  repositories: GithubRepository[];
}

export class GithubIntegrationService {
  private static instance: GithubIntegrationService;
  private app: App | null = null;
  private webhooks: Webhooks | null = null;
  private isInitialized = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): GithubIntegrationService {
    if (!GithubIntegrationService.instance) {
      GithubIntegrationService.instance = new GithubIntegrationService();
    }
    return GithubIntegrationService.instance;
  }

  private initialize() {
    const appId = EnvUtils.get("GITHUB_APP_ID");
    const webhookSecret = EnvUtils.get("GITHUB_WEBHOOK_SECRET");
    let privateKey = EnvUtils.get("GITHUB_PRIVATE_KEY");

    // Fallback: If not in .env, check for local github-private-key.pem file
    if (!privateKey) {
      const pemPath = path.join(process.cwd(), "github-private-key.pem");
      if (fs.existsSync(pemPath)) {
        privateKey = fs.readFileSync(pemPath, "utf-8");
      }
    } else {
      // Decode escaped newlines from .env string if any
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    if (!appId || !webhookSecret || !privateKey) {
      logger.warn("GitHub App credentials not fully configured. GitHub Integration disabled.");
      return;
    }

    // Attempt to heal flattened single-line PEM strings or Base64 decoding
    if (privateKey && typeof privateKey === "string") {
      // 0. Test if the entire key is Base64 encoded (a very common workaround for CI/CD platforms)
      if (!privateKey.includes("-----BEGIN")) {
        try {
          const decoded = Buffer.from(privateKey, "base64").toString("utf8");
          if (
            decoded.includes("-----BEGIN PRIVATE KEY-----") ||
            decoded.includes("-----BEGIN RSA PRIVATE KEY-----")
          ) {
            privateKey = decoded;
          } else {
            // If the user pasted the literal middle chunk of the PEM without headers...
            const cleanBase64 = privateKey
              .replace(/\\n/g, "")
              .replace(/\s+/g, "")
              .replace(/["']/g, "");
            if (/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
              privateKey = `-----BEGIN RSA PRIVATE KEY-----\n${cleanBase64}\n-----END RSA PRIVATE KEY-----`;
            }
          }
        } catch {
          // ignore false positive base64
        }
      }

      // 1. Remove wrapping quotes if they accidentally bled through the .env parser
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
        privateKey = privateKey.slice(1, -1);
      }

      // 2. If it's completely completely flattened without any \n literal
      if (!privateKey.includes("\n")) {
        privateKey = privateKey
          .replace(/-----BEGIN (RSA )?PRIVATE KEY-----\s*/, "-----BEGIN $1PRIVATE KEY-----\n")
          .replace(/\s*-----END (RSA )?PRIVATE KEY-----/, "\n-----END $1PRIVATE KEY-----");

        // 3. Remove all spaces in the base64 chunk between the headers
        const lines = privateKey.split("\n");
        if (lines.length >= 3) {
          lines[1] = lines[1].replace(/\s+/g, "");
          privateKey = lines.join("\n");
        }
      }
    }

    try {
      this.app = new App({
        appId: appId,
        privateKey: privateKey,
        webhooks: {
          secret: webhookSecret,
        },
      });

      this.webhooks = new Webhooks({
        secret: webhookSecret,
      });

      // Bind Webhook Listeners
      this.bindWebhookListeners();

      this.isInitialized = true;
      logger.info(`GitHub App integration initialized for App ID: ${appId}`);
    } catch (e) {
      logger.error("Failed to initialize GitHub App", e);
    }
  }

  private bindWebhookListeners() {
    if (!this.webhooks) return;

    this.webhooks.on("push", async ({ id, payload }) => {
      logger.info(
        `GitHub Push Event received: ${id} on repository ${payload.repository.full_name}`,
      );
      try {
        await this.handlePushEvent(payload);
      } catch (err) {
        logger.error(`Error processing push event ${id}`, err);
      }
    });

    // Listen for installation events
    this.webhooks.on("installation.created", async ({ payload }) => {
      const account = payload.installation.account;
      const accountLogin = account && "login" in account ? account.login : "unknown_account";
      logger.info(
        `GitHub App Installation installed: ${payload.installation.id} for account ${accountLogin}`,
      );
    });

    this.webhooks.on("installation.deleted", async ({ payload }) => {
      logger.info(`GitHub App Installation deleted: ${payload.installation.id}`);
      await prisma.userIntegration.updateMany({
        where: { accountId: payload.installation.id.toString(), provider: "GITHUB" },
        data: { status: "DISCONNECTED" },
      });
    });
  }

  /**
   * Main entrypoint for the HTTP controller to pass incoming webhooks into Octokit
   */
  public async verifyAndReceiveWebhook(
    signature: string,
    id: string,
    name: string,
    payloadText: string,
  ): Promise<boolean> {
    if (!this.isInitialized || !this.webhooks) {
      logger.warn("Received webhook but GitHub Integration is not configured.");
      return false;
    }

    try {
      // Octokit verifyAndReceive performs HMAC cryptographic verification using the raw buffer
      await this.webhooks.verifyAndReceive({
        id,
        name: name as WebhookEventName,
        payload: payloadText,
        signature,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error("GitHub Webhook verification failed", error.message);
      } else {
        logger.error("GitHub Webhook verification failed due to an unknown error");
      }
      return false;
    }
  }

  /**
   * Fetch connected repositories across multiple comma-separated installation IDs.
   */
  public async getAccessibleRepositories(accountIds: string): Promise<GithubInstallationNode[]> {
    if (!this.isInitialized || !this.app) {
      logger.warn("GitHub Integration is not initialized. Returning empty repositories.");
      return [];
    }

    const installationIds = accountIds.split(",").filter((id) => id.trim().length > 0);
    const nodes: GithubInstallationNode[] = [];

    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
      );

    for (const installationId of installationIds) {
      try {
        const idNumber = Number(installationId);

        const node = await Promise.race([
          (async () => {
            const octokit = await this.app!.getInstallationOctokit(idNumber);

            const installationResponse = await this.app!.octokit.rest.apps.getInstallation({
              installation_id: idNumber,
            });

            const orgAccount = installationResponse.data.account;
            const orgName =
              orgAccount && "login" in orgAccount ? orgAccount.login : `Installation ${idNumber}`;
            const orgAvatarUrl =
              orgAccount && "avatar_url" in orgAccount ? orgAccount.avatar_url : undefined;

            const reposResponse = await octokit.rest.apps.listReposAccessibleToInstallation();

            return {
              installationId: idNumber,
              orgName,
              orgAvatarUrl,
              repositories: reposResponse.data.repositories.map((repo) => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                html_url: repo.html_url,
                private: repo.private,
              })),
            } satisfies GithubInstallationNode;
          })(),
          timeout(10_000),
        ]);

        nodes.push(node);
      } catch (error) {
        logger.error(`Error fetching repositories for installation ${installationId}`, error);
        // Do not throw! Just skip broken installations gracefully so other orgs can still load
      }
    }

    return nodes;
  }

  /**
   * Retrieves an authenticated Octokit instance for a specific installation ID.
   */
  public async getInstallationOctokit(installationId: number) {
    if (!this.isInitialized || !this.app) {
      throw new Error("GitHub Integration is not initialized.");
    }
    return this.app.getInstallationOctokit(installationId);
  }

  /**
   * Fetches remote branches for a specific repository.
   */
  public async getRepositoryBranches(
    installationId: number,
    owner: string,
    repo: string,
  ): Promise<{ name: string }[]> {
    const octokit = await this.getInstallationOctokit(installationId);
    try {
      // Use paginate to fetch ALL branches (not just the first 100)
      const allBranches = await octokit.paginate(octokit.rest.repos.listBranches, {
        owner,
        repo,
        per_page: 100,
      });
      return allBranches.map((b) => ({ name: b.name }));
    } catch (error) {
      logger.error(`Failed to list branches for ${owner}/${repo}`, error);
      throw error;
    }
  }

  /**
   * Processes the push event in the background (AI logic)
   */
  private async handlePushEvent(payload: {
    installation?: { id?: number };
    repository?: { full_name?: string };
  }) {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    // Lookup the internal user that connected this github installation
    const integration = await prisma.userIntegration.findFirst({
      where: {
        provider: "GITHUB",
        accountId: installationId.toString(),
        status: "CONNECTED",
      },
    });

    if (!integration) {
      logger.info(`No connected user found for GitHub installation ${installationId}`);
      return;
    }

    const userId = integration.userId;
    logger.info(
      `Spawning background AI sequence to update diagrams for user ${userId} based on repo ${payload.repository?.full_name}`,
    );

    // 1. Fetch Installation Access Token from Octokit
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const {
        data: { token },
      } = await octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
      });

      const repoFullName = payload.repository?.full_name;
      if (!repoFullName) return;

      const gitUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;

      // 2. Trigger GitNexus Analysis via its REST API
      if (process.env.USE_GITNEXUS !== "true") {
        logger.info("USE_GITNEXUS is not 'true'. Skipping GitNexus analysis trigger.");
        return;
      }

      const mcpUrl = process.env.GITNEXUS_MCP_URL;
      if (!mcpUrl) {
        logger.warn("GITNEXUS_MCP_URL not configured. Cannot trigger analysis.");
        return;
      }

      const analyzeUrl = mcpUrl.replace("/api/mcp", "/api/analyze");
      logger.info(`Triggering GitNexus analysis for ${repoFullName}`);

      const response = await fetch(analyzeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: gitUrl,
          dropEmbeddings: true, // fast exact-match graph generation only
        }),
      });

      const data = await response.json();
      logger.info(`GitNexus analyze job queued: ${data.jobId || data.status || "Unknown"}`);
    } catch (err) {
      logger.error("Failed to trigger GitNexus analysis", err);
    }
  }
}

export const githubIntegrationService = GithubIntegrationService.getInstance();
