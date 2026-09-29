import { Controller, Get, Route, Tags, Path } from "tsoa";
import { type Presentation, type BrandTheme } from "@prisma/client";
import { slideGenerationService } from "../services/slideGenerationService";
import { type TsoaJsonObject } from "./controllerTypes";
import { signSlideImages } from "../utils/slideImages";

interface PublicPresentationResponse {
  id: string;
  templateId: string | null;
  themeId: string | null;
  theme: BrandTheme | null;
  title: string;
  slidesJson: TsoaJsonObject | null;
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

    return this.mapPublicPresentationResponse({
      ...presentation,
      slidesJson: await signSlideImages(presentation.slidesJson),
    });
  }

  private mapPublicPresentationResponse(
    presentation: Presentation & { theme?: BrandTheme | null },
  ): PublicPresentationResponse {
    return {
      id: presentation.id,
      templateId: presentation.templateId,
      themeId: presentation.themeId,
      theme: presentation.theme || null,
      title: presentation.title,
      slidesJson: presentation.slidesJson as TsoaJsonObject | null,
      status: presentation.status,
      createdAt: presentation.createdAt,
      updatedAt: presentation.updatedAt,
    };
  }
}
