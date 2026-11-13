import { createOpenRouter, type OpenRouterUsageAccounting } from "@openrouter/ai-sdk-provider";
import EnvUtils from "./EnvUtils";
import { AI_MODEL_LIMITS } from "../services/aiContextRouter";
import prisma from "../prisma/prismaClient";
import { logger } from "./logger";
import { withDecryptedWorkspaceKeys } from "./workspaceSecrets";
import { SecretCryptoError } from "./secretCrypto";
import { PLATFORM_KEY_SELECT, usesPlatformKeys } from "../services/platformKeys";
import {
  getEmbeddingsProvider,
  getLlmProvider,
  getLocalEmbeddingsConfig,
  getLocalLanguageModel,
} from "./localAi";

// GPT-6 Luna. Handles structured extraction and prose for the whole app.
//
// Replaced Gemini 3.7 Flash on 2026-11-13. Flash went up to $0.75/$3.75 per 1M
// (it was $0.375/$1.875 in August). Luna costs $0.10/$0.50 at list price, with
// no promotion behind it, and a 1.05M context.
//
// Picked with `yarn eval:models` on eight meetings, using the real analysis
// prompt and schema with no fallbacks. Luna was the only cheap model with valid
// JSON 8 of 8 times, the meeting's language every time and every quoted
// "evidence" present word for word in the transcript. Measured cost per
// analysis: $0.0026 against $0.0164 on Flash. It is slower (38 s median against
// 22 s), which is fine for background jobs. Full results in MODELOS.md.
export const DEFAULT_AI_MODEL = "openai/gpt-6-luna";

// FAST is deliberately a rung BELOW the default. It used to be the same model,
// which made the name a lie and the constant pointless. Flash Lite keeps the
// Gemini behaviour (same tokenizer, same json_schema handling, same implicit
// Google caching) at ~$0.10/$0.40 per 1M instead of $0.375/$1.875, and it's what
// powers chat, context-document processing and the Telegram agent: high volume,
// low stakes per call, and a bad answer is immediately visible and retryable.
//
// Staying on 2.5 Flash Lite on purpose. The 3.1 generation of Lite costs
// $0.25/$1.50, which is nearly a full Flash, so moving up would collapse the
// gap this constant exists to keep.
//
// Rechecked on 2026-11-13 for live translation against seven newer cheap
// models: still the fastest (0.8 s median per phrase) and the cheapest. It is
// not used for the meeting analysis because it once wrote a Spanish meeting's
// whole analysis in English.
export const FAST_AI_MODEL = "google/gemini-2.5-flash-lite";

// ── Per-task model selection ───────────────────────────────────────────────
// These three all track the default. They're separate constants so a task can
// be moved on its own when there's a reason to, not because they differ today.
// DOC_MODEL also drives mockups and HTML prototypes.
export const TICKET_MODEL = "openai/gpt-6-luna"; // task/ticket extraction
export const DOC_MODEL = "openai/gpt-6-luna"; // markdown document generation
export const SLIDE_MODEL = "openai/gpt-6-luna"; // slide deck generation
// Haiku 5.5: $0.10/$0.50 per 1M, a tenth of Haiku 4.5's $1/$5, same family.
//
// Mermaid's grammar is strict, which is why this stays on Anthropic. The
// frontend runs `repairMermaidSyntax` before every render, with targeted fixes
// for the failures seen in the wild (quotes inside labels, xychart corruption,
// zero-duration Gantt tasks), so a syntax slip is not fatal.
//
// Haiku 5.5 must NOT be used for structured output. It rejects the meeting
// analysis schema ("too many parameters with union types": 24 nullable fields).
// Diagrams are streamed as plain text, so that limit does not apply here. If
// diagram quality regresses, measure it with the Mermaid parser rather than by
// eye (see MODELOS.md).
export const DIAGRAM_MODEL = "anthropic/claude-haiku-5.5"; // Mermaid generation + repair

// Quick title and summary right after a meeting, and the optional codebase
// investigation before task extraction. These were "openai/gpt-4o-mini" written
// by hand (a 2024 model, $0.15/$0.60, 128k context).
export const QUICK_SUMMARY_MODEL = DEFAULT_AI_MODEL;

