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

export interface CreateDiagramRequest {
  title: string;
  prompt: string;
  type: "FLOWCHART" | "SEQUENCE" | "GANTT" | "MINDMAP" | "CLASS" | "ER" | "ARCHITECTURE";
  theme?: string;
  contextIds?: string[];
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
  theme?: string;
  status?: "GENERATING" | "DRAFT" | "FAILED";
}

export interface DiagramResponse {
  id: string;
  title: string;
  prompt: string;
  mermaidCode: string | null;
  type: string;
  theme: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramListResponse {
  diagrams: DiagramResponse[];
}

@Route("api/diagrams")
@Tags("Diagrams")
export class DiagramController extends Controller {
  @Get("/")
  @Security("ClientLevel")
  public async getUserDiagrams(
    @Request() request: AuthenticatedRequest,
  ): Promise<DiagramListResponse> {
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    const diagrams = await prisma.diagram.findMany({
      where: {
        userId: user.id,
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
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    const diagram = await prisma.diagram.findUnique({
      where: { id: diagramId },
    });

    if (!diagram || diagram.userId !== user.id) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    return {
      ...diagram,
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
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    let initialSyntax = `%% ${body.title} - ${body.type}\n`;
    if (body.type === "FLOWCHART") initialSyntax += "flowchart TD\n";
    if (body.type === "ARCHITECTURE") initialSyntax += "architecture-beta\n";
    if (body.type === "SEQUENCE") initialSyntax += "sequenceDiagram\n";
    if (body.type === "MINDMAP") initialSyntax += "mindmap\n  root";
    if (body.type === "GANTT") initialSyntax += `gantt\n  title ${body.title}`;

    const diagram = await prisma.diagram.create({
      data: {
        userId: user.id,
        title: body.title,
        prompt: body.prompt,
        type: body.type as DiagramType,
        theme: body.theme || "BlueBerryBytes",
        contextIds: body.contextIds || [],
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
          prompt: body.prompt,
          type: body.type,
          contextIds: body.contextIds || [],
          transcriptIds: body.transcriptIds || [],
        })
        .catch(console.error);
    }

    return {
      ...diagram,
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
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    const current = await prisma.diagram.findUnique({
      where: { id: diagramId },
    });

    if (!current || current.userId !== user.id) {
      this.setStatus(404);
      throw new Error("Diagram not found");
    }

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        title: body.title,
        mermaidCode: body.mermaidCode,
        theme: body.theme,
        status: body.status,
      },
    });

    return {
      ...updated,
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
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    const current = await prisma.diagram.findUnique({
      where: { id: diagramId },
    });

    if (!current || current.userId !== user.id) {
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
    if (!request.user) throw new Error("Unauthorized");
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });
    if (!user) {
      this.setStatus(401);
      throw new Error("User not found");
    }

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId, userId: user.id },
    });

    if (!diagram) {
      this.setStatus(404);
      throw new Error("Diagram not found or not owned by user");
    }

    const updatedDiagram = await prisma.diagram.update({
      where: { id: diagramId },
      data: { status: "GENERATING" },
    });

    // Fire & Forget the improvement task
    diagramGenerationService
      .triggerImprovement({
        diagramId: diagram.id,
        userId: user.id,
        instruction: body.instruction,
        currentCode: body.currentCode || diagram.mermaidCode || "",
        contextIds: diagram.contextIds,
        transcriptIds: diagram.transcriptIds,
      })
      .catch(console.error);

    return {
      ...updatedDiagram,
      createdAt: updatedDiagram.createdAt.toISOString(),
      updatedAt: updatedDiagram.updatedAt.toISOString(),
    };
  }
}
