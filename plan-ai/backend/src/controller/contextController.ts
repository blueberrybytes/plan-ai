import { BaseWorkspaceController } from "./BaseWorkspaceController";
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
  UploadedFiles,
  Query,
} from "tsoa";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type TsoaJsonObject, type ApiResponse } from "./controllerTypes";
import { contextService } from "../services/contextService";
import { contextDocumentQueue } from "../queue/contextDocumentQueue";

import prisma from "../prisma/prismaClient";
import type { Prisma } from "@prisma/client";
import {
  deleteContextFileFromFirebaseStorage,
  uploadContextFileToFirebaseStorage,
  getContextFileContentFromFirebaseStorage,
} from "../firebase/firebaseStorage";
import {
  indexContextFileVectors,
  removeContextFileVectors,
  removeContextVectors,
} from "../vector/contextFileVectorService";
import {
  CONTEXT_SUPPORTED_FILE_LABELS,
  isSupportedContextFileMimeType,
  extractTextFromUpload,
} from "../utils/documentTextExtractor";
import { githubContextQueue } from "../queue/githubContextQueue";
import { googleIntegrationService } from "../services/googleIntegrationService";
import { microsoftIntegrationService } from "../services/microsoftIntegrationService";
import { webScraperService } from "../services/webScraperService";

interface ImportWebsiteRequest {
  url: string;
  maxPages?: number;
}

interface ContextFileResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  bucketPath: string;
  publicUrl: string;
  metadata: TsoaJsonObject | null;
}

interface ContextResponse {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  metadata: TsoaJsonObject | null;
  keywords: string[];
  files: ContextFileResponse[];
  createdAt: Date;
  updatedAt: Date;
}

interface ContextListResponse {
  contexts: ContextResponse[];
}

interface CreateContextRequest {
  name: string;
  description?: string | null;
  color?: string | null;
  metadata?: TsoaJsonObject | null;
}

interface UpdateContextRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  metadata?: TsoaJsonObject | null;
}

interface ConnectGithubRequest {
  repoFullName: string;
  installationId: string;
  branch?: string;
}

@Route("api/contexts")
@Tags("Contexts")
export class ContextController extends BaseWorkspaceController {
  @Get()
  @Security("ClientLevel")
  public async listContexts(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ContextListResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const contexts = await contextService.listContextsForWorkspace(workspaceId);

    return {
      status: 200,
      data: {
        contexts: contexts.map((context) => this.mapContextResponse(context)),
      },
    };
  }

  @Post()
  @Security("ClientLevel")
  public async createContext(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateContextRequest,
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const context = await contextService.createContextForWorkspace(user.id, workspaceId, {
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? null,
      metadata: (body.metadata as Prisma.InputJsonValue) ?? null,
    });

    this.setStatus(201);
    return {
      status: 201,
      message: "Context created",
      data: this.mapContextResponse(context),
    };
  }

