import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "./EnvUtils";
import { AI_MODEL_LIMITS } from "../services/aiContextRouter";
import prisma from "../prisma/prismaClient";

export const DEFAULT_AI_MODEL = "anthropic/claude-3.7-sonnet";
export const FALLBACK_MODELS = [
  "openai/gpt-4o",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
];

/**
 * Returns a configured model instance dynamically with an optional API key.
 */
export function getConfiguredModel(modelKey?: string, apiKey?: string) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);
  
  const openrouter = createOpenRouter({
    apiKey: apiKey || EnvUtils.get("OPENROUTER_API_KEY"),
  });

  return openrouter(primaryModel, { models: fallbacks });
}

/**
 * Helper to fetch a Workspace's OpenRouter API key and return a configured model.
 */
export async function getWorkspaceModel(workspaceId: string, modelKey?: string) {
  let apiKey: string | undefined = undefined;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { openRouterKey: true },
    });
    if (workspace?.openRouterKey) {
      apiKey = workspace.openRouterKey;
    }
  } catch (error) {
    console.warn(`[getWorkspaceModel] Failed to fetch workspace ${workspaceId}`, error);
  }
  return getConfiguredModel(modelKey, apiKey);
}

/**
 * Returns the Vercel AI providerOptions object with model fallbacks configured.
 */
export function getFallbackProviderOptions(modelKey?: string) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);
  return {
    openrouter: {
      models: fallbacks,
    },
  };
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
