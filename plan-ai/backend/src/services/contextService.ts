import { ContextFile, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";

type ContextWithFiles = Prisma.ContextGetPayload<{
  include: { files: true };
}>;

export interface CreateContextInput {
  name: string;
  description?: string | null;
  color?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface UpdateContextInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface AttachFileInput {
  bucketPath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  metadata?: Prisma.InputJsonValue | null;
}

class ContextService {
  public async listContextsForWorkspace(workspaceId: string): Promise<ContextWithFiles[]> {
    return prisma.context.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { files: { orderBy: { createdAt: "desc" } } },
    });
  }

  public async getContextForWorkspace(
    workspaceId: string,
    contextId: string,
  ): Promise<ContextWithFiles> {
    const context = await prisma.context.findFirst({
      where: { id: contextId, workspaceId },
      include: { files: { orderBy: { createdAt: "desc" } } },
    });

    if (!context) {
      throw { status: 404, message: "Context not found" };
    }

    return context;
  }

  public async createContextForWorkspace(
    userId: string,
    workspaceId: string,
    input: CreateContextInput,
  ): Promise<ContextWithFiles> {
    const created = await prisma.context.create({
      data: {
        userId,
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        metadata: this.normalizeJson(input.metadata),
      },
    });

    return this.getContextForWorkspace(workspaceId, created.id);
  }

  public async updateContextForWorkspace(
    workspaceId: string,
    contextId: string,
    input: UpdateContextInput,
  ): Promise<ContextWithFiles> {
    await this.ensureContextOwnership(workspaceId, contextId);

    const data: Prisma.ContextUpdateInput = {};

    if (typeof input.name !== "undefined") {
      data.name = input.name;
    }

    if (typeof input.description !== "undefined") {
      data.description = input.description;
    }

    if (typeof input.color !== "undefined") {
      data.color = input.color;
    }

    if (typeof input.metadata !== "undefined") {
      data.metadata = this.normalizeJson(input.metadata);
    }

    await prisma.context.update({
      where: { id: contextId },
      data,
    });

    return this.getContextForWorkspace(workspaceId, contextId);
  }

  public async deleteContextForWorkspace(
    workspaceId: string,
    contextId: string,
  ): Promise<{ storagePaths: string[]; fileIds: string[] }> {
    const context = await prisma.context.findFirst({
      where: { id: contextId, workspaceId },
      include: { files: true },
    });

    if (!context) {
      throw { status: 404, message: "Context not found" };
    }

    await prisma.context.delete({ where: { id: contextId } });

    const storagePaths = context.files.map((file) => file.bucketPath);
    const fileIds = context.files.map((file) => file.id);

    return { storagePaths, fileIds };
  }

  public async attachFileToContext(
    workspaceId: string,
    contextId: string,
    input: AttachFileInput,
  ): Promise<ContextFile> {
    await this.ensureContextOwnership(workspaceId, contextId);

    return prisma.contextFile.create({
      data: {
        contextId,
        bucketPath: input.bucketPath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        metadata: this.normalizeJson(input.metadata),
      },
    });
  }

  public async removeFileFromContext(
    workspaceId: string,
    contextId: string,
    fileId: string,
  ): Promise<ContextFile> {
    const file = await prisma.contextFile.findFirst({
      where: { id: fileId, contextId, context: { workspaceId } },
    });

    if (!file) {
      throw { status: 404, message: "Context file not found" };
    }

    await prisma.contextFile.delete({ where: { id: fileId } });
    return file;
  }

  private async ensureContextOwnership(workspaceId: string, contextId: string): Promise<void> {
    const exists = await prisma.context.count({
      where: { id: contextId, workspaceId },
    });

    if (!exists) {
      throw { status: 404, message: "Context not found" };
    }
  }

  private normalizeJson(
    value: Prisma.InputJsonValue | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (typeof value === "undefined") {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}

export const contextService = new ContextService();
