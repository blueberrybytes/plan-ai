/* eslint-disable @typescript-eslint/no-unused-vars */
import axios from "axios";
import { PrismaClient, IntegrationStatus, IntegrationProvider, Prisma } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

export interface MicrosoftSummaryResponse {
  isConnected: boolean;
  userEmail?: string;
}

export class MicrosoftIntegrationService {
  public buildRedirectUri(backendUrl: string): string {
    return `${backendUrl}/api/microsoft/callback`;
  }

  public buildAuthorizationUrl(redirectUri: string, state: string): string {
    const clientId = EnvUtils.get("MICROSOFT_CLIENT_ID");
    const tenantId = EnvUtils.get("MICROSOFT_TENANT_ID") || "common";

    if (!clientId) {
      throw new Error("Missing MICROSOFT_CLIENT_ID in environment variables");
    }

    const scopes = ["Files.ReadWrite.All", "Sites.ReadWrite.All", "User.Read", "offline_access"];

    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("response_mode", "query");
    authUrl.searchParams.append("scope", scopes.join(" "));
    authUrl.searchParams.append("state", state);

    return authUrl.toString();
  }

  public buildFrontendRedirectUrl(
    status: "success" | "error",
    errorReason?: string,
    state?: string,
  ): string {
    const frontendUrl = EnvUtils.get("APP_URL", "http://localhost:3000");
    const url = new URL(`${frontendUrl}/integrations`);
    url.searchParams.append("provider", "microsoft");
    url.searchParams.append("status", status);
    if (errorReason) url.searchParams.append("error_reason", errorReason);

    if (state) {
      try {
        const stateObj = JSON.parse(state);
        if (stateObj.redirectPath) {
          const redirectUrl = new URL(`${frontendUrl}${stateObj.redirectPath}`);
          redirectUrl.searchParams.append("provider", "microsoft");
          redirectUrl.searchParams.append("status", status);
          if (errorReason) redirectUrl.searchParams.append("error_reason", errorReason);
          return redirectUrl.toString();
        }
      } catch (e) {
        // Fall through
      }
    }
    return url.toString();
  }

