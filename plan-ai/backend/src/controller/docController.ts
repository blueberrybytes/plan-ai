import { BaseWorkspaceController } from "./BaseWorkspaceController";
import {
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
  FormField,
  UploadedFile,
} from "tsoa";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  docGenerationService,
  CreateDocInput,
  UpdateDocInput,
} from "../services/docGenerationService";
import { extractTextFromUpload } from "../utils/documentTextExtractor";

interface BrandThemeSummary {
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

export interface DocDocumentResponse {
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
  theme: BrandThemeSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/documents")
@Tags("Documents")
@Security("ClientLevel")
export class DocController extends BaseWorkspaceController {
  @Get("")
  public async list(@Request() request: AuthenticatedRequest): Promise<DocDocumentResponse[]> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const docs = await docGenerationService.findAll(user.id, workspaceId);
    return docs as unknown as DocDocumentResponse[];
  }

  @Get("{id}")
  public async getById(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return docGenerationService.findById(
      user.id,
      workspaceId,
      id,
    ) as unknown as Promise<DocDocumentResponse>;
  }

  @Post("")
  public async create(
    @Body() body: CreateDocInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    this.setStatus(202);
    return docGenerationService.startGeneration(
      user.id,
      workspaceId,
      body,
    ) as unknown as Promise<DocDocumentResponse>;
  }

  @Post("import")
  public async importDoc(
    @Request() request: AuthenticatedRequest,
    @UploadedFile("file") file: Express.Multer.File,
    @FormField() contextIds?: string,
    @FormField() transcriptIds?: string,
    @FormField() themeId?: string,
  ): Promise<DocDocumentResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // Parse the file and extract raw text
    const extractedText = await extractTextFromUpload(file);

    // Parse arrays
    const parsedContextIds = contextIds ? JSON.parse(contextIds) : [];
    const parsedTranscriptIds = transcriptIds ? JSON.parse(transcriptIds) : [];

    // Fallback title to original file name
    const title = file.originalname.replace(/\.[^/.]+$/, "") || "Imported Document";

    // Trigger the generation
    const prompt = `Please convert the following raw imported document text into a well-formatted Markdown document, preserving all sections, lists, and hierarchy. Ensure it is clean, structured, and easy to read.\n\n<IMPORTED_DOCUMENT>\n${extractedText}\n</IMPORTED_DOCUMENT>`;

    this.setStatus(202);
    return docGenerationService.startGeneration(user.id, workspaceId, {
      title,
      prompt,
      contextIds: parsedContextIds,
      transcriptIds: parsedTranscriptIds,
      themeId,
    }) as unknown as Promise<DocDocumentResponse>;
  }

  @Patch("{id}")
  public async update(
    @Path() id: string,
    @Body() body: UpdateDocInput,
    @Request() request: AuthenticatedRequest,
  ): Promise<DocDocumentResponse> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return docGenerationService.update(
      user.id,
      workspaceId,
      id,
      body,
    ) as unknown as Promise<DocDocumentResponse>;
  }

  @Delete("{id}")
  public async delete(
    @Path() id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    await docGenerationService.delete(user.id, workspaceId, id);
    return { success: true };
  }

  @Post("assistant/mermaid-fix")
  public async fixMermaid(
    @Body() body: { brokenCode: string },
    @Request() request: AuthenticatedRequest,
  ): Promise<{ fixedCode: string }> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const fixedCode = await docGenerationService.fixMermaidSyntax(user.id, workspaceId, body.brokenCode);
    return { fixedCode };
  }
}
