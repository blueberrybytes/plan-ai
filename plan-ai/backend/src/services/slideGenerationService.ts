/* eslint-disable @typescript-eslint/no-explicit-any */
import { countFeature } from "./featureUsageService";
import { BrandTheme, Prisma } from "@prisma/client";

export type PresentationWithRelations = Prisma.PresentationGetPayload<{
  include: { template: true; theme: true };
}>;
import {
  getConfiguredModel,
  getStructuredProviderOptions,
  SLIDE_MODEL,
} from "../utils/aiModelUtils";
import { generateText, Output } from "ai";
import { z } from "zod";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { slideTemplateService, TemplateWithSlideTypes } from "./slideTemplateService";
import {
  applySlideCaps,
  buildSlideTypeCatalog,
  getSlideTypeDefinition,
  SLIDE_LIST_CAPS,
  SLIDE_TYPE_KEYS,
  SlideTypeDefinition,
} from "./slideTypeRegistry";
import { MERMAID_SYNTAX_RULES } from "../prompts/mermaidRules";
import { imageGenerationService } from "./imageGenerationService";
import { aiUsageService } from "./aiUsageService";
import { getPersonaInstructions } from "./personaService";
import { publicLinkWhere, shareTokenUpdate } from "../utils/shareToken";
import { assertThemeInWorkspace } from "./brandThemeAccess";
import { unsignSlideImages } from "../utils/slideImages";
import { recordAudit } from "./auditLogService";
import { mapWithConcurrency } from "../utils/concurrency";

// Image requests in flight for one deck. A deck has up to 15 images.
const IMAGE_CONCURRENCY = 4;

type SlideModel = ReturnType<typeof getConfiguredModel>;
type FilledSlide = { slideTypeKey: string; parameters: Record<string, unknown> };

