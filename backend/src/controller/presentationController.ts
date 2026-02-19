import { Controller, Get, Post, Delete, Route, Tags, Body, Path, Security, Request } from "tsoa";
import prisma from "../prisma/prismaClient";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { slideGenerationService } from "../services/slideGenerationService";

interface GeneratePresentationRequest {
  templateId: string;
  contextIds: string[];
  prompt: string;
  title?: string;
}

interface PresentationResponse {
  id: string;
  userId: string;
  templateId: string;
  title: string;
  slidesJson: unknown;
  contextIds: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/presentations")
@Tags("Presentations")
@Security("ClientLevel")
export class PresentationController extends Controller {
  @Post("generate")
  public async generatePresentation(
    @Body() body: GeneratePresentationRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);

    const presentation = await slideGenerationService.generatePresentation(
      user.id,
      body.templateId,
      body.contextIds,
      body.prompt,
      body.title,
    );

    this.setStatus(201);
    return presentation;
  }

  @Get("")
  public async listPresentations(
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse[]> {
    const user = await this.resolveUser(request);
    return slideGenerationService.listPresentations(user.id);
  }

  @Get("{presentationId}")
  public async getPresentation(
    @Path() presentationId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);
    return slideGenerationService.getPresentationById(user.id, presentationId);
  }

  @Delete("{presentationId}")
  public async deletePresentation(
    @Path() presentationId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const user = await this.resolveUser(request);
    await slideGenerationService.deletePresentation(user.id, presentationId);
    return { success: true };
  }

  private async resolveUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    return user;
  }
}
