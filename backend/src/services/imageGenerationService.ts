import { openai } from "@ai-sdk/openai";
import { experimental_generateImage as generateImage } from "ai";
import { logger } from "../utils/logger";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";

export class ImageGenerationService {
  /**
   * Generate an image from a prompt using DALL-E 3 and save it to Firebase Storage.
   * Returns the public URL of the uploaded image.
   */
  public async generateAndStoreImage(
    prompt: string,
    userId: string,
    presentationId: string,
  ): Promise<string | null> {
    try {
      logger.info(`Generating image for presentation ${presentationId} with prompt: "${prompt}"`);

      // 1. Generate image using Vercel AI SDK (OpenAI DALL-E 3)
      // Note: We use OpenAI provider directly as OpenRouter image support via AI SDK might differ
      // Ensuring we use 'dall-e-3' model.
      const { image } = await generateImage({
        model: openai.image("dall-e-3"),
        prompt,
        n: 1,
        // DALL-E 3 standard size
        size: "1024x1024",
      });

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
      return publicUrl;
    } catch (error) {
      logger.error("Failed to generate and store image", error);
      return null;
    }
  }
}

export const imageGenerationService = new ImageGenerationService();
