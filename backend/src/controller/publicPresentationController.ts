/* eslint-disable @typescript-eslint/no-empty-object-type */
import { Controller, Get, Route, Tags, Path } from "tsoa";
import { slideGenerationService } from "../services/slideGenerationService";
import { type Presentation } from "@prisma/client";

// Define response type here or import from shared location.
// For simplicity, we use the same structure as PresentationController's expectation
// essentially ensuring we return minimal data needed for rendering.
interface PublicPresentationResponse extends Presentation {
  // Prisma types include all fields.
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
    return slideGenerationService.getPublicPresentationById(presentationId);
  }
}
