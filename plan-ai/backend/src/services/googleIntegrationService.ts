import { google, drive_v3, Auth } from "googleapis";
import EnvUtils from "../utils/EnvUtils";

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accountId?: string;
  accountName?: string;
}

class GoogleIntegrationService {
  private getOAuthClient(): Auth.OAuth2Client {
    const clientId = EnvUtils.get("GOOGLE_CLIENT_ID");
    const clientSecret = EnvUtils.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = EnvUtils.get(
      "GOOGLE_REDIRECT_URI",
      "http://localhost:8080/api/integrations/google/callback",
    );
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  public getAuthUrl(state?: string): string {
    const oauth2Client = this.getOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state,
      prompt: "consent",
    });
  }

  public async exchangeCode(code: string): Promise<GoogleTokens> {
    const oauth2Client = this.getOAuthClient();
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
}

export const googleIntegrationService = new GoogleIntegrationService();