// Model used for the "big-context cached" route (e.g. injecting a whole repo).
// Left on Gemini when the default moved to Luna: moving it needs OpenAI's
// caching measured first.
// Gemini 3.7 Flash: 1M context (a stripped repo fits), cheap, reliable
// json_schema, and Google applies *implicit* prompt caching automatically, with
// no `cache_control` needed (that directive is Anthropic-only). We pin the
// provider (allow_fallbacks: false) so repeated calls in a meeting's burst hit
// the same endpoint and reuse the warm cache instead of bouncing across
// providers.
//
// Pinning is why this constant must stay on a model whose smallest route serves
// the full window: with fallbacks off there is no reroute to a bigger endpoint.
export const CACHED_CONTEXT_MODEL = "google/gemini-3.7-flash";
// Fallback models used when the primary model fails.
//
// Two rules, both learned the hard way:
//
// 1. Every model here MUST support json_schema structured output on
//    OpenRouter — we use Output.object() across the entire app, and a fallback
//    that can't honour a schema turns a recoverable failure into a parse error.
//
// 2. The first fallback must NOT share a provider with the primary model. If
//    OpenAI is the reason the primary failed, an OpenAI fallback fails with it.
//
// The list is shared by primaries from three providers (OpenAI for the default,
// Google for FAST and the cached route, Anthropic for diagrams), and
// getConfiguredModel drops the primary itself from it. So the order matters:
// a Luna call falls back to Gemini, a Gemini call falls back to Luna, and
// Sonnet is the last resort for everything.
//
// Context matters more than price here: fallbacks fire rarely, but they fire on
// the hardest requests. `gpt-4o-mini` was picked as the cheap "gold standard"
// and capped at 128k, too small for a long meeting with injected context, so
// it failed exactly when it was needed. Prices verified 2026-11-13.
export const FALLBACK_MODELS = [
  "openai/gpt-6-luna", // 1.05M context, $0.10/$0.50
  "google/gemini-3.7-flash", // 1M context, $0.75/$3.75, the previous default
  "anthropic/claude-sonnet-5", // 1M context, $2/$10, last resort
];

/**
 * OpenRouter routing rules that keep meeting content private: only providers
 * that do not store prompts to train on them (`data_collection: "deny"`).
 * OPENROUTER_ZDR=true narrows it to zero-data-retention endpoints.
 * OPENROUTER_DATA_COLLECTION=allow removes the rule (not recommended).
 */
export function privacyProviderPrefs(): { data_collection?: "deny"; zdr?: boolean } {
  return {
    ...(process.env.OPENROUTER_DATA_COLLECTION === "allow"
      ? {}
      : { data_collection: "deny" as const }),
    ...(process.env.OPENROUTER_ZDR === "true" ? { zdr: true } : {}),
  };
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "MISSING_API_KEY: Please configure an OpenRouter API key in your Workspace Settings to use AI features.",
    );
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
  // Self-hosted (LLM_PROVIDER=local): one local model stands in for whatever
  // id was asked for, and no key is involved. See utils/localAi.ts.
  if (getLlmProvider() === "local") return getLocalLanguageModel(primaryModel === FAST_AI_MODEL);
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);

  const openrouter = createOpenRouter({
    apiKey: apiKey || EnvUtils.get("OPENROUTER_API_KEY"),
  });

  return openrouter(primaryModel, {
    ...(fallbacks.length > 0 ? { models: fallbacks } : {}),
    provider: privacyProviderPrefs(),
  });
}

/**
 * Helper to fetch a Workspace's OpenRouter API key and return a configured model.
 * Fallbacks are always enabled — see FALLBACK_MODELS for the curated safe list.
 */
