import { getLlmProvider } from "../utils/localAi";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import prisma from "../prisma/prismaClient";
import { aiUsageService } from "./aiUsageService";
import { privacyProviderPrefs, resolveWorkspaceApiKey } from "../utils/aiModelUtils";
import { uploadPrivateFile } from "../firebase/privateStorage";

const IMAGE_MODEL = "black-forest-labs/flux.2-klein-4b";

export class ImageGenerationService {
  /**
   * Generates a slide image with Flux through OpenRouter and stores it as a
   * private file. Returns the stored reference (gs:// URI); readers get a
   * signed link through signSlideImages. Null when no image could be made:
   * slides handle a missing image.
   *
   * The prompt comes from the meeting, so it runs on the workspace's own
   * OpenRouter key with the same privacy routing as the rest of the AI, is
   * never logged, and there is no fallback to another provider.
   */
  public async generateAndStoreImage(
    prompt: string,
    userId: string,
    presentationId: string,
  ): Promise<string | null> {
    // Self-hosted deployments have no image model, and the prompt is built
    // from the meeting's content, so it must not go to OpenRouter.
    if (getLlmProvider() === "local") return null;
    try {
      const presentation = await prisma.presentation.findUnique({
        where: { id: presentationId },
        select: { workspaceId: true },
      });
      if (!presentation?.workspaceId) return null;
      const apiKey = await resolveWorkspaceApiKey(presentation.workspaceId);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: prompt }],
          provider: privacyProviderPrefs(),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        logger.warn(`[ImageGeneration] OpenRouter answered ${response.status}`);
        return null;
      }

      const data = await response.json();
      const imageUrl: unknown = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (typeof imageUrl !== "string" || !imageUrl.startsWith("data:image/")) {
        logger.warn("[ImageGeneration] No image data returned");
        return null;
      }

      const buffer = Buffer.from(imageUrl.split(",")[1] ?? "", "base64");
      const ref = await uploadPrivateFile(
        `presentations/${userId}/${presentationId}/${uuidv4()}.png`,
        buffer,
        "image/png",
      );

      await aiUsageService
        .logUsage({
          userId,
          workspaceId: presentation.workspaceId,
          feature: "SLIDES",
          provider: "openrouter",
          model: IMAGE_MODEL,
          inputTokens: 0,
          outputTokens: 1,
        })
        .catch((usageErr) => logger.warn("Failed to log image generation usage", usageErr));

      return ref;
    } catch (error) {
      logger.error("Failed to generate and store image", error);
      return null;
    }
  }
}

export const imageGenerationService = new ImageGenerationService();
