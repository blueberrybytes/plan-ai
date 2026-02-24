import {
  Controller,
  Get,
  Post,
  Put,
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
import { docThemeService, CreateDocThemeInput } from "../services/docThemeService";

interface DocThemeResponse {
  id: string;
  userId: string;
  name: string;
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/doc-themes")
@Tags("Doc Themes")
@Security("ClientLevel")
export class DocThemeController extends Controller {
  @Get("")
  public async list(@Request() request: AuthenticatedRequest): Promise<DocThemeResponse[]> {
    const user = await this.resolveUser(request);
    return docThemeService.findAll(user.id);
  }

  @Get("{id}")
  public async getById(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocThemeResponse> {
    const user = await this.resolveUser(request);
    return docThemeService.findById(user.id, id);
  }

  @Post("")
  public async create(
    @Body() body: CreateDocThemeInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocThemeResponse> {
    const user = await this.resolveUser(request);
    this.setStatus(201);
    return docThemeService.create(user.id, body);
  }

  @Put("{id}")
  public async update(
    @Path() id: string,
    @Body() body: Partial<CreateDocThemeInput>,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocThemeResponse> {
    const user = await this.resolveUser(request);
    return docThemeService.update(user.id, id, body);
  }

  @Delete("{id}")
  public async delete(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const user = await this.resolveUser(request);
    await docThemeService.delete(user.id, id);
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
