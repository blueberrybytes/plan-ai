import { Controller, Get, Route, Tags, Path } from "tsoa";
import { type DocDocument } from "@prisma/client";
import { docGenerationService } from "../services/docGenerationService";

interface PublicDocTheme {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
}

interface PublicDocResponse {
  id: string;
  title: string;
  content: string;
  theme: PublicDocTheme | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/public/documents")
@Tags("Public Documents")
export class PublicDocController extends Controller {
  @Get("{id}")
  public async getPublicDoc(@Path() id: string): Promise<PublicDocResponse> {
    const doc = await docGenerationService.findPublicById(id);
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      theme: (doc as DocDocument & { theme?: PublicDocTheme | null }).theme ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