  public async handleOAuthCallback(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<void> {
    const clientId = EnvUtils.get("MICROSOFT_CLIENT_ID");
    const clientSecret = EnvUtils.get("MICROSOFT_CLIENT_SECRET");
    const tenantId = EnvUtils.get("MICROSOFT_TENANT_ID") || "common";

    if (!clientId || !clientSecret) {
      throw new Error("Missing Microsoft client credentials");
    }

    // Exchange code for token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("scope", "Files.ReadWrite.All Sites.ReadWrite.All User.Read offline_access");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("grant_type", "authorization_code");
    params.append("client_secret", clientSecret);

    const tokenResponse = await axios.post(tokenUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Fetch user profile to get email
    const profileResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
      timeout: 15000,
    });

    const userEmail = profileResponse.data.userPrincipalName || profileResponse.data.mail;

    await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.ONEDRIVE,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountName: userEmail,
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.ONEDRIVE,
        status: IntegrationStatus.CONNECTED,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountName: userEmail,
      },
    });
  }

  public async getMicrosoftSummary(workspaceId: string): Promise<MicrosoftSummaryResponse> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ONEDRIVE } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      userEmail: integration.accountName || undefined,
    };
  }

  /**
   * Refresh the OneDrive access token if it's expired or about to expire.
   * Microsoft Graph tokens typically expire after 60-90 minutes.
   * Returns the (possibly refreshed) integration record.
   */
  public async refreshTokenIfExpired(workspaceId: string): Promise<{ accessToken: string }> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ONEDRIVE } },
    });

    if (
      !integration ||
      integration.status !== IntegrationStatus.CONNECTED ||
      !integration.accessToken
    ) {
      throw new Error("OneDrive integration not connected");
    }

    // If token is still valid (more than 5 minutes remaining), return as-is
    const buffer = 5 * 60 * 1000;
    if (integration.expiresAt && integration.expiresAt.getTime() - buffer > Date.now()) {
      return { accessToken: integration.accessToken };
    }

    // Token expired or about to expire — refresh it
    if (!integration.refreshToken) {
      throw new Error(
        "OneDrive token expired and no refresh token available. Please reconnect OneDrive.",
      );
    }

    const clientId = EnvUtils.get("MICROSOFT_CLIENT_ID");
    const clientSecret = EnvUtils.get("MICROSOFT_CLIENT_SECRET");
    const tenantId = EnvUtils.get("MICROSOFT_TENANT_ID") || "common";

    if (!clientId || !clientSecret) {
      throw new Error("Missing Microsoft client credentials for token refresh");
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("scope", "Files.ReadWrite.All Sites.ReadWrite.All User.Read offline_access");
    params.append("refresh_token", integration.refreshToken);
    params.append("grant_type", "refresh_token");
    params.append("client_secret", clientSecret);

    try {
      const tokenResponse = await axios.post(tokenUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token ?? integration.refreshToken, // Microsoft may or may not issue a new refresh token
          expiresAt,
        },
      });

      console.log(`[MicrosoftIntegrationService] Token refreshed for workspace ${workspaceId}`);
      return { accessToken: access_token };
    } catch (error) {
      logger.error("[MicrosoftIntegrationService] Token refresh failed:", error);
      console.error("[MicrosoftIntegrationService] Token refresh failed:", error);
      await prisma.workspaceIntegration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ERROR },
      });
      throw new Error(
        "OneDrive token expired and could not be refreshed. Please reconnect OneDrive.",
      );
    }
  }

  public async getOneDriveFileMetadata(
    accessToken: string,
    fileId: string,
  ): Promise<{ name: string; mimeType: string; size: number }> {
    const response = await axios.get(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    return {
      name: response.data.name,
      mimeType: response.data.file?.mimeType || "application/octet-stream",
      size: response.data.size || 0,
    };
  }

  public async downloadOneDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: "arraybuffer",
        timeout: 15000,
      },
    );
    return Buffer.from(response.data);
  }

  public async uploadFileToOneDrive(
    workspaceId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<string> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.ONEDRIVE,
        },
      },
    });

    if (
      !integration ||
      integration.status !== IntegrationStatus.CONNECTED ||
      !integration.accessToken
    ) {
      throw new Error("Microsoft OneDrive integration is not connected.");
    }

    // Refresh token if expired before uploading
    const { accessToken } = await this.refreshTokenIfExpired(workspaceId);

    // Read target folder from integration metadata
    const meta = (integration.metadata ?? {}) as Record<string, unknown>;
    const parentFolderId = meta.defaultFolderId as string | undefined;

    // Build upload URL: to specific folder or root
    const url = parentFolderId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentFolderId}:/${encodeURIComponent(filename)}:/content`
      : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/content`;

    const response = await axios.put(url, buffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      timeout: 15000,
    });

    return response.data.webUrl || "";
  }

  public async setDefaultFolder(
    workspaceId: string,
    folderId: string,
    folderName: string,
  ): Promise<void> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.ONEDRIVE,
        },
      },
    });
    if (!integration) throw new Error("OneDrive integration not found");

    // If the picker didn't return a real name, resolve it from Graph API
    let resolvedName = folderName;
    if (!folderName || folderName === "OneDrive Folder") {
      try {
        const { accessToken } = await this.refreshTokenIfExpired(workspaceId);
        const res = await axios.get(
          `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}?select=name`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
        );
        resolvedName = res.data.name || folderName;
      } catch (e) {
        console.warn("[MicrosoftIntegrationService] Could not resolve folder name:", e);
      }
    }

    const currentMeta = (integration.metadata ?? {}) as Record<string, unknown>;
    const newMetadata = {
      ...currentMeta,
      defaultFolderId: folderId,
      defaultFolderName: resolvedName,
    };

    await prisma.workspaceIntegration.update({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.ONEDRIVE,
        },
      },
      data: { metadata: newMetadata as Prisma.InputJsonObject },
    });
  }
}

export const microsoftIntegrationService = new MicrosoftIntegrationService();