  @Get("{contextId}")
  @Security("ClientLevel")
  public async getContext(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
  ): Promise<ApiResponse<ContextResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    return {
      status: 200,
      data: this.mapContextResponse(context),
    };
  }

  @Get("{contextId}/files/{fileId}/content")
  @Security("ClientLevel")
  public async getContextFileContent(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Path() fileId: string,
  ): Promise<any> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const context = await contextService.getContextForWorkspace(workspaceId, contextId);
    const file = context.files.find((f) => f.id === fileId);

    if (!file) {
      this.setStatus(404);
      throw { status: 404, message: "File not found" };
    }

    const buffer = await getContextFileContentFromFirebaseStorage(file.bucketPath, user.id);

    try {
      if (isSupportedContextFileMimeType(file.mimeType)) {
        const textContent = await extractTextFromUpload({
          buffer,
          mimetype: file.mimeType,
          originalname: file.fileName,
        } as Express.Multer.File);

        this.setHeader("Content-Type", "text/plain");
        return textContent;
      }
    } catch (err) {
      console.error("Failed to extract text for viewing", err);
    }

    this.setHeader("Content-Type", file.mimeType);
    return buffer.toString("utf-8");
  }

  @Put("{contextId}")
  @Security("ClientLevel")
  public async updateContext(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Body() body: UpdateContextRequest,
  ): Promise<ApiResponse<ContextResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const context = await contextService.updateContextForWorkspace(workspaceId, contextId, {
      name: body.name,
      description: body.description,
      color: body.color,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    });

    return {
      status: 200,
      message: "Context updated",
      data: this.mapContextResponse(context),
    };
  }

  @Post("{contextId}/github")
  @Security("ClientLevel")
  public async connectGithubRepository(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Body() body: ConnectGithubRequest,
  ): Promise<ApiResponse<ContextResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // Get the current context to ensure it exists and belongs to the user
    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    // Merge existing metadata with github specific syncing metadata
    let newMetadata: Prisma.JsonObject = {};
    if (this.isJsonObject(context.metadata as Prisma.InputJsonValue)) {
      newMetadata = { ...(context.metadata as Prisma.JsonObject) };
    }

    newMetadata.githubRepoFullName = body.repoFullName;
    newMetadata.installationId = body.installationId;
    newMetadata.syncStatus = "SYNCING";

    // Update context in DB
    const updatedContext = await contextService.updateContextForWorkspace(workspaceId, contextId, {
      metadata: newMetadata,
    });

    // Fire off async background job to BullMQ
    await githubContextQueue.add(
      "github-sync",
      {
        contextId,
        githubRepoId: body.repoFullName,
        installationId: body.installationId,
        branch: body.branch,
      },
      {
        jobId: `${contextId}-${body.repoFullName}-${Date.now()}`,
      },
    );

    this.setStatus(202);
    return {
      status: 202,
      message: "GitHub Repository sync initiated",
      data: this.mapContextResponse(updatedContext),
    };
  }

  @Delete("{contextId}")
  @Security("ClientLevel")
  public async deleteContext(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
  ): Promise<ApiResponse<null>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const { storagePaths } = await contextService.deleteContextForWorkspace(workspaceId, contextId);

    for (const path of storagePaths) {
      try {
        await deleteContextFileFromFirebaseStorage(path, user.id);
      } catch (error) {
        console.error("Failed to remove context file from storage", error);
      }
    }

    try {
      await removeContextVectors(contextId);
    } catch (error) {
      console.error("Failed to remove context vectors", error);
    }

    return {
      status: 200,
      message: "Context deleted",
      data: null,
    };
  }

  @Post("{contextId}/files")
  @Security("ClientLevel")
  public async uploadContextFile(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query() metadata?: string,
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    if (!files || files.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "No files uploaded" };
    }

    const file = files[0];
    const originalNameUtf8 = Buffer.from(file.originalname, "latin1").toString("utf8");

    if (!isSupportedContextFileMimeType(file.mimetype)) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `Unsupported file type. Supported types: ${CONTEXT_SUPPORTED_FILE_LABELS.join(", ")}.`,
      };
    }

    const parsedMetadata = this.parseOptionalJson(metadata, "metadata");

    const { storagePath, publicUrl } = await uploadContextFileToFirebaseStorage(
      file.buffer,
      user.id,
      contextId,
      originalNameUtf8,
      file.mimetype,
    );

    let metadataPayload = this.mergeMetadataWithPublicUrl(
      parsedMetadata as Prisma.InputJsonValue | undefined,
      publicUrl,
    );

    // Tag as processing
    metadataPayload = {
      ...((metadataPayload as Prisma.JsonObject) || {}),
      processingStatus: "PENDING",
    };

    const contextFile = await contextService.attachFileToContext(workspaceId, contextId, {
      bucketPath: storagePath,
      fileName: originalNameUtf8,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      metadata: metadataPayload,
    });

    await contextDocumentQueue.add(
      "process-pdf-llm",
      {
        contextId,
        fileId: contextFile.id,
        userId: user.id,
        workspaceId,
      },
      {
        jobId: `context-doc-${contextFile.id}-${Date.now()}`,
      },
    );

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    this.setStatus(201);
    return {
      status: 201,
      message: "Context file uploaded",
      data: this.mapContextResponse(context),
    };
  }

  @Delete("{contextId}/files/{fileId}")
  @Security("ClientLevel")
  public async deleteContextFile(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Path() fileId: string,
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const file = await contextService.removeFileFromContext(workspaceId, contextId, fileId);

    try {
      await deleteContextFileFromFirebaseStorage(file.bucketPath, user.id);
    } catch (error) {
      console.error("Failed to remove context file from storage", error);
    }

    await removeContextFileVectors(contextId, fileId).catch((error) => {
      console.error("Failed to delete context file vectors", error);
    });

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    return {
      status: 200,
      message: "Context file deleted",
      data: this.mapContextResponse(context),
    };
  }

  @Post("{contextId}/files/{fileId}/retry")
  @Security("ClientLevel")
  public async retryContextFileProcessing(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Path() fileId: string,
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const file = await prisma.contextFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.contextId !== contextId) {
      this.setStatus(404);
      throw { status: 404, message: "File not found in this context" };
    }

    // Reset metadata
    const meta =
      typeof file.metadata === "object" && file.metadata
        ? { ...(file.metadata as Prisma.JsonObject) }
        : {};

    meta.processingStatus = "PENDING";
    delete meta.processingError;

    await prisma.contextFile.update({
      where: { id: fileId },
      data: { metadata: meta },
    });

    await contextDocumentQueue.add(
      "process-pdf-llm",
      {
        contextId,
        fileId: file.id,
        userId: user.id,
        workspaceId,
      },
      {
        jobId: `context-doc-${file.id}-${Date.now()}`,
      },
    );

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    return {
      status: 200,
      message: "File processing retried",
      data: this.mapContextResponse(context),
    };
  }

  @Post("{contextId}/google-drive-import")
  @Security("ClientLevel")
  public async importFromGoogleDrive(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Body() body: { fileIds: string[] },
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    if (!body.fileIds || body.fileIds.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "No file IDs provided" };
    }

    const integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: "GOOGLE_DRIVE",
        },
      },
    });

    if (!integration || integration.status !== "CONNECTED" || !integration.accessToken) {
      this.setStatus(400);
      throw { status: 400, message: "Google Drive integration not connected" };
    }

    const drive = googleIntegrationService.getDriveClientForUser(
      integration.accessToken,
      integration.refreshToken || undefined,
    );

    for (const fileId of body.fileIds) {
      try {
        const metadata = await googleIntegrationService.getFileMetadata(drive, fileId);
        if (!metadata.name || !metadata.mimeType) {
          console.warn(`Could not fetch metadata for Google Drive file ${fileId}`);
          continue;
        }

        const buffer = await googleIntegrationService.downloadFileAsBuffer(
          drive,
          fileId,
          metadata.mimeType,
        );

        // Convert mimeType if exported from Google formats
        let finalMimeType = metadata.mimeType;
        if (
          metadata.mimeType.includes("google-apps.document") ||
          metadata.mimeType.includes("google-apps.presentation")
        ) {
          finalMimeType = "application/pdf";
          if (!metadata.name.endsWith(".pdf")) metadata.name += ".pdf";
        } else if (metadata.mimeType.includes("google-apps.spreadsheet")) {
          finalMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          if (!metadata.name.endsWith(".xlsx")) metadata.name += ".xlsx";
        }

        if (!isSupportedContextFileMimeType(finalMimeType)) {
          console.warn(`Unsupported file type from Google Drive file ${fileId}: ${finalMimeType}`);
          continue;
        }

        const { storagePath, publicUrl } = await uploadContextFileToFirebaseStorage(
          buffer,
          user.id,
          contextId,
          metadata.name,
          finalMimeType,
        );

        const gDriveMetadata = {
          source: "GOOGLE_DRIVE",
          googleDriveFileId: fileId,
          publicUrl,
          processingStatus: "PENDING",
        };

        const contextFile = await contextService.attachFileToContext(workspaceId, contextId, {
          bucketPath: storagePath,
          fileName: metadata.name,
          mimeType: finalMimeType,
          sizeBytes: buffer.length,
          metadata: gDriveMetadata,
        });

        await contextDocumentQueue.add(
          "process-pdf-llm",
          {
            contextId,
            fileId: contextFile.id,
            userId: user.id,
            workspaceId,
          },
          {
            jobId: `context-doc-${contextFile.id}-${Date.now()}`,
          },
        );
      } catch (error) {
        console.error(`Failed to import Google Drive file ${fileId}`, error);
      }
    }

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    this.setStatus(200);
    return {
      status: 200,
      message: "Google Drive files imported",
      data: this.mapContextResponse(context),
    };
  }

  @Post("{contextId}/onedrive-import")
  @Security("ClientLevel")
  public async importFromOneDrive(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Body() body: { fileIds: string[] },
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    if (!body.fileIds || body.fileIds.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "No file IDs provided" };
    }

    const integration = await prisma.workspaceIntegration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: "ONEDRIVE",
        },
      },
    });

    if (!integration || integration.status !== "CONNECTED" || !integration.accessToken) {
      this.setStatus(400);
      throw { status: 400, message: "OneDrive integration not connected" };
    }

    // Refresh token if expired before making Graph API calls
    const { accessToken } = await microsoftIntegrationService.refreshTokenIfExpired(workspaceId);

    for (const fileId of body.fileIds) {
      try {
        const metadata = await microsoftIntegrationService.getOneDriveFileMetadata(
          accessToken,
          fileId,
        );

        if (!metadata.name || !metadata.mimeType) {
          console.warn(`Could not fetch metadata for OneDrive file ${fileId}`);
          continue;
        }

        const buffer = await microsoftIntegrationService.downloadOneDriveFile(
          accessToken,
          fileId,
        );

        if (!isSupportedContextFileMimeType(metadata.mimeType)) {
          console.warn(`Unsupported file type from OneDrive file ${fileId}: ${metadata.mimeType}`);
          continue;
        }

        const { storagePath, publicUrl } = await uploadContextFileToFirebaseStorage(
          buffer,
          user.id,
          contextId,
          metadata.name,
          metadata.mimeType,
        );

        const oneDriveMetadata = {
          source: "ONEDRIVE",
          oneDriveFileId: fileId,
          publicUrl,
          processingStatus: "PENDING",
        };

        const contextFile = await contextService.attachFileToContext(workspaceId, contextId, {
          bucketPath: storagePath,
          fileName: metadata.name,
          mimeType: metadata.mimeType,
          sizeBytes: buffer.length,
          metadata: oneDriveMetadata,
        });

        await contextDocumentQueue.add(
          "process-pdf-llm",
          {
            contextId,
            fileId: contextFile.id,
            userId: user.id,
            workspaceId,
          },
          {
            jobId: `context-doc-${contextFile.id}-${Date.now()}`,
          },
        );
      } catch (error) {
        console.error(`Failed to import OneDrive file ${fileId}`, error);
      }
    }

    const oneDriveContext = await contextService.getContextForWorkspace(workspaceId, contextId);

    this.setStatus(200);
    return {
      status: 200,
      message: "OneDrive files imported",
      data: this.mapContextResponse(oneDriveContext),
    };
  }

  @Post("{contextId}/website")
  @Security("ClientLevel")
  public async importFromWebsite(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
    @Body() body: ImportWebsiteRequest,
  ): Promise<ApiResponse<ContextResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    if (!body.url) {
      this.setStatus(400);
      throw { status: 400, message: "URL is required" };
    }

    const maxPages = body.maxPages && body.maxPages > 0 ? body.maxPages : 1;

    // Attempt to scrape the website
    const scrapedPages = await webScraperService.scrapeWebsite(body.url, maxPages);

    if (!scrapedPages || scrapedPages.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "Could not extract any content from the provided URL" };
    }

    // 1. Aggregate all scraped pages into one massive text blocks
    let aggregatedText = "";
    const scrapedUrls: string[] = [];

    for (const page of scrapedPages) {
      aggregatedText += `--- Start of Page: ${page.title} ---\nSource URL: ${page.url}\n\n${page.content}\n\n`;
      scrapedUrls.push(page.url);
    }

    try {
      const buffer = Buffer.from(aggregatedText, "utf-8");
      const finalMimeType = "text/plain";

      const parsedUrl = new URL(body.url);
      const hostName = parsedUrl.hostname.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const fileName = `website_scrape_${hostName}.txt`;

      const { storagePath, publicUrl } = await uploadContextFileToFirebaseStorage(
        buffer,
        user.id,
        contextId,
        fileName,
        finalMimeType,
      );

      const contextFile = await contextService.attachFileToContext(workspaceId, contextId, {
        bucketPath: storagePath,
        fileName: fileName,
        mimeType: finalMimeType,
        sizeBytes: buffer.length,
        metadata: { source: "WEBSITE_SCRAPE", urls: scrapedUrls, rootUrl: body.url, publicUrl },
      });

      await indexContextFileVectors({
        contextId,
        fileId: contextFile.id,
        fileName: fileName,
        mimeType: finalMimeType,
        file: {
          buffer,
          mimetype: finalMimeType,
          originalname: fileName,
        } as Express.Multer.File,
      });
    } catch (error) {
      console.error(`Failed to ingest aggregated website data for ${body.url}`, error);
      this.setStatus(500);
      throw { status: 500, message: "Internal server error during ingestion." };
    }

    const context = await contextService.getContextForWorkspace(workspaceId, contextId);

    this.setStatus(200);
    return {
      status: 200,
      message: `Successfully imported ${scrapedPages.length} pages`,
      data: this.mapContextResponse(context),
    };
  }

  private parseOptionalJson(value: string | undefined, fieldName: string) {
    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as TsoaJsonObject;
    } catch (error) {
      console.error(error);
      this.setStatus(400);
      throw { status: 400, message: `${fieldName} must be valid JSON.` };
    }
  }

  private mapContextResponse(
    context: Awaited<ReturnType<typeof contextService.getContextForWorkspace>>,
  ): ContextResponse {
    return {
      id: context.id,
      name: context.name,
      description: context.description,
      color: context.color,
      metadata: context.metadata as TsoaJsonObject,
      keywords: context.keywords,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      files: context.files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        bucketPath: file.bucketPath,
        publicUrl: this.getPublicUrlForFile(file),
        metadata: file.metadata as TsoaJsonObject | null,
      })),
    };
  }

  private getPublicUrlForFile(file: {
    bucketPath: string;
    metadata: TsoaJsonObject | null;
  }): string {
    if (file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)) {
      const maybeUrl = (file.metadata as Record<string, unknown>).publicUrl;
      if (typeof maybeUrl === "string") {
        return maybeUrl;
      }
    }

    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    return `https://storage.googleapis.com/${bucket}/${file.bucketPath}`;
  }

  private mergeMetadataWithPublicUrl(
    metadata: Prisma.InputJsonValue | undefined,
    publicUrl: string,
  ): Prisma.JsonObject {
    if (this.isJsonObject(metadata)) {
      return { ...metadata, publicUrl };
    }

    return { publicUrl };
  }

  private isJsonObject(
    value: Prisma.InputJsonValue | null | undefined,
  ): value is Prisma.JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
