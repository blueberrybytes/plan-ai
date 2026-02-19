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
import {
  slideTemplateService,
  CreateTemplateInput,
  UpdateTemplateInput,
  SlideTypeConfigInput,
} from "../services/slideTemplateService";

interface CreateTemplateRequest {
  name: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl?: string;
  slideTypes?: SlideTypeConfigInput[];
}

interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl?: string;
  slideTypes?: SlideTypeConfigInput[];
}

interface SlideTemplateResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  slideTypes: SlideTypeConfigResponse[];
}

interface SlideTypeConfigResponse {
  id: string;
  templateId: string;
  slideTypeKey: string;
  displayName: string;
  description: string | null;
  parametersSchema: unknown;
  position: number;
  createdAt: Date;
}

@Route("api/slide-templates")
@Tags("Slide Templates")
@Security("ClientLevel")
export class SlideTemplateController extends Controller {
  @Get("")
  public async listTemplates(
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse[]> {
    const user = await this.resolveUser(request);
    return slideTemplateService.getTemplates(user.id);
  }

  @Get("{templateId}")
  public async getTemplate(
    @Path() templateId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse> {
    const user = await this.resolveUser(request);
    return slideTemplateService.getTemplateById(user.id, templateId);
  }

  @Post("")
  public async createTemplate(
    @Body() body: CreateTemplateRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse> {
    const user = await this.resolveUser(request);
    const input: CreateTemplateInput = {
      userId: user.id,
      ...body,
    };
    this.setStatus(201);
    return slideTemplateService.createTemplate(input);
  }

  @Put("{templateId}")
  public async updateTemplate(
    @Path() templateId: string,
    @Body() body: UpdateTemplateRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse> {
    const user = await this.resolveUser(request);
    const input: UpdateTemplateInput = { ...body };
    return slideTemplateService.updateTemplate(user.id, templateId, input);
  }

  @Delete("{templateId}")
  public async deleteTemplate(
    @Path() templateId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const user = await this.resolveUser(request);
    await slideTemplateService.deleteTemplate(user.id, templateId);
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
