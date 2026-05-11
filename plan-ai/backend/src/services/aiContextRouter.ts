import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

export interface ModelLimits {
  modelName: string;
  maxTokens: number;
  description: string;
  tags: string[];
}

// Supported models and their safe max token context limits
export const AI_MODEL_LIMITS: Record<string, ModelLimits> = {
  "anthropic/claude-3.7-sonnet": {
    modelName: "Claude 3.7 Sonnet",
    maxTokens: 200000,
    description: "Anthropic's latest workhorse. Perfect balance of speed and coding & writing capabilities.",
    tags: ["Balanced", "Coding", "Anthropic"],
  },
  "openai/gpt-4o": {
    modelName: "GPT-4o",
    maxTokens: 128000,
    description: "OpenAI's flagship model with strong reasoning, structured outputs, and high reliability.",
    tags: ["Reliable", "OpenAI"],
  },
  "google/gemini-2.5-pro": {
    modelName: "Gemini 2.5 Pro",
    maxTokens: 2000000,
    description: "Google's flagship model with a massive context window. Best for huge codebases.",
    tags: ["High Context", "Reasoning", "Google"],
  },
  "google/gemini-2.5-flash": {
    modelName: "Gemini 2.5 Flash",
    maxTokens: 1000000,
    description: "Incredibly fast response times with a massive context window. Ideal for live chat.",
    tags: ["Fast", "Chat", "Google"],
  },
  "deepseek/deepseek-r1": {
    modelName: "DeepSeek R1",
    maxTokens: 64000,
    description: "DeepSeek's frontier reasoning model. Specialized in chain-of-thought logic.",
    tags: ["Reasoning", "Open Source", "DeepSeek"],
  },
};

// 80% usage threshold to leave room for the actual prompt & transcript text
const SAFETY_THRESHOLD = 0.8;

// Rough heuristic: 1 token is approximately 4 bytes (characters) of English text.
// We use 3.5 to be slightly more conservative.
const BYTES_PER_TOKEN_HEURISTIC = 3.5;

export type ContextInjectionStrategy = "FULL_INJECTION" | "RAG";

export interface ContextRouterResult {
  strategy: ContextInjectionStrategy;
  estimatedTokens: number;
  maxTokensSelected: number;
  totalSizeBytes: number;
}

export class AIContextRouter {
  /**
   * Calculates the combined size of the requested contexts in bytes and compares it to the LLM's capacity.
   * If it fits safely inside the context window, it returns FULL_INJECTION. Otherwise, RAG.
   */
  public async decideStrategy(
    contextIds: string[],
    modelKey: string,
  ): Promise<ContextRouterResult> {
    if (!contextIds || contextIds.length === 0) {
      return {
        strategy: "FULL_INJECTION",
        estimatedTokens: 0,
        maxTokensSelected: 0,
        totalSizeBytes: 0,
      };
    }

    const limits = AI_MODEL_LIMITS[modelKey];
    if (!limits) {
      logger.warn(
        `Model key [${modelKey}] not found in AI_MODEL_LIMITS router. Defaulting to RAG.`,
      );
      return {
        strategy: "RAG",
        estimatedTokens: -1,
        maxTokensSelected: 0,
        totalSizeBytes: 0,
      };
    }

    // Aggregate total sizeBytes of all files across all selected context IDs
    const aggregations = await prisma.contextFile.aggregate({
      where: { contextId: { in: contextIds } },
      _sum: { sizeBytes: true },
    });

    const totalSizeBytes = aggregations._sum.sizeBytes ?? 0;
    const estimatedTokens = Math.ceil(totalSizeBytes / BYTES_PER_TOKEN_HEURISTIC);
    const maximumAllowedTokens = limits.maxTokens * SAFETY_THRESHOLD;

    const strategy: ContextInjectionStrategy =
      estimatedTokens < maximumAllowedTokens ? "FULL_INJECTION" : "RAG";

    logger.info(
      `AI Context Router [${modelKey}]: Estimated ${estimatedTokens} tokens (${totalSizeBytes} bytes). Context Window limit is ${limits.maxTokens}. Selected Strategy: ${strategy}`,
    );

    return {
      strategy,
      estimatedTokens,
      maxTokensSelected: maximumAllowedTokens,
      totalSizeBytes,
    };
  }
}

export const aiContextRouter = new AIContextRouter();
