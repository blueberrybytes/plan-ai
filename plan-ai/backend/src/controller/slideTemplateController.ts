import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { Get, Post, Put, Delete, Route, Tags, Body, Path, Security, Request } from "tsoa";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  slideTemplateService,
  CreateTemplateInput,
  UpdateTemplateInput,
  SlideTypeConfigInput,
} from "../services/slideTemplateService";
import { type TsoaJsonObject } from "./controllerTypes";

interface SlideTypeConfigBody {
  slideTypeKey: string;
  displayName: string;
  description?: string | null;
  parametersSchema: TsoaJsonObject;
  position?: number;
}

interface CreateTemplateRequest {
  name: string;
  description?: string;
  logoUrl?: string;
  slideTypes?: SlideTypeConfigBody[];
}

interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  logoUrl?: string;
  slideTypes?: SlideTypeConfigBody[];
}

interface SlideTemplateResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
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
  parametersSchema: TsoaJsonObject;
  position: number;
  createdAt: Date;
}

@Route("api/slide-templates")
@Tags("Slide Templates")
@Security("ClientLevel")
export class SlideTemplateController extends BaseWorkspaceController {
  @Get("")
  public async listTemplates(
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse[]> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return slideTemplateService.getTemplates(user.id, workspaceId);
  }

  @Get("{templateId}")
  public async getTemplate(
    @Path() templateId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return slideTemplateService.getTemplateById(user.id, workspaceId, templateId);
  }

  @Post("")
  public async createTemplate(
    @Body() body: CreateTemplateRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<SlideTemplateResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const input: CreateTemplateInput = {
      userId: user.id,
      workspaceId,
      ...body,
      slideTypes: body.slideTypes as SlideTypeConfigInput[] | undefined,
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
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const input: UpdateTemplateInput = {
      ...body,
      slideTypes: body.slideTypes as SlideTypeConfigInput[] | undefined,
    };
    return slideTemplateService.updateTemplate(user.id, workspaceId, templateId, input);
  }

  @Delete("{templateId}")
  public async deleteTemplate(
    @Path() templateId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await slideTemplateService.deleteTemplate(user.id, workspaceId, templateId);
    return { success: true };
  }
}
