import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Route,
  Tags,
  Body,
  Path,
  Security,
  Request,
} from "tsoa";
import prisma from "../prisma/prismaClient";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  docGenerationService,
  CreateDocInput,
  UpdateDocInput,
} from "../services/docGenerationService";

interface DocThemeSummary {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
}

interface DocDocumentResponse {
  id: string;
  userId: string;
  title: string;
  content: string;
  status: string;
  isPublic: boolean;
  contextIds: string[];
  transcriptIds: string[];
  prompt: string | null;
  themeId: string | null;
  theme: DocThemeSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/documents")
@Tags("Documents")
@Security("ClientLevel")
export class DocController extends Controller {
  @Get("")
  public async list(@Request() request: AuthenticatedRequest): Promise<DocDocumentResponse[]> {
    const user = await this.resolveUser(request);
    const docs = await docGenerationService.findAll(user.id);
    return docs as DocDocumentResponse[];
  }

  @Get("{id}")
  public async getById(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const user = await this.resolveUser(request);
    return docGenerationService.findById(user.id, id) as Promise<DocDocumentResponse>;
  }

  @Post("")
  public async create(
    @Body() body: CreateDocInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const user = await this.resolveUser(request);
    this.setStatus(202);
    return docGenerationService.startGeneration(user.id, body) as Promise<DocDocumentResponse>;
  }

  @Patch("{id}")
  public async update(
    @Path() id: string,
    @Body() body: UpdateDocInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const user = await this.resolveUser(request);
    return docGenerationService.update(user.id, id, body) as Promise<DocDocumentResponse>;
  }

  @Delete("{id}")
  public async delete(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const user = await this.resolveUser(request);
    await docGenerationService.delete(user.id, id);
    return { success: true };
  }

  private async resolveUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }
    const user = await prisma.user.findUnique({ where: { firebaseUid: request.user.uid } });
    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }
    return user;
  }
}
