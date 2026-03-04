import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Route,
  Tags,
  Body,
  Path,
  Security,
  Request,
} from "tsoa";
import { type Presentation, type SlideTemplate } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { type TsoaJsonObject } from "./controllerTypes";
import { slideGenerationService } from "../services/slideGenerationService";

interface GeneratePresentationRequest {
  templateId: string;
  contextIds: string[];
  prompt: string;
  title?: string;
  numSlides?: number;
}

interface UpdatePresentationRequest {
  title?: string;
  status?: string;
}

interface UpdatePresentationStatusRequest {
  status: string;
}

interface TemplateSubset {
  name: string;
  description: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  backgroundStyle: string | null;
  cardStyle: string | null;
  logoUrl: string | null;
}

interface PresentationResponse {
  id: string;
  userId: string;
  templateId: string;
  template?: TemplateSubset;
  title: string;
  slidesJson: TsoaJsonObject | null;
  contextIds: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Route("api/presentations")
@Tags("Presentations")
@Security("ClientLevel")
export class PresentationController extends Controller {
  @Post("generate")
  public async generatePresentation(
    @Body() body: GeneratePresentationRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);

    const presentation = await slideGenerationService.startPresentationGeneration(
      user.id,
      body.templateId,
      body.contextIds,
      body.prompt,
      body.title,
      body.numSlides,
    );

    this.setStatus(201);
    return this.mapPresentationResponse(presentation);
  }

  @Post("demo")
  public async generateDemoPresentation(
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);

    let template = await prisma.slideTemplate.findFirst({
      where: { userId: user.id },
    });

    if (!template) {
      template = await prisma.slideTemplate.findFirst();
    }

    const demoSlides = [
      {
        slideTypeKey: "title_only",
        parameters: {
          title: "Q1 Strategy Review",
          subtitle: "Building the future, one sprint at a time",
          iconName: "AutoAwesome",
        },
      },
      {
        slideTypeKey: "text_block",
        parameters: {
          title: "Our Mission",
          subtitle: "The driving force behind our innovation",
          iconName: "Lightbulb",
          body: "We are building the next generation of AI-powered project management tools that help teams ship faster, communicate better, and make smarter decisions with real-time insights from every meeting and conversation.",
        },
      },
      {
        slideTypeKey: "text_image",
        parameters: {
          title: "Product Demo",
          body: "Our platform integrates directly with your workflow, providing AI-generated tasks from meeting transcripts and real-time project tracking.",
          imageQuery: "productivity dashboard",
        },
      },
      {
        slideTypeKey: "bullet_list",
        parameters: {
          title: "Key Features",
          subtitle: "Everything you need to scale your workflows",
          bullets: [
            "AI-powered transcript analysis",
            "Automatic task generation",
            "Real-time collaboration",
            "Integration with Jira & Linear",
            "Custom branded presentations",
          ],
        },
      },
      {
        slideTypeKey: "two_columns",
        parameters: {
          title: "Before vs After",
          leftTitle: "Manual Process",
          leftBody:
            "Hours spent writing meeting notes, manually creating tickets, and tracking follow-ups across spreadsheets.",
          rightTitle: "With Plan AI",
          rightBody:
            "Automatic transcription, AI-generated tasks, and seamless integration with your project management tools.",
        },
      },
      {
        slideTypeKey: "team_grid",
        parameters: {
          title: "Our Team",
          members: [
            { name: "Alex Chen", role: "CEO & Founder", bio: "10+ years in product management" },
            { name: "Maria Lopez", role: "CTO", bio: "Former lead engineer at Scale AI" },
            { name: "James Park", role: "Head of Design", bio: "Award-winning UX designer" },
            { name: "Sara Ahmed", role: "VP Engineering", bio: "Building teams that ship" },
          ],
        },
      },
      {
        slideTypeKey: "showcase",
        parameters: {
          title: "Live Dashboard",
          imageQuery: "analytics dashboard",
          caption:
            "Real-time project insights at your fingertips — track velocity, blockers, and team health all in one view.",
        },
      },
      {
        slideTypeKey: "stats",
        parameters: {
          badge: "Performance",
          title: "Q1 Results",
          stats: [
            { label: "Revenue Growth", value: "+42%" },
            { label: "Active Users", value: "12.4K" },
            { label: "NPS Score", value: "78" },
            { label: "Uptime", value: "99.9%" },
          ],
        },
      },
      {
        slideTypeKey: "split_kpi",
        parameters: {
          badge: "The Impact",
          title: "Radical Delivery Efficiency",
          imageQuery: "modern clean startup office",
          kpis: [
            {
              value: ">50%",
              label: "Time Saved",
              description: "On manual resizing & exporting tasks",
            },
            {
              value: "0",
              label: "Brand Errors",
              description: "Zero typographic or color mismatches",
            },
            { value: "100%", label: "Strategic Focus", description: "More time for big ideas" },
          ],
        },
      },
      {
        slideTypeKey: "split_cards",
        parameters: {
          badge: "Technical Core",
          title: "Smart Backgrounds & Adaptive Typography",
          imageQuery: "abstract 3d architecture blue",
          cards: [
            {
              title: "Generative AI",
              body: "Outpainting backgrounds to fit any ratio without losing quality.",
              iconName: "AutoAwesome",
            },
            {
              title: "Dynamic Rendering",
              body: "Design rules that guarantee legible text across all formats.",
              iconName: "TextFields",
            },
            {
              title: "Multiformat Export",
              body: "Generate all campaign pieces with a single click.",
              iconName: "Download",
            },
          ],
        },
      },
      {
        slideTypeKey: "image_with_list",
        parameters: {
          badge: "The Problem",
          title: "The Hell of Manual Adaptations",
          body: "Each campaign requires dozens of formats. Every adaptation is an opportunity for error.",
          imageQuery: "broken graphic design layers",
          features: [
            {
              title: "Distortion & Cropping",
              description:
                "Going from 1080x1080 to 9:16 without losing essence is a daily nightmare.",
            },
            {
              title: "Text Overflow",
              description: "The copy that worked in a square spills over in a landscape or story.",
            },
            {
              title: "Brand Inconsistency",
              description: "Replicating fonts and colors 50 times multiplies human error.",
            },
          ],
        },
      },
      {
        slideTypeKey: "three_columns",
        parameters: {
          badge: "Our Vision",
          title: "Not an Editor, your Intelligent Assistant",
          subtitle: "A system that thinks with you, not just executes. Built to empower your team.",
          columns: [
            {
              title: "Ideation over Edition",
              body: "AI suggests backgrounds and variations predicting creative needs.",
              iconName: "Lightbulb",
            },
            {
              title: "Total Context",
              body: "A system that 'knows' the brand manual: colors, typography, tone of voice.",
              iconName: "Psychology",
            },
            {
              title: "Zero Friction",
              body: "Direct integration with the tools you already use: Figma, Photoshop, etc.",
              iconName: "Settings",
            },
          ],
        },
      },
      {
        slideTypeKey: "quote_showcase",
        parameters: {
          badge: "Before Agency",
          statement: "Automating 90% of the manual work to free up 100% of the strategic talent.",
          imageQuery: "futuristic sleek server room blue",
        },
      },
    ];