export async function resolveWorkspaceApiKey(workspaceId: string): Promise<string> {
  let apiKey: string | undefined = undefined;
  let platformKeys = false;

  try {
    const workspace = withDecryptedWorkspaceKeys(
      await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { openRouterKey: true, ...PLATFORM_KEY_SELECT },
      }),
    );

    if (usesPlatformKeys(workspace)) {
      platformKeys = true;
    }

    // Only accept valid-looking OpenRouter keys (sk-or-)
    if (workspace?.openRouterKey && workspace.openRouterKey.trim().startsWith("sk-or-")) {
      apiKey = workspace.openRouterKey.trim();
    }
  } catch (error) {
    // A key that exists but cannot be read must fail, not quietly move the
    // cost to the platform's keys.
    if (error instanceof SecretCryptoError) throw error;
    logger.error(`[resolveWorkspaceApiKey] Failed to fetch workspace ${workspaceId}`, error);
  }

  // The platform's key only for courtesy workspaces and paid MANAGED plans.
  if (!apiKey && platformKeys) {
    apiKey = EnvUtils.get("OPENROUTER_API_KEY");
  }

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  return apiKey;
}

export async function getWorkspaceModel(workspaceId: string, modelKey?: string) {
  if (getLlmProvider() === "local") return getConfiguredModel(modelKey);
  const apiKey = await resolveWorkspaceApiKey(workspaceId);
  return getConfiguredModel(modelKey, apiKey);
}

/**
 * Resolve the OpenAI API key used for EMBEDDINGS (BYOK). Order:
 *   1. The workspace's own `openaiKey` (must look like `sk-`).
 *   2. The global `OPENAI_API_KEY` for courtesy workspaces.
 *   3. Safety-net fallback to the global key (with a warning) so RAG keeps
 *      working for workspaces that haven't configured their key yet.
 * Returns `{ apiKey, usedFallback }`; `usedFallback` flags that the cost lands
 * on the platform key rather than the customer's (useful for usage logging).
 */
export async function resolveWorkspaceOpenAIKey(
  workspaceId: string,
): Promise<{ apiKey: string; usedFallback: boolean }> {
  let apiKey: string | undefined = undefined;
  let isCourtesy = false;

  try {
    const workspace = withDecryptedWorkspaceKeys(
      await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { openaiKey: true, isCourtesy: true },
      }),
    );
    if (workspace?.isCourtesy) isCourtesy = true;
    // Only accept valid-looking OpenAI keys (sk-…), not an OpenRouter key.
    if (
      workspace?.openaiKey &&
      workspace.openaiKey.trim().startsWith("sk-") &&
      !workspace.openaiKey.trim().startsWith("sk-or-")
    ) {
      return { apiKey: workspace.openaiKey.trim(), usedFallback: false };
    }
  } catch (error) {
    // A key that exists but cannot be read must fail, not quietly move the
    // cost to the platform's keys.
    if (error instanceof SecretCryptoError) throw error;
    logger.error(`[resolveWorkspaceOpenAIKey] Failed to fetch workspace ${workspaceId}`, error);
  }

  // Courtesy workspaces use the global key by design.
  if (isCourtesy) {
    apiKey = EnvUtils.get("OPENAI_API_KEY");
    if (apiKey) return { apiKey, usedFallback: false };
  }

  // Safety net: fall back to the global key so RAG doesn't break for workspaces
  // that haven't set their OpenAI key. Cost lands on the platform — flagged.
  apiKey = EnvUtils.get("OPENAI_API_KEY");
  if (apiKey) {
    logger.warn(
      `[resolveWorkspaceOpenAIKey] Workspace ${workspaceId} has no OpenAI key — falling back to the platform key for embeddings.`,
    );
    return { apiKey, usedFallback: true };
  }

  throw new MissingApiKeyError();
}

/** OpenAI-compatible base URL for OpenRouter (chat, embeddings, …). */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface WorkspaceEmbeddingConfig {
  apiKey: string;
  /** Set when embeddings go through OpenRouter (OpenAI-compatible) vs OpenAI directly. */
  baseURL?: string;
  /** Embedding model id — namespaced for OpenRouter, plain for OpenAI. */
  model: string;
  /** True when the cost lands on a platform key rather than the workspace's own. */
  usedFallback: boolean;
}

