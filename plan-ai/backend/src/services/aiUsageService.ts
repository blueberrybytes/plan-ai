import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { pricingCacheService } from "./pricingCacheService";

const BLUEBERRY_TOKEN_MARKUP = 2;
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
}

export class AiUsageService {
  /**
   * Fire-and-forget asynchronous log insertion.
   */
  public async logUsage(params: LogUsageParams): Promise<void> {
    const totalTokens = params.inputTokens + params.outputTokens;
    let actualProvider = params.provider;

    // Automatically parse provider from OpenRouter model ids (e.g., "google/gemini-2.5-flash" -> "GOOGLE")
    if (params.model.includes("/")) {
      const parts = params.model.split("/");
      actualProvider = parts[0].toUpperCase();
    }

    let estimatedCost = 0;
    const pricingMap = pricingCacheService.getAllPricing();

    if (pricingMap[params.model]) {
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

    const blueberryTokens = Math.max(
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
          model: params.model,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          totalTokens,
          estimatedCost,
          blueberryTokens,
        },
      });
    } catch (error) {
      logger.error("Failed to log AI usage", error);
    }
  }
}

export const aiUsageService = new AiUsageService();
