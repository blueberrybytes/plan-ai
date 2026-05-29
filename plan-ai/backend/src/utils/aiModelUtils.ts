import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "./EnvUtils";
import { AI_MODEL_LIMITS } from "../services/aiContextRouter";
import prisma from "../prisma/prismaClient";
import { logger } from "./logger";

export const DEFAULT_AI_MODEL = "minimax/minimax-m2.7";
export const FAST_AI_MODEL = "minimax/minimax-m2.7";
// ── Per-task model selection ───────────────────────────────────────────────
// Gemini 2.5 Flash is the cheap + reliable default for structured extraction
// and prose: ~same cost as minimax but far more dependable on json_schema and
// better writing. Diagrams use a stronger model because Mermaid syntax is
// strict — a single error makes the diagram unrenderable, so it's worth a
// pricier model on those few calls (and the same model repairs broken syntax).
export const TICKET_MODEL = "google/gemini-2.5-flash"; // task/ticket extraction
export const DOC_MODEL = "google/gemini-2.5-flash"; // markdown document generation
export const SLIDE_MODEL = "google/gemini-2.5-flash"; // slide deck generation
export const DIAGRAM_MODEL = "anthropic/claude-sonnet-4.6"; // Mermaid generation + repair

// Model used for the "big-context cached" route (e.g. injecting a whole repo).
// Gemini 2.5 Flash: 1M context (a stripped repo fits), cheap, reliable
// json_schema, and Google applies *implicit* prompt caching automatically — no
// `cache_control` needed (that directive is Anthropic-only). We pin the provider
// (allow_fallbacks: false) so repeated calls in a meeting's burst hit the same
// endpoint and reuse the warm cache instead of bouncing across providers.
export const CACHED_CONTEXT_MODEL = "google/gemini-2.5-flash";
// Fallback models used when the primary model fails.
// IMPORTANT: Every model in this list MUST support json_schema structured
// output on OpenRouter — we use Output.object() across the entire app and
// the fallback must be able to handle it too.
export const FALLBACK_MODELS = [
  "openai/gpt-4o-mini",          // gold standard for json_schema, cheap & fast
  "openai/gpt-4.1-mini",         // newer OpenAI, also reliable structured output
  "anthropic/claude-sonnet-4.6", // confirmed structured output support
];

export class MissingApiKeyError extends Error {
  constructor() {
    super("MISSING_API_KEY: Please configure an OpenRouter API key in your Workspace Settings to use AI features.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Returns a configured model instance dynamically with an optional API key.
 * Fallbacks are always enabled — every model in FALLBACK_MODELS supports
 * json_schema structured output so it is always safe to fall back.
 */
export function getConfiguredModel(modelKey?: string, apiKey?: string) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);

  const openrouter = createOpenRouter({
    apiKey: apiKey || EnvUtils.get("OPENROUTER_API_KEY"),
  });

  return openrouter(primaryModel, fallbacks.length > 0 ? { models: fallbacks } : undefined);
}

/**
 * Helper to fetch a Workspace's OpenRouter API key and return a configured model.
 * Fallbacks are always enabled — see FALLBACK_MODELS for the curated safe list.
 */
async function resolveWorkspaceApiKey(workspaceId: string): Promise<string> {
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
    logger.error(`[resolveWorkspaceApiKey] Failed to fetch workspace ${workspaceId}`, error);
  }

  // Fallback to the global key ONLY if the workspace has courtesy access
  if (!apiKey && isCourtesy) {
    apiKey = EnvUtils.get("OPENROUTER_API_KEY");
  }

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  return apiKey;
}

export async function getWorkspaceModel(workspaceId: string, modelKey?: string) {
  const apiKey = await resolveWorkspaceApiKey(workspaceId);
  return getConfiguredModel(modelKey, apiKey);
}

/**
 * Model for the "big-context cached" route — injecting a whole repo / large
 * stable context that should stay warm in the provider's prompt cache across a
 * burst of calls (ticket + doc + slides + chat for one meeting).
 *
 * Uses CACHED_CONTEXT_MODEL (Gemini 2.5 Flash) and pins the provider
 * (`allow_fallbacks: false`) so OpenRouter doesn't bounce repeated calls across
 * providers — which would cold-miss the cache every time. We deliberately do NOT
 * attach the wide model-fallback list here: falling back to a different model
 * also discards the cache, and the caller already handles failures (Fix A throw
 * → FAILED → retry). Gemini's prompt caching is implicit (Google-side), so no
 * `cache_control` directive is needed; keeping the prompt PREFIX byte-stable is
 * what earns the cache hit.
 */
export async function getCachedContextModel(workspaceId: string) {
  const apiKey = await resolveWorkspaceApiKey(workspaceId);
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(CACHED_CONTEXT_MODEL, {
    provider: { allow_fallbacks: false },
  });
}

/**
 * providerOptions for the cached-context route. Mirror of getCachedContextModel
 * for call sites that pass providerOptions explicitly (generateText/generateObject).
 */
export function getCachedContextProviderOptions() {
  return { openrouter: { provider: { allow_fallbacks: false } } };
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
