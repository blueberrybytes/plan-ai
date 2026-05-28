import { Worker, Job } from "bullmq";
import axios from "axios";
import { redisClient } from "../utils/redisClient";
import { logger } from "../utils/logger";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  created: number;
  context_length: number;
  canonical_slug?: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: unknown;
  supported_parameters?: string[];
  default_parameters?: Record<string, unknown>;
  knowledge_cutoff?: string | null;
  expiration_date?: string | null;
  links?: {
    details?: string;
  };
}

export const pricingSyncWorker = new Worker(
  "PricingSyncQueue",
  async (job: Job) => {
    logger.info(`Starting OpenRouter pricing sync job... ${job.id}`);
    try {
      const response = await axios.get(OPENROUTER_MODELS_URL);
      if (!response.data || !response.data.data) {
        throw new Error("Invalid response format from OpenRouter.");
      }

      const models: OpenRouterModel[] = response.data.data;
      const pricingMap: Record<string, { prompt: number; completion: number; maxTokens: number }> =
        {};

      for (const model of models) {
        if (model.id && model.pricing) {
          pricingMap[model.id] = {
            prompt: parseFloat(model.pricing.prompt || "0"),
            completion: parseFloat(model.pricing.completion || "0"),
            maxTokens: model.context_length || 0,
          };
        }
      }

      await redisClient.set("openrouter:pricing", JSON.stringify(pricingMap));
      logger.info(
        `Successfully synced pricing for ${Object.keys(pricingMap).length} OpenRouter models.`,
      );
    } catch (error) {
      logger.error("Error syncing OpenRouter pricing:", error);
      throw error;
    }
  },
  { connection: redisClient, lockDuration: 60_000 }, // 1 minute — OpenRouter API fetch is 5-15s normally
);

pricingSyncWorker.on("failed", (job, err) => {
  logger.error(`Pricing sync job failed: ${err.message}`);
});
