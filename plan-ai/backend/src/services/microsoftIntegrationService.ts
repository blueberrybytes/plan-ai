/* eslint-disable @typescript-eslint/no-unused-vars */
import axios from "axios";
import { PrismaClient, IntegrationStatus, IntegrationProvider } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";

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
          return `${frontendUrl}${stateObj.redirectPath}`;
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
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Fetch user profile to get email
    const profileResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
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

    if (!integration || integration.status !== IntegrationStatus.CONNECTED || !integration.accessToken) {
      throw new Error("Microsoft OneDrive integration is not connected.");
    }

    const accessToken = integration.accessToken;

    // Use Microsoft Graph API to upload file to root of OneDrive
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/content`;
    
    const response = await axios.put(url, buffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });

    return response.data.webUrl || "";
  }
}

export const microsoftIntegrationService = new MicrosoftIntegrationService();
