import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { Get, Post, Patch, Delete, Route, Tags, Body, Path, Security, Request } from "tsoa";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { brandThemeService, CreateBrandThemeInput } from "../services/brandThemeService";
import { WebsiteThemeAnalyzerService } from "../services/websiteThemeAnalyzerService";

export interface AnalyzeUrlRequest {
  url: string;
}

export interface AnalyzeUrlResponse {
  suggestedName: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  headingFont: string;
  bodyFont: string;
  candidateLogos: string[];
}

interface BrandThemeResponse {
  id: string;
  userId: string;
  name: string;
  logoUrl: string | null;
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundStyle: string | null;
  cardStyle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/brand-themes")
@Tags("Brand Themes")
@Security("ClientLevel")
export class BrandThemeController extends BaseWorkspaceController {
  @Get("")
  public async list(@Request() request: AuthenticatedRequest): Promise<BrandThemeResponse[]> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const themes = await brandThemeService.findAll(user.id, workspaceId);
    return themes as BrandThemeResponse[];
  }

  @Get("{id}")
  public async getById(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<BrandThemeResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return brandThemeService.findById(user.id, workspaceId, id) as Promise<BrandThemeResponse>;
  }

  @Post("")
  public async create(
    @Body() body: CreateBrandThemeInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<BrandThemeResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    this.setStatus(201);
    return brandThemeService.create(user.id, {
      ...body,
      workspaceId,
    }) as Promise<BrandThemeResponse>;
  }

  @Post("analyze-url")
  public async analyzeUrl(
    @Body() body: AnalyzeUrlRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<AnalyzeUrlResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const analyzer = new WebsiteThemeAnalyzerService();
    return analyzer.analyzeUrl(body.url, workspaceId);
  }

  @Patch("{id}")
  public async update(
    @Path() id: string,
    @Body() body: Partial<CreateBrandThemeInput>,
    @Request() request: AuthenticatedRequest,
  ): Promise<BrandThemeResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return brandThemeService.update(user.id, workspaceId, id, body) as Promise<BrandThemeResponse>;
  }

  @Delete("{id}")
  public async delete(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await brandThemeService.delete(user.id, workspaceId, id);
    return { success: true };
  }
}