    const presentation = await prisma.presentation.create({
      data: {
        userId: user.id,
        templateId: template ? template.id : "default",
        title: "All Layouts Demo",
        status: "COMPLETED",
        slidesJson: demoSlides,
      },
      include: {
        template: true,
      },
    });

    this.setStatus(201);
    return this.mapPresentationResponse(presentation);
  }

  @Get("")
  public async listPresentations(
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse[]> {
    const user = await this.resolveUser(request);
    const presentations = await slideGenerationService.listPresentations(user.id);
    return presentations.map((p) => this.mapPresentationResponse(p));
  }

  @Get("{presentationId}")
  public async getPresentation(
    @Path() presentationId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);
    const presentation = await slideGenerationService.getPresentationById(user.id, presentationId);
    return this.mapPresentationResponse(presentation);
  }

  @Delete("{presentationId}")
  public async deletePresentation(
    @Path() presentationId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const user = await this.resolveUser(request);
    await slideGenerationService.deletePresentation(user.id, presentationId);
    return { success: true };
  }

  @Patch("{presentationId}")
  public async updatePresentation(
    @Path() presentationId: string,
    @Body() body: UpdatePresentationRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);
    const presentation = await slideGenerationService.updatePresentation(
      user.id,
      presentationId,
      body,
    );
    return this.mapPresentationResponse(presentation);
  }

  @Patch("{presentationId}/status")
  public async updatePresentationStatus(
    @Path() presentationId: string,
    @Body() body: UpdatePresentationStatusRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<PresentationResponse> {
    const user = await this.resolveUser(request);
    const presentation = await slideGenerationService.updateStatus(
      user.id,
      presentationId,
      body.status,
    );
    return this.mapPresentationResponse(presentation);
  }

  private mapPresentationResponse(
    presentation: Presentation & { template?: SlideTemplate | null },
  ): PresentationResponse {
    return {
      id: presentation.id,
      userId: presentation.userId,
      templateId: presentation.templateId,
      template: presentation.template
        ? {
            name: presentation.template.name,
            description: presentation.template.description,
            primaryColor: presentation.template.primaryColor,
            secondaryColor: presentation.template.secondaryColor,
            backgroundColor: presentation.template.backgroundColor,
            headingFont: presentation.template.headingFont,
            bodyFont: presentation.template.bodyFont,
            backgroundStyle: presentation.template.backgroundStyle,
            cardStyle: presentation.template.cardStyle,
            logoUrl: presentation.template.logoUrl,
          }
        : undefined,
      title: presentation.title,
      slidesJson: presentation.slidesJson as TsoaJsonObject | null,
      contextIds: presentation.contextIds,
      status: presentation.status,
      createdAt: presentation.createdAt,
      updatedAt: presentation.updatedAt,
    };
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
