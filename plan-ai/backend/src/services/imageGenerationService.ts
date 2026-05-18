import { openai } from "@ai-sdk/openai";
import { generateImage } from "ai";
import { logger } from "../utils/logger";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import prisma from "../prisma/prismaClient";
import { aiUsageService } from "./aiUsageService";
import EnvUtils from "../utils/EnvUtils";

export class ImageGenerationService {
  /**
   * Generate an image from a prompt using Flux via OpenRouter (with a fallback to DALL-E 3)
   * and save it to Firebase Storage. Returns the public URL of the uploaded image.
   */
  public async generateAndStoreImage(
    prompt: string,
    userId: string,
    presentationId: string,
  ): Promise<string | null> {
    try {
      logger.info(`Generating image for presentation ${presentationId} with prompt: "${prompt}"`);

      let image;
      let usedModel = "black-forest-labs/flux.2-klein-4b";
      let usedProvider = "openrouter";

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${EnvUtils.get("OPENROUTER_API_KEY")}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "black-forest-labs/flux.2-klein-4b",
            messages: [{ role: "user", content: prompt }]
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${await response.text()}`);
        }

        const data = await response.json();
        const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (imageUrl && imageUrl.startsWith("data:image/")) {
          image = { base64: imageUrl.split(",")[1] };
        } else {
          throw new Error("No image data returned from OpenRouter Flux");
        }
      } catch (fluxErr) {
        logger.warn("Flux generation failed, falling back to DALL-E 3", fluxErr);
        const result = await generateImage({
          model: openai.image("dall-e-3"),
          prompt,
          n: 1,
          size: "1024x1024",
        });
        image = result.image;
        usedModel = "dall-e-3";
        usedProvider = "OPENAI";
      }

      if (!image || !image.base64) {
        logger.error("No image generated from AI provider");
        return null;
      }

      // 2. Convert base64 to buffer
      const buffer = Buffer.from(image.base64, "base64");

      // 3. Upload to Firebase Storage
      const filename = `presentations/${userId}/${presentationId}/${uuidv4()}.png`;
      const bucket = firebaseAdmin.storage().bucket();
      const file = bucket.file(filename);

      await file.save(buffer, {
        metadata: {
          contentType: "image/png",
        },
        public: true, // Make public as requested
      });

      // 4. Get public URL
      // Since we made it public, we can construct the URL or use getSignedUrl
      // Public URL format for Firebase Storage:
      // https://storage.googleapis.com/BUCKET_NAME/PATH
      // OR specific firebase format if needed. Let's use publicUrl() if available or construct it.
      // file.publicUrl() is available in newer SDKs or we can verify.

      const publicUrl = file.publicUrl();
      logger.info(`Generated and stored image at ${publicUrl}`);

      // Log AI Usage
      try {
        const presentation = await prisma.presentation.findUnique({
          where: { id: presentationId },
        });
        if (presentation?.workspaceId) {
          await aiUsageService.logUsage({
            userId,
            workspaceId: presentation.workspaceId,
            feature: "SLIDES",
            provider: usedProvider,
            model: usedModel,
            inputTokens: 0,
            outputTokens: 1,
          });
        }
      } catch (usageErr) {
        logger.warn("Failed to log image generation usage:", usageErr);
      }

      return publicUrl;
    } catch (error) {
      logger.error("Failed to generate and store image", error);
      return null;
    }
  }
}

export const imageGenerationService = new ImageGenerationService();
