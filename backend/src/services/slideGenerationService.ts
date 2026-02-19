import { Presentation, Prisma } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z, type ZodTypeAny } from "zod";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { slideTemplateService, TemplateWithSlideTypes } from "./slideTemplateService";
import { buildSlideTypeCatalog } from "./slideTypeRegistry";
import { imageGenerationService } from "./imageGenerationService";

// Loose wrapper around generateObject to handle type compatibility
const generateObjectLoose = generateObject as unknown as (args: {
  model: unknown;
  schema: ZodTypeAny;
  prompt: string;
  temperature?: number;
}) => Promise<{ object: unknown }>;

// Schema for a single generated slide
const GeneratedSlideSchema = z.object({
  slideTypeKey: z.string(),
  parameters: z.record(z.unknown()),
});

// Schema for the full AI output
const SlidePlanSchema = z.object({
  title: z.string(),
  slides: z.array(GeneratedSlideSchema),
});

type SlidePlan = z.infer<typeof SlidePlanSchema>;

export class SlideGenerationService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });

  private readonly modelName = "google/gemini-2.0-flash-001";

  /**
   * Generate a presentation from a template, context, and user prompt.
   */
  public async generatePresentation(
    userId: string,
    templateId: string,
    contextIds: string[],
    prompt: string,
    title?: string,
  ): Promise<Presentation> {
    // 1. Load template + slide types
    const template = await slideTemplateService.getTemplateById(userId, templateId);

    // 2. Retrieve context via RAG
    let contextText = "";
    if (contextIds.length > 0) {
      try {
        const chunks = await queryContexts(contextIds, prompt, 1000);
        if (chunks.length > 0) {
          contextText = `\nRetrieved context from knowledge base:\n${chunks.join("\n\n")}\n`;
        }
      } catch (error) {
        logger.warn("Failed to retrieve context for slide generation", error);
      }
    }

    // 3. Build AI prompt
    const aiPrompt = this.buildPrompt(template, contextText, prompt);

    // 4. Generate slide plan via AI
    const slidePlan = await this.generateSlidePlan(aiPrompt);

    // 5. Persist presentation
    const presentation = await prisma.presentation.create({
      data: {
        userId,
        templateId,
        title: title || slidePlan.title,
        slidesJson: slidePlan.slides as unknown as Prisma.InputJsonValue,
        contextIds,
        status: "GENERATING_IMAGES", // New status or keep DRAFT but update later? keeping DRAFT but will update slides.
      },
    });

    // 6. Generate images asynchronously
    await this.processSlideImages(userId, presentation.id, slidePlan.slides, template);

    // 7. Update presentation with image URLs
    const finalPresentation = await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        slidesJson: slidePlan.slides as unknown as Prisma.InputJsonValue,
        status: "DRAFT", // Ready for review
      },
    });

    logger.info(
      `Generated presentation "${presentation.title}" (${presentation.id}) with image assets`,
    );

    return finalPresentation;
  }

  /**
   * List presentations for a user.
   */
  public async listPresentations(userId: string): Promise<Presentation[]> {
    return prisma.presentation.findMany({
      where: { userId },
      include: { template: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Get a presentation by ID.
   */
  public async getPresentationById(userId: string, presentationId: string): Promise<Presentation> {
    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, userId },
    });

    if (!presentation) {
      throw { status: 404, message: "Presentation not found" };
    }

    return presentation;
  }

  /**
   * Get a public presentation by ID (no user check).
   */
  public async getPublicPresentationById(presentationId: string): Promise<Presentation> {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { template: true },
    });

    if (!presentation) {
      throw { status: 404, message: "Presentation not found" };
    }

    return presentation;
  }

  /**
   * Delete a presentation.
   */
  public async deletePresentation(userId: string, presentationId: string): Promise<void> {
    await this.getPresentationById(userId, presentationId);
    await prisma.presentation.delete({ where: { id: presentationId } });
    logger.info(`Deleted presentation ${presentationId}`);
  }

  public async updateStatus(
    userId: string,
    presentationId: string,
    status: string,
  ): Promise<Presentation> {
    await this.getPresentationById(userId, presentationId);
    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: { status },
    });
    logger.info(`Updated presentation ${presentationId} status to ${status}`);
    return updated;
  }

  public async updatePresentation(
    userId: string,
    presentationId: string,
    data: { title?: string; status?: string },
  ): Promise<Presentation> {
    await this.getPresentationById(userId, presentationId);
    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data,
    });
    logger.info(`Updated presentation ${presentationId}`);
    return updated;
  }

  private buildPrompt(
    template: TemplateWithSlideTypes,
    contextText: string,
    userPrompt: string,
  ): string {
    const enabledTypes = template.slideTypes.map((st) => st.slideTypeKey);
    const catalog = buildSlideTypeCatalog(enabledTypes.length > 0 ? enabledTypes : undefined);

    return `You are a presentation architect. Your job is to create a structured slide deck.

## Available Slide Types

${catalog}

## Rules

1. You MUST use ONLY slide types from the list above.
2. Each slide's "parameters" MUST follow the constraints (max characters, max items).
3. Choose slide types that best fit the content. Do NOT repeat the same type consecutively unless necessary.
4. Keep text concise and impactful — presentations are visual, not essays.
5. Aim for 6-12 slides unless the content requires more.
6. Start with a "title_only" slide and end with a "title_only" slide (as a closing slide).
7. Return a JSON object with "title" (string) and "slides" (array of { slideTypeKey, parameters }).

## Template Brand

- Template name: "${template.name}"
${template.description ? `- Description: "${template.description}"` : ""}

## Context

${contextText || "No additional context provided."}

## User Request

${userPrompt}`;
  }

  private async generateSlidePlan(prompt: string): Promise<SlidePlan> {
    const model = this.openrouter(this.modelName);

    try {
      const { object } = await generateObjectLoose({
        model,
        schema: SlidePlanSchema as ZodTypeAny,
        prompt,
        temperature: 0.3,
      });

      return SlidePlanSchema.parse(object);
    } catch (error) {
      logger.error("Failed to generate slide plan with AI", error);
      throw new Error("Failed to generate presentation content");
    }
  }

  private async processSlideImages(
    userId: string,
    presentationId: string,
    slides: { slideTypeKey: string; parameters: Record<string, unknown> }[],
    template: TemplateWithSlideTypes,
  ) {
    logger.info(`Processing images for presentation ${presentationId}`);

    // Iterate serially to avoid rate limits or parallel if quota allows
    // Parallel with limit is better.
    const imagePromises = slides.map(async (slide) => {
      const params = slide.parameters;
      if (typeof params.imageQuery === "string" && params.imageQuery.trim().length > 0) {
        // Enhance prompt with theme context
        const themeContext = `Style: ${template.name}. Colors: Primary ${template.primaryColor}, Secondary ${template.secondaryColor}, Background ${template.backgroundColor}.`;
        const fullPrompt = `${params.imageQuery}. ${themeContext}`;

        // Generate image
        const imageUrl = await imageGenerationService.generateAndStoreImage(
          fullPrompt,
          userId,
          presentationId,
        );

        if (imageUrl) {
          // Explicitly cast to assign the new property
          (slide.parameters as Record<string, unknown>).imageUrl = imageUrl;
        }
      }
    });

    await Promise.all(imagePromises);
  }
}

export const slideGenerationService = new SlideGenerationService();