// Schema for the Pass 1 Outline strategy. The key is an enum of the registered
// types so the model cannot invent one ("title_slide", "bullet-list").
export const SlideOutlineSchema = z.object({
  title: z.string().describe("Overall presentation title"),
  slides: z.array(
    z.object({
      slideTypeKey: z
        .enum(SLIDE_TYPE_KEYS)
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
  private readonly modelName = SLIDE_MODEL;

  /**
   * Generate a presentation from a template, context, and user prompt.
   */
  /**
   * Start the presentation generation process.
   * Creates the record immediately and triggers background generation.
   */
  public async startPresentationGeneration(
    userId: string,
    workspaceId: string,
    templateId: string | undefined,
    themeId: string | undefined, // Added
    contextIds: string[],
    transcriptIds: string[], // Added
    prompt: string,
    title?: string,
    numSlides?: number,
    modelKey?: string,
  ): Promise<PresentationWithRelations> {
    // Clamp numSlides to max 15
    const clampedNumSlides =
      numSlides !== undefined ? Math.min(Math.max(1, numSlides), 15) : undefined;

    // 1. Load template if provided
    let template: TemplateWithSlideTypes | null = null;
    if (templateId) {
      template = await slideTemplateService.getTemplateById(userId, workspaceId, templateId);
    }

    // 2. Create initial presentation record
    const presentation = await prisma.presentation.create({
      data: {
        userId,
        workspaceId,
        templateId: templateId || null,
        themeId: themeId || null,
        title: title || "Untitled Presentation", // Will be updated by AI
        prompt,
        slidesJson: [],
        contextIds,
        status: "GENERATING",
      },
      include: { template: true, theme: true },
    });

    // 3. Await generation synchronously
    try {
      await this.generateSlidesBackground(
        userId,
        workspaceId,
        presentation.id,
        template,
        presentation.theme,
        contextIds,
        transcriptIds,
        prompt,
        clampedNumSlides,
        modelKey,
      );
    } catch (err) {
      logger.error(`Generation failed for ${presentation.id}`, err);
      // Status update is already handled inside generateSlidesBackground's catch block,
      // but we throw here to fail the API request immediately.
      throw new Error("Failed to generate presentation");
    }

    return this.getPresentationById(userId, workspaceId, presentation.id);
  }

  /**
   * Background process to generate slides using streaming and update DB incrementally.
   */
  private async generateSlidesBackground(
    userId: string,
    workspaceId: string,
    presentationId: string,
    template: TemplateWithSlideTypes | null,
    theme: BrandTheme | null,
    contextIds: string[],
    transcriptIds: string[],
    userPrompt: string,
    numSlides?: number,
    modelKey?: string,
  ) {
    logger.info(`Starting background generation for ${presentationId}`);

    try {
      // 1. Retrieve Context
      let contextText = "";
      if (contextIds.length > 0) {
        try {
          const chunks = await queryContexts(workspaceId, contextIds, userPrompt, 1000);
          if (chunks.length > 0) {
            contextText = `\nRetrieved context:\n${chunks.join("\n\n")}\n`;
          }
        } catch (error) {
          logger.warn("Failed to retrieve context", error);
        }
      }

      if (transcriptIds && transcriptIds.length > 0) {
        const transcripts = await prisma.transcript.findMany({
          where: { id: { in: transcriptIds }, workspaceId },
          select: { title: true, transcript: true, summary: true },
        });
        for (const t of transcripts) {
          const parts = [`## Transcript: ${t.title ?? "Untitled"}`];
          if (t.summary) parts.push(`**Summary:** ${t.summary}`);
          if (t.transcript) parts.push(t.transcript);
          contextText += `\n${parts.join("\n")}\n`;
        }
      }

      const personaInstructions = await getPersonaInstructions(userId, workspaceId);
      const aiPrompt = this.buildOutlinePrompt(
        template,
        contextText,
        userPrompt,
        numSlides,
        personaInstructions,
      );
      const activeModel = modelKey || this.modelName;
      const model = getConfiguredModel(activeModel);

      // 3. Generate Object instead of streaming for schema reliability on complex nested objects
      let slidePlan;

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const generationResult = await generateText({
            model,
            providerOptions: getStructuredProviderOptions(),
            output: Output.object({
              name: "SlideOutlinePlan",
              description:
                "Generates an outline of the presentation slides and their specific intents.",
              schema: SlideOutlineSchema,
            }),
            prompt:
              attempt > 1
                ? aiPrompt +
                  `\n\nCRITICAL FIX: Your previous JSON output was corrupted by an unterminated string or excessive unescaped newlines. You must strictly cap text length and format string values on a single line safely.`
                : aiPrompt,
            temperature: 0.3 + attempt * 0.1, // Slightly increase temp on retries to break out of deterministic failure loops
            maxRetries: 3,
          });
          slidePlan = generationResult.output;

          if (generationResult.totalUsage) {
            aiUsageService
              .logUsage({
                userId,
                workspaceId,
                feature: "SLIDES",
                provider: "openrouter",
                model: activeModel,
                inputTokens: generationResult.totalUsage.inputTokens || 0,
                outputTokens: generationResult.totalUsage.outputTokens || 0,
              })
              .catch(() => {});
          }
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
          slidesJson: slidesOutline.map((s) => ({
            slideTypeKey: s.slideTypeKey,
            parameters: {},
          })) as Prisma.InputJsonValue,
        },
      });

      // 4. PASS 2: Concurrently generate specific parameters for each slide
      logger.info(`[Slide Gen Debug] PASS 2: Generating Parameters concurrently...`);
      const parameterPromises = slidesOutline.map(
        async (slideOutline, index: number): Promise<FilledSlide | null> => {
          const slideDef = getSlideTypeDefinition(slideOutline.slideTypeKey);
          if (!slideDef) {
            logger.warn(`[Slide Gen Debug] Unknown slide type: ${slideOutline.slideTypeKey}`);
            return null;
          }

          const slidePrompt = this.buildSlidePrompt(
            `You are filling in specific parameters for slide #${index + 1} of a presentation.`,
            title,
            slideDef,
            slideOutline.intent,
            template?.name,
            contextText,
          );
          const parameters = await this.fillSlideParameters(
            model,
            activeModel,
            slideDef,
            slidePrompt,
            userId,
            workspaceId,
            `Slide ${index + 1}`,
          );
          return parameters ? { slideTypeKey: slideOutline.slideTypeKey, parameters } : null;
        },
      );

      const slideResults = await Promise.all(parameterPromises);
      const fullyPopulatedSlides = slideResults.filter((s): s is FilledSlide => s !== null);
      const dropped = slideResults.length - fullyPopulatedSlides.length;
      if (dropped > 0 && fullyPopulatedSlides.length > 0) {
        // A slide without content renders as an empty frame, so it is left out.
        logger.warn(
          `[Slide Gen Debug] Dropped ${dropped} of ${slideResults.length} slides that could not be filled for ${presentationId}.`,
        );
      } else if (dropped > 0) {
        // Nothing could be filled. A deck of empty frames looks finished and
        // is not, so the generation fails and the user is told. The outline
        // saved for the live preview goes too.
        await prisma.presentation.update({
          where: { id: presentationId },
          data: { slidesJson: [] },
        });
        throw new Error(`No slide could be filled for presentation ${presentationId}`);
      }

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
        await this.processSlideImages(userId, presentationId, fullyPopulatedSlides, theme);
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

  /**
   * Generates a single slide and adds it to an existing presentation at the given position.
   */
  public async generateSingleSlide(
    userId: string,
    workspaceId: string,
    presentationId: string,
    prompt: string,
    position: number,
    slideTypeKey?: string,
  ): Promise<PresentationWithRelations> {
    logger.info(`Starting single slide generation for presentation ${presentationId}`);

    const presentation = await this.getPresentationById(userId, workspaceId, presentationId);
    if (!presentation) {
      throw { status: 404, message: "Presentation not found" };
    }

    let contextText = "";
    if (presentation.contextIds && presentation.contextIds.length > 0) {
      try {
        const chunks = await queryContexts(workspaceId, presentation.contextIds, prompt, 1000);
        if (chunks.length > 0) {
          contextText = `\nRetrieved context:\n${chunks.join("\n\n")}\n`;
        }
      } catch (error) {
        logger.warn("Failed to retrieve context for single slide", error);
      }
    }

    const model = getConfiguredModel(this.modelName);

    // 1. Determine slide type and intent
    let finalSlideTypeKey = slideTypeKey;
    let slideIntent = prompt;

    if (!finalSlideTypeKey) {
      // AI decides
      const enabledTypes =
        (presentation.template as any)?.slideTypes?.map((st: any) => st.slideTypeKey) || [];
      const catalog = buildSlideTypeCatalog(enabledTypes.length > 0 ? enabledTypes : undefined);

      const personaInstructions = await getPersonaInstructions(userId, workspaceId);

      const decidePrompt = `You are an expert presentation designer. Choose the best slide type and describe the intent for a new slide.
      
${personaInstructions}
      
## Available Slide Types
${catalog}

## Presentation Context
Title: "${presentation.title}"
Template: "${presentation.template?.name || "Standard Core Blueprint"}"

## Context Data
${contextText || "No additional context."}

## User Request for New Slide
${prompt}

Select ONLY ONE slide type that best fits this request, and define a clear intent.`;

      try {
        const decision = await generateText({
          model,
          providerOptions: getStructuredProviderOptions(),
          output: Output.object({
            name: "SlideTypeDecision",
            description:
              "Decides the most appropriate slide type and intent for a new slide based on the user's request.",
            schema: z.object({
              slideTypeKey: z
                .enum(SLIDE_TYPE_KEYS)
                .describe("Must exactly match a slideTypeKey from the available catalog"),
              intent: z
                .string()
                .describe("Detailed instruction for what specific content should go on the slide"),
            }),
          }),
          prompt: decidePrompt,
        });

        finalSlideTypeKey = decision.output.slideTypeKey;
        slideIntent = decision.output.intent;

        if (decision.totalUsage) {
          aiUsageService
            .logUsage({
              userId,
              workspaceId,
              feature: "SLIDES",
              provider: "openrouter",
              model: this.modelName,
              inputTokens: decision.totalUsage.inputTokens || 0,
              outputTokens: decision.totalUsage.outputTokens || 0,
            })
            .catch(() => {});
        }
      } catch (err) {
        logger.warn("Failed to decide slide type, falling back to text_block", err);
        finalSlideTypeKey = "text_block";
      }
    }

    // 2. Generate slide parameters
    const slideDef = getSlideTypeDefinition(finalSlideTypeKey!);
    if (!slideDef) {
      throw new Error(`Unknown slide type: ${finalSlideTypeKey}`);
    }

    const slidePrompt = this.buildSlidePrompt(
      "You are generating content for a new slide to be inserted into a presentation.",
      presentation.title,
      slideDef,
      slideIntent,
      presentation.template?.name,
      contextText,
    );

    const parameters = await this.fillSlideParameters(
      model,
      this.modelName,
      slideDef,
      slidePrompt,
      userId,
      workspaceId,
      "Single slide",
    );
    if (!parameters) {
      throw new Error("Failed to generate the slide content");
    }

    const newSlide: FilledSlide = { slideTypeKey: slideDef.key, parameters };

    // 3. Generate image if needed
    // Using cast because we didn't strongly type the whole returned schema locally
    await this.processSlideImages(userId, presentationId, [newSlide], presentation.theme as any);

    // 4. Insert into presentation
    const slides = Array.isArray(presentation.slidesJson) ? [...presentation.slidesJson] : [];

    // Clamp position
    const validPosition = Math.max(0, Math.min(position, slides.length));
    slides.splice(validPosition, 0, newSlide as Prisma.JsonObject);

    // 5. Update presentation
    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: { slidesJson: slides as Prisma.InputJsonValue },
      include: { template: true, theme: true },
    });

    logger.info(
      `Successfully added single slide to presentation ${presentationId} at position ${validPosition}`,
    );
    return updated;
  }

  // OLD METHOD - Kept for reference or deletion
  // public async generatePresentation(...) -> DELETED/REPLACED by startPresentationGeneration
  // (We are replacing the block, so it's gone)

  /**
   * List presentations for a user.
   */
  public async listPresentations(
    userId: string,
    workspaceId: string,
  ): Promise<PresentationWithRelations[]> {
    return prisma.presentation.findMany({
      where: { workspaceId },
      include: { template: true, theme: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Get a presentation by ID.
   */
  public async getPresentationById(
    userId: string,
    workspaceId: string,
    presentationId: string,
  ): Promise<PresentationWithRelations> {
    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, workspaceId },
      include: { template: true, theme: true },
    });

    if (!presentation) {
      throw { status: 404, message: "Presentation not found" };
    }

    return presentation;
  }

  /**
   * Get a public presentation by ID (no user check).
   */
  public async getPublicPresentationById(
    presentationId: string,
  ): Promise<PresentationWithRelations> {
    // Only presentations someone shared; a private one answers like a missing one.
    const presentation = await prisma.presentation.findFirst({
      where: publicLinkWhere(presentationId),
      include: { template: true, theme: true },
    });

    if (!presentation) {
      throw { status: 404, message: "Presentation not found" };
    }

    return presentation;
  }

  /**
   * Delete a presentation.
   */
  public async deletePresentation(
    userId: string,
    workspaceId: string,
    presentationId: string,
  ): Promise<void> {
    await this.getPresentationById(userId, workspaceId, presentationId);
    await prisma.presentation.delete({ where: { id: presentationId } });
    logger.info(`Deleted presentation ${presentationId}`);
  }

  public async updateStatus(
    userId: string,
    workspaceId: string,
    presentationId: string,
    status: string,
  ): Promise<PresentationWithRelations> {
    await this.getPresentationById(userId, workspaceId, presentationId);
    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: { status },
      include: { template: true, theme: true },
    });
    logger.info(`Updated presentation ${presentationId} status to ${status}`);
    return updated;
  }

  public async updatePresentation(
    userId: string,
    workspaceId: string,
    presentationId: string,
    data: {
      title?: string;
      status?: string;
      themeId?: string | null;
      slidesJson?: Prisma.InputJsonValue;
      isPublic?: boolean;
    },
  ): Promise<PresentationWithRelations> {
    const existing = await this.getPresentationById(userId, workspaceId, presentationId);
    await assertThemeInWorkspace(data.themeId, workspaceId);
    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        ...data,
        // The client got signed links; store the references again.
        ...(data.slidesJson !== undefined
          ? { slidesJson: await unsignSlideImages(data.slidesJson) }
          : {}),
        ...shareTokenUpdate(existing.isPublic, data.isPublic),
      },
      include: { template: true, theme: true },
    });
    if (data.isPublic !== undefined && data.isPublic !== existing.isPublic) {
      if (data.isPublic) countFeature("slides.shared_public");
      await recordAudit({
        workspaceId,
        actor: { id: userId },
        action: data.isPublic ? "presentation.shared" : "presentation.unshared",
        targetType: "presentation",
        targetId: presentationId,
        metadata: { title: updated.title },
      });
    }
    logger.info(`Updated presentation ${presentationId}`);
    return updated;
  }

  /**
   * Prompt for the parameters of one slide. It carries the description of the
   * type, which is where the limits of the layout are written.
   */
  private buildSlidePrompt(
    intro: string,
    presentationTitle: string,
    slideDef: SlideTypeDefinition,
    intent: string,
    templateName: string | undefined,
    contextText: string,
  ): string {
    const cap = SLIDE_LIST_CAPS[slideDef.key];
    const capRule = cap ? ` "${cap.field}" has at most ${cap.max} items.` : "";
    return `${intro}
Presentation Title: "${presentationTitle}"
Slide Type: "${slideDef.name}" (${slideDef.key})
Slide Type Description: ${slideDef.description}
Slide Intent: "${intent}"

Template Brand Context: "${templateName || "Standard Core Blueprint"}"
${contextText ? `Source Context:\n${contextText}` : ""}

Provide ONLY the required JSON parameters for this slide type matching the schema exactly.
CRITICAL PRESENTATION RULE: Slides must be easily readable. Do NOT write long paragraphs. Keep text extremely concise. Summarize lengthy text into short, punchy bullet points where possible.
FORMAT RULES: Plain text only, no markdown. Do not start a single text field with "- " or a bullet mark. Keep titles under about 60 characters. Follow the length given for each field.${capRule}${
      slideDef.key === "diagram_slide"
        ? `\n\nWhen producing the \`mermaidCode\` field, follow these rules exactly:\n${MERMAID_SYNTAX_RULES}`
        : ""
    }`;
  }

  /**
   * Asks the model for the parameters of one slide, twice at most. Returns null
   * when both attempts fail, so the caller decides what to do with the slide.
   */
  private async fillSlideParameters(
    model: SlideModel,
    modelName: string,
    slideDef: SlideTypeDefinition,
    slidePrompt: string,
    userId: string,
    workspaceId: string,
    label: string,
  ): Promise<Record<string, unknown> | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const slideGen = await generateText({
          model,
          providerOptions: getStructuredProviderOptions(),
          output: Output.object({
            name: "SlideParameters",
            description:
              "Generates specific structured content parameters for a single presentation slide.",
            schema: slideDef.parametersSchema,
          }),
          prompt: slidePrompt,
          temperature: 0.2 + attempt * 0.1,
          maxRetries: 3,
        });

        if (slideGen.totalUsage) {
          aiUsageService
            .logUsage({
              userId,
              workspaceId,
              feature: "SLIDES",
              provider: "openrouter",
              model: modelName,
              inputTokens: slideGen.totalUsage.inputTokens || 0,
              outputTokens: slideGen.totalUsage.outputTokens || 0,
            })
            .catch(() => {});
        }
        return applySlideCaps(slideDef.key, slideGen.output as Record<string, unknown>);
      } catch (err) {
        logger.warn(
          `[Slide Gen Debug] ${label} parameter generation attempt ${attempt} failed:`,
          err,
        );
      }
    }
    return null;
  }

  private buildOutlinePrompt(
    template: TemplateWithSlideTypes | null,
    contextText: string,
    userPrompt: string,
    numSlides?: number,
    personaInstructions?: string,
  ): string {
    const enabledTypes = template?.slideTypes.map((st) => st.slideTypeKey) || [];
    const catalog = buildSlideTypeCatalog(enabledTypes.length > 0 ? enabledTypes : undefined);

    const slideCountInstruction = numSlides
      ? `5. Generate EXACTLY ${numSlides} slides (no more, no less). This is a strict requirement.`
      : `5. Aim for 6-12 slides unless the content requires more (maximum 15 slides).`;

    return `You are a presentation architect. Your job is to create a slide-by-slide outline.
