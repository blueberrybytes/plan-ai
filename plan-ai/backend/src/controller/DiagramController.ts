import { BaseWorkspaceController } from "./BaseWorkspaceController";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Security,
  Body,
  Path,
  Request,
} from "tsoa";
import prisma from "../prisma/prismaClient";
import type { DiagramType } from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { diagramGenerationService } from "../services/diagramGenerationService";
import { mergeProjectAndContextIds } from "../services/projectContextResolver";

export interface CreateDiagramRequest {
  title: string;
  prompt: string;
  type: "AUTO" | "FLOWCHART" | "SEQUENCE" | "GANTT" | "MINDMAP" | "CLASS" | "ER" | "ARCHITECTURE";
  themeId?: string;
  /** Legacy: direct context IDs. Prefer `projectIds`. */
  contextIds?: string[];
  /** Preferred: user-facing project IDs. Backend resolves to contextIds. */
  projectIds?: string[];
  transcriptIds?: string[];
  isManual?: boolean;
}

export interface DiagramAssistantRequest {
  instruction: string;
  currentCode?: string;
}

export interface UpdateDiagramRequest {
  title?: string;
  mermaidCode?: string;
  themeId?: string;
  status?: "GENERATING" | "DRAFT" | "FAILED";
  isPublic?: boolean;
}

export interface DiagramResponse {
  id: string;
  title: string;
  prompt: string;
  mermaidCode: string | null;
  type: string;
  themeId: string | null;
  status: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  theme?: {
    id: string;
    name: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    headingFont: string;
    bodyFont: string;
    backgroundStyle: string | null;
    cardStyle: string | null;
  } | null;
}

export interface DiagramListResponse {
  diagrams: DiagramResponse[];
}

@Route("api/diagrams")
@Tags("Diagrams")
export class DiagramController extends BaseWorkspaceController {
  @Get("/")
  @Security("ClientLevel")
  public async getUserDiagrams(
    @Request() request: AuthenticatedRequest,
  ): Promise<DiagramListResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const diagrams = await prisma.diagram.findMany({
      where: {
        workspaceId,
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      diagrams: diagrams.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    };
  }

  @Get("{diagramId}")
  @Security("ClientLevel")
  public async getDiagram(
    @Request() request: AuthenticatedRequest,
    @Path() diagramId: string,
  ): Promise<DiagramResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId, workspaceId },
      include: {
        theme: true,
      },
    });

    if (!diagram) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    return {
      ...diagram,
      isPublic: diagram.isPublic,
      createdAt: diagram.createdAt.toISOString(),
      updatedAt: diagram.updatedAt.toISOString(),
    };
  }

  @Post("")
  @Security("ClientLevel")
  public async createDiagram(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateDiagramRequest,
  ): Promise<DiagramResponse> {
    const { user, workspaceId } = await this.getPaidGenerationAccess(request);

    const contextIds = await mergeProjectAndContextIds(body.projectIds, body.contextIds);

    let initialSyntax = `%% ${body.title} - ${body.type}\n`;
    if (body.type === "FLOWCHART") initialSyntax += "flowchart TD\n";
    if (body.type === "ARCHITECTURE") initialSyntax += "architecture-beta\n";
    if (body.type === "SEQUENCE") initialSyntax += "sequenceDiagram\n";
    if (body.type === "MINDMAP") initialSyntax += "mindmap\n  root";
    if (body.type === "GANTT") initialSyntax += `gantt\n  title ${body.title}`;
    if (body.type === "AUTO") initialSyntax = `%% ${body.title} - AUTO DETECT\n`;

    const diagram = await prisma.diagram.create({
      data: {
        userId: user.id,
        workspaceId,
        title: body.title,
        prompt: body.prompt,
        type: body.type as DiagramType,
        themeId: body.themeId || null,
        contextIds,
        transcriptIds: body.transcriptIds || [],
        mermaidCode: initialSyntax,
        status: body.isManual ? "DRAFT" : "GENERATING",
      },
    });

    if (!body.isManual) {
      // Fire & Forget the generation
      diagramGenerationService
        .triggerGeneration({
          diagramId: diagram.id,
          userId: user.id,
          workspaceId,
          prompt: body.prompt,
          type: body.type,
          contextIds,
          transcriptIds: body.transcriptIds || [],
        })
        .catch(console.error);
    }

    return {
      ...diagram,
      isPublic: diagram.isPublic,
      createdAt: diagram.createdAt.toISOString(),
      updatedAt: diagram.updatedAt.toISOString(),
    };
  }

  @Put("{diagramId}")
  @Security("ClientLevel")
  public async updateDiagram(
    @Request() request: AuthenticatedRequest,
    @Path() diagramId: string,
    @Body() body: UpdateDiagramRequest,
  ): Promise<DiagramResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const current = await prisma.diagram.findFirst({
      where: { id: diagramId, workspaceId },
    });

    if (!current) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        title: body.title,
        mermaidCode: body.mermaidCode,
        themeId: body.themeId,
        status: body.status,
        isPublic: body.isPublic,
      },
      include: {
        theme: true,
      },
    });

    return {
      ...updated,
      isPublic: updated.isPublic,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  @Delete("{diagramId}")
  @Security("ClientLevel")
  public async deleteDiagram(
    @Request() request: AuthenticatedRequest,
    @Path() diagramId: string,
  ): Promise<void> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const current = await prisma.diagram.findFirst({
      where: { id: diagramId, workspaceId },
    });

    if (!current) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    await prisma.diagram.delete({
      where: { id: diagramId },
    });
  }

  @Post("{diagramId}/assistant")
  @Security("ClientLevel")
  public async assistDiagram(
    @Request() request: AuthenticatedRequest,
    @Path() diagramId: string,
    @Body() body: DiagramAssistantRequest,
  ): Promise<DiagramResponse> {
    const { user, workspaceId } = await this.getPaidWorkspaceAccess(request);

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId, workspaceId },
    });

    if (!diagram) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    const updatedDiagram = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        status: "GENERATING",
        mermaidCode: body.currentCode || diagram.mermaidCode,
      },
    });

    // Fire & Forget the improvement task
    diagramGenerationService
      .triggerImprovement({
        diagramId: diagram.id,
        userId: user.id,
        workspaceId,
        instruction: body.instruction,
        currentCode: body.currentCode || diagram.mermaidCode || "",
        contextIds: diagram.contextIds,
        transcriptIds: diagram.transcriptIds,
      })
      .catch(console.error);

    return {
      ...updatedDiagram,
      isPublic: updatedDiagram.isPublic,
      createdAt: updatedDiagram.createdAt.toISOString(),
      updatedAt: updatedDiagram.updatedAt.toISOString(),
    };
  }
}

@Route("api/public/diagrams")
@Tags("Public Diagrams")
export class PublicDiagramController extends Controller {
  @Get("{diagramId}")
  public async getPublicDiagram(@Path() diagramId: string): Promise<DiagramResponse> {
    const diagram = await prisma.diagram.findUnique({
      where: { id: diagramId },
      include: {
        theme: true,
      },
    });

    if (!diagram || !diagram.isPublic) {
      this.setStatus(404);
      throw new Error("Diagram not found or not public");
    }

    return {
      ...diagram,
      isPublic: diagram.isPublic,
      createdAt: diagram.createdAt.toISOString(),
      updatedAt: diagram.updatedAt.toISOString(),
    };
  }
}
