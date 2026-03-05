/* eslint-disable @typescript-eslint/no-explicit-any */
import { Presentation, Prisma } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { slideTemplateService, TemplateWithSlideTypes } from "./slideTemplateService";
import { buildSlideTypeCatalog, getSlideTypeDefinition } from "./slideTypeRegistry";
import { imageGenerationService } from "./imageGenerationService";

// Schema for the Pass 1 Outline strategy
const SlideOutlineSchema = z.object({
  title: z.string().describe("Overall presentation title"),
  slides: z.array(
    z.object({
      slideTypeKey: z
        .string()
        .describe("Must exactly match an available slideTypeKey from the catalog"),
      intent: z
        .string()
        .describe(
          "Detailed instruction explaining what specific content should be written on this slide",
        ),
    }),
  ),
});

export class SlideGenerationService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });

  private readonly modelName = "google/gemini-2.5-pro";

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
    numSlides?: number,
  ): Promise<Presentation> {
    // Clamp numSlides to max 15
    const clampedNumSlides =
      numSlides !== undefined ? Math.min(Math.max(1, numSlides), 15) : undefined;

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

    // 3. Await generation synchronously
    try {
      await this.generateSlidesBackground(
        userId,
        presentation.id,
        template,
        contextIds,
        prompt,
        clampedNumSlides,
      );
    } catch (err) {
      logger.error(`Generation failed for ${presentation.id}`, err);
      // Status update is already handled inside generateSlidesBackground's catch block,
      // but we throw here to fail the API request immediately.
      throw new Error("Failed to generate presentation");
    }

    return this.getPresentationById(userId, presentation.id);
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
    numSlides?: number,
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

      const aiPrompt = this.buildOutlinePrompt(template, contextText, userPrompt, numSlides);
      const model = this.openrouter(this.modelName);

      // 3. Generate Object instead of streaming for schema reliability on complex nested objects
      logger.info(`[Slide Gen Debug] Triggering generateObject to Google Gemini flash...`);
      let slidePlan;

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const generationResult = await generateObject({
            model,
            schema: SlideOutlineSchema,
            prompt:
              attempt > 1
                ? aiPrompt +
                  `\n\nCRITICAL FIX: Your previous JSON output was corrupted by an unterminated string or excessive unescaped newlines. You must strictly cap text length and format string values on a single line safely.`
                : aiPrompt,
            temperature: 0.3 + attempt * 0.1, // Slightly increase temp on retries to break out of deterministic failure loops
          });
          slidePlan = generationResult.object;
          break; // Success! Break out of the retry loop
        } catch (genError) {
          logger.warn(`[Slide Gen Debug] Attempt ${attempt}/${maxRetries} failed: `, genError);
          if (attempt === maxRetries) {
            logger.error(
              `[Slide Gen Debug] CRITICAL MODEL EXPECTATION FAILURE after ${maxRetries} retries.`,
            );
            throw genError;
          }
          // Delay briefly before retrying
          await new Promise((res) => setTimeout(res, 1500));
        }
      }

      const slidesOutline = slidePlan?.slides || [];
      const title = slidePlan?.title || "Untitled Presentation";

      logger.info(
        `[Slide Gen Debug] PASS 1 Complete. Generated ${slidesOutline.length} slide outlines.`,
      );

      // Update DB with empty parameters for early UI indication
      await prisma.presentation.update({
        where: { id: presentationId },
        data: {
          title: title,
          slidesJson: slidesOutline.map((s: any) => ({
            slideTypeKey: s.slideTypeKey,
            parameters: {},
          })) as Prisma.InputJsonValue,
        },
      });

      // 4. PASS 2: Concurrently generate specific parameters for each slide
      logger.info(`[Slide Gen Debug] PASS 2: Generating Parameters concurrently...`);
      const parameterPromises = slidesOutline.map(async (slideOutline: any, index: number) => {
        const slideDef = getSlideTypeDefinition(slideOutline.slideTypeKey);
        if (!slideDef) {
          logger.warn(`[Slide Gen Debug] Unknown slide type: ${slideOutline.slideTypeKey}`);
          return { slideTypeKey: slideOutline.slideTypeKey, parameters: {} };
        }

        const slidePrompt = `You are filling in specific parameters for slide #${index + 1} of a presentation.
Presentation Title: "${title}"
Slide Type: "${slideDef.name}" (${slideOutline.slideTypeKey})
Slide Intent: "${slideOutline.intent}"

Template Brand Context: "${template.name}"
${contextText ? `Source Context:\n${contextText}` : ""}

Provide ONLY the required JSON parameters for this slide type matching the schema exactly. Keep text concise.`;

        let parameters = {};
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const slideGen = await generateObject({
              model,
              schema: slideDef.parametersSchema,
              prompt: slidePrompt,
              temperature: 0.2 + attempt * 0.1,
            });
            parameters = slideGen.object;
            break; // Success
          } catch (err) {
            logger.warn(
              `[Slide Gen Debug] Slide ${index + 1} parameter generation attempt ${attempt} failed:`,
              err,
            );
          }
        }

        return { slideTypeKey: slideOutline.slideTypeKey, parameters };
      });

      const fullyPopulatedSlides = await Promise.all(parameterPromises);

      logger.info(
        `[Slide Gen Debug] PASS 2 Complete. ${fullyPopulatedSlides.length} fully structured slides built.`,
      );

      // 5. Finalize Generation
      await prisma.presentation.update({
        where: { id: presentationId },
        data: {
          slidesJson: fullyPopulatedSlides as Prisma.InputJsonValue,
          status: "GENERATING_IMAGES",
        },
      });

      // 6. Generate Images
      if (fullyPopulatedSlides.length > 0) {
        await this.processSlideImages(
          userId,
          presentationId,
          fullyPopulatedSlides as { slideTypeKey: string; parameters: Record<string, unknown> }[],
          template,
        );
      }

      // 7. Complete
      await prisma.presentation.update({
        where: { id: presentationId },
        data: {
          status: "DRAFT",
          slidesJson: fullyPopulatedSlides as Prisma.InputJsonValue,
        },
      });

      logger.info(`Background generation completed for ${presentationId}`);
    } catch (error) {
      logger.error(`Error in generateSlidesBackground for ${presentationId}`, error);
      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: "FAILED" },
      });
      throw error;
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

  private buildOutlinePrompt(
    template: TemplateWithSlideTypes,
    contextText: string,
    userPrompt: string,
    numSlides?: number,
  ): string {
    const enabledTypes = template.slideTypes.map((st) => st.slideTypeKey);
    const catalog = buildSlideTypeCatalog(enabledTypes.length > 0 ? enabledTypes : undefined);

    const slideCountInstruction = numSlides
      ? `5. Generate EXACTLY ${numSlides} slides (no more, no less). This is a strict requirement.`
      : `5. Aim for 6-12 slides unless the content requires more (maximum 15 slides).`;

    return `You are a presentation architect. Your job is to create a slide-by-slide outline.

## Available Slide Types

${catalog}

## Rules

1. You MUST use ONLY slide type keys from the list above.
2. Provide a clear "intent" for each slide so another AI can generate the precise text parameters later.
3. Choose slide types that best fit the logical progression of the presentation.
4. Do NOT repeat the same type consecutively unless necessary.
${slideCountInstruction}
6. Start with a "title_only" slide and end with a "title_only" slide (as a closing slide).
7. Return a strictly valid JSON object tracking the structure outline.

## Template Brand

- Template name: "${template.name}"
${template.description ? `- Description: "${template.description}"` : ""}

## Context

${contextText || "No additional context provided."}

## User Request

${userPrompt}`;
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