${personaInstructions || ""}

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

- Template name: "${template?.name || "Standard Presentation Blueprint"}"
${template?.description ? `- Description: "${template.description}"` : ""}

## Context

${contextText || "No additional context provided."}

## User Request

${userPrompt}`;
  }

  private async processSlideImages(
    userId: string,
    presentationId: string,
    slides: { slideTypeKey: string; parameters: Record<string, unknown> }[],
    theme: BrandTheme | null,
  ) {
    logger.info(`Processing images for presentation ${presentationId}`);

    const withImage = slides.filter(
      (slide) =>
        typeof slide.parameters.imageQuery === "string" &&
        slide.parameters.imageQuery.trim().length > 0,
    );

    // A few at a time: 15 requests at once ran into the provider's rate limit
    // and the 30 s timeout. The retry is inside generateAndStoreImage.
    await mapWithConcurrency(withImage, IMAGE_CONCURRENCY, async (slide) => {
      const params = slide.parameters;

      // Enhance prompt with theme context
      let themeContext = "";
      if (theme) {
        themeContext = `Style: ${theme.name}. Visually incorporate these dominant colors: ${theme.primaryColor}, ${theme.secondaryColor}, ${theme.backgroundColor}. (CRITICAL: Do NOT draw a literal color palette, color swatches, color spots, UI mockups, or borders on the image canvas. Draw only the requested scene/subject).`;
      }
      const fullPrompt = themeContext ? `${params.imageQuery}. ${themeContext}` : params.imageQuery;

      try {
        // Generate image
        const imageUrl = await imageGenerationService.generateAndStoreImage(
          fullPrompt as string,
          userId,
          presentationId,
        );

        if (imageUrl) {
          params.imageUrl = imageUrl;
        }
      } catch (error) {
        logger.warn(`Failed to generate slide image for prompt "${params.imageQuery}":`, error);
        // Fallback to a placeholder or skip so we don't crash the presentation
        params.imageUrl = undefined;
      }
    });
  }
}

export const slideGenerationService = new SlideGenerationService();
