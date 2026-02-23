import {
  Body,
  Controller,
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
import type { ApiResponse } from "./controllerTypes";
import { contextService } from "../services/contextService";
import prisma from "../prisma/prismaClient";
import type { Prisma } from "@prisma/client";
import type { Express } from "express";
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
} from "../utils/documentTextExtractor";

interface ContextFileResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  bucketPath: string;
  publicUrl: string;
}

interface ContextResponse {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  metadata: Prisma.JsonValue | null;
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
  metadata?: Prisma.InputJsonValue | null;
}

interface UpdateContextRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

@Route("api/contexts")
@Tags("Contexts")
export class ContextController extends Controller {
  @Get()
  @Security("ClientLevel")
  public async listContexts(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ContextListResponse>> {
    const user = await this.getAuthorizedUser(request);

    const contexts = await contextService.listContextsForUser(user.id);

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
    const user = await this.getAuthorizedUser(request);

    const context = await contextService.createContextForUser(user.id, {
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? null,
      metadata: body.metadata ?? null,
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
    const user = await this.getAuthorizedUser(request);

    const context = await contextService.getContextForUser(user.id, contextId);

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
  ): Promise<string> {
    const user = await this.getAuthorizedUser(request);
    const context = await contextService.getContextForUser(user.id, contextId);
    const file = context.files.find((f) => f.id === fileId);

    if (!file) {
      this.setStatus(404);
      throw { status: 404, message: "File not found" };
    }

    const buffer = await getContextFileContentFromFirebaseStorage(file.bucketPath, user.id);
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
    const user = await this.getAuthorizedUser(request);

    const context = await contextService.updateContextForUser(user.id, contextId, {
      name: body.name,
      description: body.description,
      color: body.color,
      metadata: body.metadata,
    });

    return {
      status: 200,
      message: "Context updated",
      data: this.mapContextResponse(context),
    };
  }

  @Delete("{contextId}")
  @Security("ClientLevel")
  public async deleteContext(
    @Request() request: AuthenticatedRequest,
    @Path() contextId: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.getAuthorizedUser(request);

    const { storagePaths } = await contextService.deleteContextForUser(user.id, contextId);

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
    const user = await this.getAuthorizedUser(request);

    if (!files || files.length === 0) {
      this.setStatus(400);
      throw { status: 400, message: "No files uploaded" };
    }

    const file = files[0];

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
      file.originalname,
      file.mimetype,
    );

    const metadataPayload = this.mergeMetadataWithPublicUrl(parsedMetadata, publicUrl);

    const contextFile = await contextService.attachFileToContext(user.id, contextId, {
      bucketPath: storagePath,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      metadata: metadataPayload,
    });

    await indexContextFileVectors({
      contextId,
      fileId: contextFile.id,
      fileName: file.originalname,
      mimeType: file.mimetype,
      file,
    }).catch((error) => {
      console.error("Failed to index context file vectors", error);
    });

    const context = await contextService.getContextForUser(user.id, contextId);

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
    const user = await this.getAuthorizedUser(request);

    const file = await contextService.removeFileFromContext(user.id, contextId, fileId);

    try {
      await deleteContextFileFromFirebaseStorage(file.bucketPath, user.id);
    } catch (error) {
      console.error("Failed to remove context file from storage", error);
    }

    await removeContextFileVectors(contextId, fileId).catch((error) => {
      console.error("Failed to delete context file vectors", error);
    });

    const context = await contextService.getContextForUser(user.id, contextId);

    return {
      status: 200,
      message: "Context file deleted",
      data: this.mapContextResponse(context),
    };
  }

  private async getAuthorizedUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(403);
      throw { status: 403, message: "User not registered" };
    }

    return user;
  }

  private parseOptionalJson(value: string | undefined, fieldName: string) {
    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch (error) {
      console.error(error);
      this.setStatus(400);
      throw { status: 400, message: `${fieldName} must be valid JSON.` };
    }
  }

  private mapContextResponse(
    context: Awaited<ReturnType<typeof contextService.getContextForUser>>,
  ): ContextResponse {
    return {
      id: context.id,
      name: context.name,
      description: context.description,
      color: context.color,
      metadata: context.metadata,
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
      })),
    };
  }

  private getPublicUrlForFile(file: {
    bucketPath: string;
    metadata: Prisma.JsonValue | null;
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
