/* eslint-disable @typescript-eslint/no-explicit-any */
import { google, drive_v3, Auth } from "googleapis";
import { Readable } from "stream";
import EnvUtils from "../utils/EnvUtils";
import { PrismaClient, IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export interface GoogleSummaryResponse {
  isConnected: boolean;
  userEmail?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accountId?: string;
  accountName?: string;
}

class GoogleIntegrationService {
  public buildRedirectUri(backendUrl: string): string {
    return EnvUtils.get("GOOGLE_REDIRECT_URI", `${backendUrl}/api/google/callback`);
  }

  private getOAuthClient(redirectUri?: string): Auth.OAuth2Client {
    const clientId = EnvUtils.get("GOOGLE_CLIENT_ID");
    const clientSecret = EnvUtils.get("GOOGLE_CLIENT_SECRET");
    const resolvedRedirectUri =
      redirectUri ||
      EnvUtils.get("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/google/callback");
    return new google.auth.OAuth2(clientId, clientSecret, resolvedRedirectUri);
  }

  public getAuthUrl(state?: string, redirectUri?: string): string {
    const oauth2Client = this.getOAuthClient(redirectUri);
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state,
      prompt: "consent",
    });
  }

  public buildFrontendRedirectUrl(
    status: "success" | "error",
    errorReason?: string,
    state?: string,
  ): string {
    const frontendUrl = EnvUtils.get("APP_URL", "http://localhost:3000");
    const url = new URL(`${frontendUrl}/integrations`);
    url.searchParams.append("provider", "google");
    url.searchParams.append("status", status);
    if (errorReason) url.searchParams.append("error_reason", errorReason);

    if (state) {
      try {
        const stateObj = JSON.parse(state);
        if (stateObj.redirectPath) {
          const redirectUrl = new URL(`${frontendUrl}${stateObj.redirectPath}`);
          redirectUrl.searchParams.append("provider", "google");
          redirectUrl.searchParams.append("status", status);
          if (errorReason) redirectUrl.searchParams.append("error_reason", errorReason);
          return redirectUrl.toString();
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const tokens = await this.exchangeCode(code, redirectUri);

    // Support legacy UserIntegration or keep refresh token
    const existingIntegration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.GOOGLE_DRIVE,
        },
      },
    });

    const finalRefreshToken = tokens.refreshToken || existingIntegration?.refreshToken;

    await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.GOOGLE_DRIVE,
        },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        accessToken: tokens.accessToken,
        ...(finalRefreshToken ? { refreshToken: finalRefreshToken } : {}),
        expiresAt: tokens.expiresAt,
        accountId: tokens.accountId,
        accountName: tokens.accountName,
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.GOOGLE_DRIVE,
        status: IntegrationStatus.CONNECTED,
        accessToken: tokens.accessToken,
        refreshToken: finalRefreshToken || "",
        expiresAt: tokens.expiresAt,
        accountId: tokens.accountId,
        accountName: tokens.accountName,
      },
    });
  }

  public async getGoogleSummary(workspaceId: string): Promise<GoogleSummaryResponse> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.GOOGLE_DRIVE } },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      userEmail: integration.accountName || undefined,
    };
  }

  public async exchangeCode(code: string, redirectUri?: string): Promise<GoogleTokens> {
    const oauth2Client = this.getOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    return {
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      accountId: userInfo.data.id || undefined,
      accountName: userInfo.data.email || undefined,
    };
  }

  public getDriveClientForUser(accessToken: string, refreshToken?: string): drive_v3.Drive {
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  public async getFileMetadata(
    drive: drive_v3.Drive,
    fileId: string,
  ): Promise<drive_v3.Schema$File> {
    const fileRes = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
      supportsAllDrives: true,
    });
    return fileRes.data;
  }

  /**
   * Downloads a file from Google Drive as a Buffer.
   * It handles Google Docs by exporting them as PDFs first to maintain formatting.
   */
  public async downloadFileAsBuffer(
    drive: drive_v3.Drive,
    fileId: string,
    mimeType: string,
  ): Promise<Buffer> {
    let response;

    if (mimeType.includes("google-apps.document")) {
      // Export Native Google Doc as PDF so pdf-parse can read it smoothly or plain text
      response = await drive.files.export(
        {
          fileId,
          mimeType: "application/pdf",
        },
        { responseType: "stream" },
      );
    } else if (mimeType.includes("google-apps.spreadsheet")) {
      // Export Google Sheets as XLSX to preserve formulas and formatting
      response = await drive.files.export(
        {
          fileId,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        { responseType: "stream" },
      );
    } else if (mimeType.includes("google-apps.presentation")) {
      // Export Google Slides as PDF
      response = await drive.files.export(
        {
          fileId,
          mimeType: "application/pdf",
        },
        { responseType: "stream" },
      );
    } else {
      // Standard binary files (PDFs, Markdown, raw audio, etc)
      response = await drive.files.get(
        {
          fileId,
          alt: "media",
        },
        { responseType: "stream" },
      );
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.data) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  public async uploadFileToDrive(
    workspaceId: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.GOOGLE_DRIVE,
        },
      },
    });

    if (!integration || integration.status !== IntegrationStatus.CONNECTED || !integration.accessToken) {
      throw new Error("Google Drive integration is not connected.");
    }

    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
      expiry_date: integration.expiresAt?.getTime(),
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Read target folder from integration metadata
    const meta = (integration.metadata ?? {}) as Record<string, unknown>;
    const parentFolderId = meta.defaultFolderId as string | undefined;

    // Readable stream from buffer
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const requestBody: Record<string, unknown> = {
      name: filename,
      mimeType,
    };

    if (parentFolderId) {
      requestBody.parents = [parentFolderId];
    }

    let response;
    try {
      response = await drive.files.create({
        requestBody,
        media: {
          mimeType,
          body: stream,
        },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
    } catch (error: any) {
      if (
        (error.code === 403 && error.message?.includes("permissions for the specified parent")) ||
        (error.code === 404 && error.message?.includes("File not found"))
      ) {
        if (parentFolderId) {
          console.warn(
            `[GoogleDrive] Invalid parent folder ${parentFolderId} (Code: ${error.code}). Falling back to root.`,
          );
          delete requestBody.parents;

          // Recreate the stream since the original one was consumed
          const retryStream = new Readable();
          retryStream.push(buffer);
          retryStream.push(null);

          response = await drive.files.create({
            requestBody,
            media: {
              mimeType,
              body: retryStream,
            },
            fields: "id, webViewLink",
            supportsAllDrives: true,
          });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    return response.data.webViewLink || "";
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
          provider: IntegrationProvider.GOOGLE_DRIVE,
        },
      },
    });
    if (!integration) throw new Error("Google Drive integration not found");

    const currentMeta = (integration.metadata ?? {}) as Record<string, unknown>;
    const newMetadata = {
      ...currentMeta,
      defaultFolderId: folderId,
      defaultFolderName: folderName,
    };

    await prisma.workspaceIntegration.update({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.GOOGLE_DRIVE,
        },
      },
      data: { metadata: newMetadata as Prisma.InputJsonObject },
    });
  }
}

export const googleIntegrationService = new GoogleIntegrationService();
