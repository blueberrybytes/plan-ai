import { Controller, Get, Route, Tags, Path } from "tsoa";
import { type Presentation, type BrandTheme } from "@prisma/client";
import { slideGenerationService } from "../services/slideGenerationService";
import { type TsoaJsonObject } from "./controllerTypes";

interface PublicPresentationResponse {
  id: string;
  userId: string;
  templateId: string | null;
  themeId: string | null;
  theme: BrandTheme | null;
  title: string;
  slidesJson: TsoaJsonObject | null;
  contextIds: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/public/presentations")
@Tags("Public Presentations")
export class PublicPresentationController extends Controller {
  /**
   * Get a presentation for public viewing.
   * No authentication required.
   */
  @Get("{presentationId}")
  public async getPublicPresentation(
    @Path() presentationId: string,
  ): Promise<PublicPresentationResponse> {
    const presentation = await slideGenerationService.getPublicPresentationById(presentationId);

    return this.mapPublicPresentationResponse(presentation);
  }

  private mapPublicPresentationResponse(
    presentation: Presentation & { theme?: BrandTheme | null },
  ): PublicPresentationResponse {
    return {
      id: presentation.id,
      userId: presentation.userId,
      templateId: presentation.templateId,
      themeId: presentation.themeId,
      theme: presentation.theme || null,
      title: presentation.title,
      slidesJson: presentation.slidesJson as TsoaJsonObject | null,
      contextIds: presentation.contextIds,
      status: presentation.status,
      createdAt: presentation.createdAt,
      updatedAt: presentation.updatedAt,
    };
  }
}
