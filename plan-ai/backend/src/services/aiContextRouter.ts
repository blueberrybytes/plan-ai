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
  // 2026 Fleet - High Capacity & Reasoning
  "google/gemini-3.1-pro-preview": {
    modelName: "Gemini 3.1 Pro",
    maxTokens: 1050000,
    description:
      "Google's flagship 2026 model. Best for massive datasets, huge codebases, and deep document analysis.",
    tags: ["High Context", "Reasoning", "Google"],
  },
  "anthropic/claude-sonnet-4.6": {
    modelName: "Claude 4.6 Sonnet",
    maxTokens: 1000000,
    description:
      "Anthropic's latest workhorse. Perfect balance of blinding speed and near-AGI coding & writing capabilities.",
    tags: ["Balanced", "Coding", "Anthropic"],
  },
  "anthropic/claude-opus-4.7": {
    modelName: "Claude 4.7 Opus",
    maxTokens: 1000000,
    description:
      "Anthropic's most powerful agentic model. Built for long-running multi-step tasks, complex codebases, and end-to-end project orchestration. #2 in Programming.",
    tags: ["High Reasoning", "Agentic", "Anthropic"],
  },

  // 2026 Fleet - Fast & Efficient
  "google/gemini-2.5-flash": {
    modelName: "Gemini 2.5 Flash",
    maxTokens: 1000000,
    description:
      "Incredibly fast response times with a massive context window. Ideal for live chat and basic RAG.",
    tags: ["Fast", "Chat", "Google"],
  },
  "openai/gpt-5.5": {
    modelName: "GPT-5.5",
    maxTokens: 1050000,
    description:
      "OpenAI's frontier model with 1M+ context, strong reasoning and high reliability. Excellent cache hit rate makes it cost-efficient for repeated context.",
    tags: ["Frontier", "High Context", "OpenAI"],
  },
  "deepseek/deepseek-r1": {
    modelName: "DeepSeek R1",
    maxTokens: 64000,
    description:
      "DeepSeek's frontier reasoning model. Specialized in chain-of-thought logic and system architecture.",
    tags: ["Reasoning", "Open Source", "DeepSeek"],
  },
  "meta-llama/llama-3.3-70b-instruct": {
    modelName: "Llama 3.3 70B (Groq)",
    maxTokens: 128000,
    description: "Meta's flagship open LLM, optimized for instruction following and general tasks.",
    tags: ["Open Source", "Meta", "Groq"],
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
