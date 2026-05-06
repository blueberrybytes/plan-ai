import { Controller, Get, Route, Tags, Path } from "tsoa";
import { docGenerationService } from "../services/docGenerationService";

interface PublicBrandTheme {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  backgroundStyle: string | null;
  cardStyle: string | null;
}

interface PublicDocResponse {
  id: string;
  title: string;
  content: string;
  theme: PublicBrandTheme | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/public/documents")
@Tags("Public Documents")
export class PublicDocController extends Controller {
  @Get("{id}")
  public async getPublicDoc(@Path() id: string): Promise<PublicDocResponse> {
    const doc = await docGenerationService.findPublicById(id);

    let themeObj: PublicBrandTheme | null = null;
    if (doc.theme) {
      themeObj = {
        id: doc.theme.id,
        name: doc.theme.name,
        logoUrl: doc.theme.logoUrl,
        primaryColor: doc.theme.primaryColor,
        secondaryColor: doc.theme.secondaryColor,
        backgroundColor: doc.theme.backgroundColor,
        textColor: doc.theme.textColor,
        headingFont: doc.theme.headingFont,
        bodyFont: doc.theme.bodyFont,
        backgroundStyle: doc.theme.backgroundStyle,
        cardStyle: doc.theme.cardStyle,
      };
    }

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      theme: themeObj,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
