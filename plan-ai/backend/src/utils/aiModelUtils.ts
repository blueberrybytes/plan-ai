import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "./EnvUtils";
import { AI_MODEL_LIMITS } from "../services/aiContextRouter";
import prisma from "../prisma/prismaClient";
import { logger } from "./logger";

export const DEFAULT_AI_MODEL = "minimax/minimax-m2.7";
export const FAST_AI_MODEL = "google/gemini-2.5-flash";
export const FALLBACK_MODELS = [
  "qwen/qwen3.5-flash-02-23",
  "openai/gpt-5.5",
  "google/gemini-2.5-flash",
  "google/gemini-3.1-pro-preview",
];

export class MissingApiKeyError extends Error {
  constructor() {
    super("MISSING_API_KEY: Please configure an OpenRouter API key in your Workspace Settings to use AI features.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Returns a configured model instance dynamically with an optional API key.
 */
export function getConfiguredModel(modelKey?: string, apiKey?: string, disableFallbacks: boolean = false) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = disableFallbacks ? [] : FALLBACK_MODELS.filter((m) => m !== primaryModel);

  const openrouter = createOpenRouter({
    apiKey: apiKey || EnvUtils.get("OPENROUTER_API_KEY"),
  });

  return openrouter(primaryModel, fallbacks.length > 0 ? { models: fallbacks } : undefined);
}

/**
 * Helper to fetch a Workspace's OpenRouter API key and return a configured model.
 */
export async function getWorkspaceModel(workspaceId: string, modelKey?: string, disableFallbacks: boolean = false) {
  let apiKey: string | undefined = undefined;
  let isCourtesy = false;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { openRouterKey: true, isCourtesy: true },
    });

    if (workspace?.isCourtesy) {
      isCourtesy = true;
    }

    // Only accept valid-looking OpenRouter keys (sk-or-)
    if (workspace?.openRouterKey && workspace.openRouterKey.trim().startsWith("sk-or-")) {
      apiKey = workspace.openRouterKey.trim();
    }
  } catch (error) {
    logger.error(`[getWorkspaceModel] Failed to fetch workspace ${workspaceId}`, error);
  }

  // Fallback to the global key ONLY if the workspace has courtesy access
  if (!apiKey && isCourtesy) {
    apiKey = EnvUtils.get("OPENROUTER_API_KEY");
  }

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  return getConfiguredModel(modelKey, apiKey, disableFallbacks);
}

/**
 * Returns the Vercel AI providerOptions object with model fallbacks configured.
 */
export function getFallbackProviderOptions(modelKey?: string) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);
  return fallbacks.length > 0
    ? { openrouter: { models: fallbacks } }
    : undefined;
}

/**
 * Returns the maximum number of RAG context chunks safe for the given model's context window.
 * Dynamically calculated based on the precise maxTokens configured in AI_MODEL_LIMITS.
 * A single chunk is typically ~800 characters (~200 tokens).
 */
export function getMaxContextChunks(modelKey?: string): number {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const limits = AI_MODEL_LIMITS[primaryModel];

  if (!limits) {
    return 300; // Default fallback for unknown models
  }

  // Massive context models (1M+ tokens)
  if (limits.maxTokens >= 1000000) {
    return 1500; // ~300k tokens MAX
  }

  // Standard context models (e.g., 128k, 200k)
  if (limits.maxTokens >= 100000) {
    return 500; // ~100k tokens MAX
  }

  // Small context models
  return 300;
}