/**
 * Resolve the embedding client config for a workspace. Embeddings now run
 * through the workspace's OpenRouter key (OpenRouter shipped an OpenAI-compatible
 * embeddings endpoint), so BYOK needs only 2 keys: OpenRouter + Deepgram.
 *
 * Resolution order:
 *   1. Workspace `openRouterKey` (sk-or-…) → OpenRouter, `openai/text-embedding-3-small`.
 *   2. Backward-compat: workspace `openaiKey` (sk-…) → OpenAI directly, `text-embedding-3-small`.
 *   3. Courtesy / safety net: global OPENROUTER_API_KEY, then OPENAI_API_KEY.
 *
 * Both routes use the SAME underlying model (1536-dim), so existing Qdrant
 * vectors stay compatible — no re-embedding needed.
 */
export async function resolveWorkspaceEmbeddingConfig(
  workspaceId: string,
): Promise<WorkspaceEmbeddingConfig> {
  if (getEmbeddingsProvider() === "local") {
    const local = getLocalEmbeddingsConfig();
    return {
      apiKey: local.apiKey ?? "local",
      baseURL: local.baseUrl,
      model: local.model,
      usedFallback: false,
    };
  }

  const OR_MODEL = "openai/text-embedding-3-small";
  const OAI_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  let isCourtesy = false;
  try {
    const workspace = withDecryptedWorkspaceKeys(
      await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { openRouterKey: true, openaiKey: true, ...PLATFORM_KEY_SELECT },
      }),
    );
    if (usesPlatformKeys(workspace)) isCourtesy = true;

    const orKey = workspace?.openRouterKey?.trim();
    if (orKey && orKey.startsWith("sk-or-")) {
      return { apiKey: orKey, baseURL: OPENROUTER_BASE_URL, model: OR_MODEL, usedFallback: false };
    }
    // Backward compatibility: workspaces that still carry a dedicated OpenAI key.
    const oaiKey = workspace?.openaiKey?.trim();
    if (oaiKey && oaiKey.startsWith("sk-") && !oaiKey.startsWith("sk-or-")) {
      return { apiKey: oaiKey, model: OAI_MODEL, usedFallback: false };
    }
  } catch (error) {
    // A key that exists but cannot be read must fail, not quietly move the
    // cost to the platform's keys.
    if (error instanceof SecretCryptoError) throw error;
    logger.error(
      `[resolveWorkspaceEmbeddingConfig] Failed to fetch workspace ${workspaceId}`,
      error,
    );
  }

  // Courtesy workspaces + safety net for unconfigured workspaces: global keys,
  // preferring OpenRouter so we stay on a single provider.
  const globalOpenRouter = EnvUtils.get("OPENROUTER_API_KEY");
  if (globalOpenRouter) {
    if (!isCourtesy) {
      logger.warn(
        `[resolveWorkspaceEmbeddingConfig] Workspace ${workspaceId} has no usable key — using platform OpenRouter key for embeddings.`,
      );
    }
    return {
      apiKey: globalOpenRouter,
      baseURL: OPENROUTER_BASE_URL,
      model: OR_MODEL,
      usedFallback: !isCourtesy,
    };
  }
  const globalOpenAI = EnvUtils.get("OPENAI_API_KEY");
  if (globalOpenAI) {
    return { apiKey: globalOpenAI, model: OAI_MODEL, usedFallback: !isCourtesy };
  }
  throw new MissingApiKeyError();
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
  if (getLlmProvider() === "local") return getLocalLanguageModel();
  const apiKey = await resolveWorkspaceApiKey(workspaceId);
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(CACHED_CONTEXT_MODEL, {
    provider: { ...privacyProviderPrefs(), allow_fallbacks: false },
  });
}

/**
 * providerOptions for the cached-context route. Mirror of getCachedContextModel
 * for call sites that pass providerOptions explicitly (generateText/generateObject).
 */
export function getCachedContextProviderOptions() {
  return {
    openrouter: {
      provider: { ...privacyProviderPrefs(), allow_fallbacks: false },
      usage: { include: true },
    },
  };
}

/**
 * Returns the Vercel AI providerOptions object with model fallbacks configured.
 */
