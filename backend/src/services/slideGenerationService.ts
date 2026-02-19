/* eslint-disable @typescript-eslint/no-explicit-any */
import { Presentation, Prisma } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, streamObject } from "ai";
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
  /**
   * Start the presentation generation process.
   * Creates the record immediately and triggers background generation.
   */
  public async startPresentationGeneration(
    userId: string,
    templateId: string,
    contextIds: string[],
    prompt: string,
    title?: string,
  ): Promise<Presentation> {
    // 1. Load template
    const template = await slideTemplateService.getTemplateById(userId, templateId);

    // 2. Create initial presentation record
    const presentation = await prisma.presentation.create({
      data: {
        userId,
        templateId,
        title: title || "Untitled Presentation", // Will be updated by AI
        slidesJson: [],
        contextIds,
        status: "GENERATING",
      },
      include: { template: true },
    });

    // 3. Trigger background generation (Fire and forget)
    // We don't await this so the API returns immediately.
    this.generateSlidesBackground(userId, presentation.id, template, contextIds, prompt).catch(
      (err) => {
        logger.error(`Background generation failed for ${presentation.id}`, err);
        this.updateStatus(userId, presentation.id, "FAILED");
      },
    );

    return presentation;
  }

  /**
   * Background process to generate slides using streaming and update DB incrementally.
   */
  private async generateSlidesBackground(
    userId: string,
    presentationId: string,
    template: TemplateWithSlideTypes,
    contextIds: string[],
    userPrompt: string,
  ) {
    logger.info(`Starting background generation for ${presentationId}`);

    try {
      // 1. Retrieve Context
      let contextText = "";
      if (contextIds.length > 0) {
        try {
          const chunks = await queryContexts(contextIds, userPrompt, 1000);
          if (chunks.length > 0) {
            contextText = `\nRetrieved context:\n${chunks.join("\n\n")}\n`;
          }
        } catch (error) {
          logger.warn("Failed to retrieve context", error);
        }
      }

      // 2. Build Prompt
      const aiPrompt = this.buildPrompt(template, contextText, userPrompt);
      const model = this.openrouter(this.modelName);

      // 3. Stream Object
      // Cast schema to any to avoid "Type instantiation is excessively deep" error with Zod
      const schema = SlidePlanSchema as any;

      const { partialObjectStream } = await streamObject({
        model,
        schema,
        prompt: aiPrompt,
        temperature: 0.3,
      });

      let lastTitle = "";
      let lastSlidesCount = 0;

      for await (const partial of partialObjectStream) {
        const typedPartial = partial as Partial<SlidePlan>;

        // Update DB if we have significant changes
        // e.g. title changed or new slide added
        const slides = (typedPartial.slides as unknown[]) || [];
        const title = typedPartial.title || "Untitled Presentation";

        if (slides.length > lastSlidesCount || (title !== lastTitle && title.length > 5)) {
          lastSlidesCount = slides.length;
          lastTitle = title;

          await prisma.presentation.update({
            where: { id: presentationId },
            data: {
              title: title,
              slidesJson: slides as Prisma.InputJsonValue,
            },
          });
        }
      }

      // 4. Finalize Generation
      // Wait for the full object to be sure (the stream loop finishes when done)
      // We need to re-fetch the "final" state from the stream generator if possible,
      // or just trust the last partial. Use `object` promise from streamObject if needed,
      // but here we consumed the stream.

      // Let's get the final result using generateObject for safety?
      // No, that doubles cost. We trust the last partial from the stream loop.
      // Actually, `streamObject` provides a promise `object` that resolves to the final object.
      // But we can't await it *while* iterating easily unless we run parallel.
      // The `for await` loop finishes when the stream is done.

      // Update status to GENERATING_IMAGES
      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: "GENERATING_IMAGES" },
      });

      // 5. Generate Images
      // We need to get the final slides from DB or keep track
      const finalPresentation = await this.getPresentationById(userId, presentationId);
      const finalSlides = (finalPresentation.slidesJson as any[]) || [];

      if (finalSlides.length > 0) {
        await this.processSlideImages(
          userId,
          presentationId,
          finalSlides as { slideTypeKey: string; parameters: Record<string, unknown> }[],
          template,
        );
      }

      // 6. Complete
      await prisma.presentation.update({
        where: { id: presentationId },
        data: {
          status: "DRAFT",
          slidesJson: finalSlides as Prisma.InputJsonValue,
        },
      });

      logger.info(`Background generation completed for ${presentationId}`);
    } catch (error) {
      logger.error(`Error in generateSlidesBackground for ${presentationId}`, error);
      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: "FAILED" },
      });
    }
  }

  // OLD METHOD - Kept for reference or deletion
  // public async generatePresentation(...) -> DELETED/REPLACED by startPresentationGeneration
  // (We are replacing the block, so it's gone)

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

    // Parallel with limit is better, but map is fine for small batches
    const imagePromises = slides.map(async (slide) => {
      const params = slide.parameters as Record<string, unknown>;

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
          params.imageUrl = imageUrl;
        }
      }
    });

    await Promise.all(imagePromises);
  }
}

export const slideGenerationService = new SlideGenerationService();
