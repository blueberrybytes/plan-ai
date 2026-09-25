import prisma from "../prisma/prismaClient";
import { Prisma } from "@prisma/client";
import { logger } from "../utils/logger";
import { pricingCacheService } from "./pricingCacheService";
import {
  getEmbeddingsProvider,
  getLlmProvider,
  getLocalEmbeddingsConfig,
  getLocalLlmConfig,
} from "../utils/localAi";

const BLUEBERRY_TOKEN_MARKUP = 2;

/** Speech-to-text rows are seconds of audio, not tokens, and keep their provider. */
const SPEECH_PROVIDERS = new Set(["DEEPGRAM", "WHISPER"]);

const isEmbeddingModel = (model: string): boolean =>
  /embed/i.test(model) ||
  (getEmbeddingsProvider() === "local" && model === getLocalEmbeddingsConfig().model);
const BLUEBERRY_TOKEN_EXCHANGE_RATE = 10000;

export interface LogUsageParams {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  feature: "CHAT" | "DOC" | "SLIDES" | "DIAGRAM" | "TRANSCRIPT" | "TASK_EXTRACTION" | "RECORDER";
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Real cost in USD from OpenRouter usage accounting. When present it's used
   * verbatim (it already reflects prompt-cache discounts), bypassing the
   * estimated pricingMap calculation.
   */
  cost?: number;
  /** Prompt tokens served from the provider's cache (Gemini/Anthropic), persisted for cache-hit analysis. */
  cachedTokens?: number;
}

export class AiUsageService {
  /**
   * Fire-and-forget asynchronous log insertion.
   */
  public async logUsage(params: LogUsageParams): Promise<void> {
    const totalTokens = params.inputTokens + params.outputTokens;
    let actualProvider = params.provider;

    // Self-hosted model or embeddings: the call ran on the customer's own
    // hardware, whatever catalogue id the caller logged. Recorded as LOCAL at
    // zero cost so usage reports and billing don't invent a Gemini bill.
    const embedding = isEmbeddingModel(params.model);
    const local =
      !SPEECH_PROVIDERS.has(params.provider) &&
      (embedding ? getEmbeddingsProvider() === "local" : getLlmProvider() === "local");
    const model = local && !embedding ? getLocalLlmConfig().model : params.model;

    // Automatically parse provider from OpenRouter model ids (e.g., "google/gemini-2.5-flash" -> "GOOGLE")
    if (local) {
      actualProvider = "LOCAL";
    } else if (params.model.includes("/")) {
      const parts = params.model.split("/");
      actualProvider = parts[0].toUpperCase();
    }

    let estimatedCost = 0;
    const pricingMap = pricingCacheService.getAllPricing();

    if (local) {
      estimatedCost = 0;
    } else if (typeof params.cost === "number" && params.cost >= 0) {
      // Real cost from OpenRouter usage accounting — already reflects any
      // prompt-cache discount, so prefer it over the estimate.
      estimatedCost = params.cost;
      if (params.cachedTokens && params.cachedTokens > 0) {
        logger.info(
          `[aiUsage] ${params.model}: ${params.cachedTokens} cached prompt tokens (real cost $${params.cost.toFixed(6)})`,
        );
      }
    } else if (pricingMap[params.model]) {
      const { prompt, completion } = pricingMap[params.model];
      estimatedCost = params.inputTokens * prompt + params.outputTokens * completion;
    } else if (params.model.toLowerCase().includes("whisper")) {
      estimatedCost = params.inputTokens * 0.0001;
    } else if (params.model.toLowerCase().includes("text-embedding-3-small")) {
      estimatedCost = params.inputTokens * 0.00000002;
    } else if (params.model.toLowerCase().includes("text-embedding-3-large")) {
      estimatedCost = params.inputTokens * 0.00000013;
    } else if (params.model.toLowerCase().includes("text-embedding-ada-002")) {
      estimatedCost = params.inputTokens * 0.0000001;
    } else {
      // Fallback cost if pricing is missing to avoid 0 blueberry tokens
      estimatedCost = totalTokens * 0.000001;
    }

    const blueberryTokens = local
      ? 0
      : Math.max(
          1,
          Math.ceil(estimatedCost * BLUEBERRY_TOKEN_MARKUP * BLUEBERRY_TOKEN_EXCHANGE_RATE),
        );

    try {
      await prisma.aiUsageLog.create({
        data: {
          userId: params.userId,
          workspaceId: params.workspaceId,
          projectId: params.projectId || null,
          feature: params.feature,
          provider: actualProvider,
          model,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          cachedTokens: params.cachedTokens ?? 0,
          totalTokens,
          estimatedCost,
          blueberryTokens,
        },
      });
    } catch (error) {
      // P2003 = foreign key constraint violation. Most commonly happens
      // when the user or workspace referenced by the queued job was
      // deleted between enqueue and worker execution (e.g. test cleanup,
      // GDPR delete, manual DB reset). Downgrade to a warn — usage
      // logging is fire-and-forget telemetry; losing one log row is
      // strictly better than spamming Sentry with red errors on every
      // diarized recording of a deleted account.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        const target =
          (error.meta as { constraint?: string } | undefined)?.constraint ?? "unknown_constraint";
        logger.warn(
          `[aiUsage] Skipping log — referenced row is gone (${target}). ` +
            `userId=${params.userId} workspaceId=${params.workspaceId} ` +
            `projectId=${params.projectId ?? "—"} feature=${params.feature}`,
        );
        return;
      }
      logger.error("Failed to log AI usage", error);
    }
  }
}

export const aiUsageService = new AiUsageService();