export function getFallbackProviderOptions(modelKey?: string) {
  const primaryModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
  const fallbacks = FALLBACK_MODELS.filter((m) => m !== primaryModel);
  // `usage: { include: true }` turns on OpenRouter usage accounting so the
  // response carries the REAL cost + cached-token breakdown (see
  // extractOpenRouterUsage). Always enabled, even without model fallbacks.
  return {
    openrouter: {
      ...(fallbacks.length > 0 ? { models: fallbacks } : {}),
      provider: privacyProviderPrefs(),
      usage: { include: true },
    },
  };
}

/**
 * Same as getFallbackProviderOptions, but additionally enables OpenRouter's
 * `response-healing` plugin, which auto-repairs malformed JSON returned by the
 * model (trailing commas, unterminated strings, wrong quoting…) instead of
 * letting the whole structured generation throw.
 *
 * IMPORTANT: use this ONLY for NON-STREAMING structured output — i.e.
 * `generateText`/`generateObject` with `Output.object` (which sends
 * `response_format: json_schema`). The plugin is a no-op on `streamText`
 * (per the provider's own typings), so do NOT use it on streaming call sites.
 */
export function getStructuredProviderOptions(modelKey?: string) {
  const base = getFallbackProviderOptions(modelKey);
  return {
    openrouter: {
      ...base.openrouter,
      plugins: [{ id: "response-healing" as const }],
    },
  };
}

/**
 * Same as getStructuredProviderOptions, but PINS the upstream provider
 * (`provider.allow_fallbacks: false`) so OpenRouter doesn't bounce repeated
 * calls across different providers/endpoints of the same model — which
 * cold-misses Gemini's implicit prompt cache (TTL ~3–5 min). Measured: an
 * un-pinned route flip-flopped 0% → 95% → 0% cached prompt tokens on identical
 * back-to-back calls, while the pinned route held ~95% (cost −77% on a warm
 * call). Provider-pinning and the json_schema MODEL fallbacks (FALLBACK_MODELS)
 * are orthogonal in OpenRouter — `allow_fallbacks` only stops *provider*
 * bouncing — so the structured-output safety net stays intact.
 */
export function getCachedStructuredProviderOptions(modelKey?: string) {
  const base = getStructuredProviderOptions(modelKey);
  return {
    openrouter: {
      ...base.openrouter,
      provider: { ...privacyProviderPrefs(), allow_fallbacks: false },
    },
  };
}

/**
 * Provider options that also turn ON OpenRouter reasoning tokens, so the model
 * streams its chain-of-thought. Reasoning-capable models (Gemini 2.5, Claude,
 * DeepSeek, …) emit `reasoning-delta` stream parts; models that don't support it
 * simply ignore the flag (graceful no-op). Used to power the live "thinking"
 * panel in chat.
 */
export function getReasoningProviderOptions(
  modelKey?: string,
  effort: "high" | "medium" | "low" = "medium",
) {
  const base = getFallbackProviderOptions(modelKey);
  return {
    openrouter: {
      ...base.openrouter,
      reasoning: { effort },
    },
  };
}

export interface ExtractedUsage {
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from the provider's cache (Gemini/Anthropic). */
  cachedTokens: number;
  /** Real cost in USD reported by OpenRouter, when usage accounting is on. */
  cost?: number;
}

/**
 * Pull real usage out of a generateText/generateObject result. Prefers
 * OpenRouter's usage accounting (real cost + cached tokens, requires
 * `usage: { include: true }`) and falls back to the SDK's basic token counts.
 */
export function extractOpenRouterUsage(result: {
  usage?: { inputTokens?: number; outputTokens?: number };
  totalUsage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: Record<string, unknown>;
}): ExtractedUsage {
  const openrouterMeta = result.providerMetadata?.openrouter as
    | { usage?: OpenRouterUsageAccounting }
    | undefined;
  const orUsage = openrouterMeta?.usage;
  const base = result.totalUsage ?? result.usage;
  return {
    inputTokens: orUsage?.promptTokens ?? base?.inputTokens ?? 0,
    outputTokens: orUsage?.completionTokens ?? base?.outputTokens ?? 0,
    cachedTokens: orUsage?.promptTokensDetails?.cachedTokens ?? 0,
    cost: orUsage?.cost,
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
