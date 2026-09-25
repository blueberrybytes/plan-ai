import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { logger } from "./logger";

/**
 * Self-hosted language model and embeddings, for deployments where no text
 * may leave the customer's infrastructure. Backend-wide, like STT_PROVIDER:
 * it's a decision about the deployment, not about a workspace.
 *
 *   LLM_PROVIDER=openrouter   (default) OpenRouter, with the workspace's key
 *   LLM_PROVIDER=local        any OpenAI-compatible server: Ollama, vLLM,
 *                             LM Studio, llama.cpp server
 *
 *   EMBEDDINGS_PROVIDER=openrouter  (default) text-embedding-3-small
 *   EMBEDDINGS_PROVIDER=local       an embedding model on the same kind of
 *                                   server. Different vector size, so it needs
 *                                   its own Qdrant collection (see below).
 *
 * With `local`, every model the app asks for (the default, the diagram model,
 * whatever a workspace picked in the UI) resolves to the one local model:
 * a self-hosted box runs one model, not a catalogue.
 */

export type LlmProvider = "openrouter" | "local";

export interface LocalLlmConfig {
  /** OpenAI-compatible base URL, including /v1. */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Model for high-volume, low-stakes calls (FAST_AI_MODEL). Defaults to `model`. */
  fastModel: string;
  /** Context window of the local model, for the RAG-vs-inject decision. */
  contextTokens: number;
}

export interface LocalEmbeddingsConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Vector size of `model`; Qdrant collections are created with it. */
  dimension: number;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
// Gemma 3 27B: multilingual, ~17 GB in 4 bits, and not a "thinking" model.
// Models that write out their reasoning before answering can break strict
// JSON output, which the whole pipeline depends on.
const DEFAULT_LOCAL_MODEL = "gemma3:27b";
const DEFAULT_LOCAL_CONTEXT = 32768;
// bge-m3: multilingual (Spanish, Catalan, Arabic, English), 1024 dimensions.
const DEFAULT_LOCAL_EMBEDDINGS = "bge-m3";
const DEFAULT_LOCAL_EMBEDDINGS_DIMENSION = 1024;

const warned = new Set<string>();

const readProvider = (name: string): LlmProvider => {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "local") return "local";
  if (raw && raw !== "openrouter" && !warned.has(name)) {
    // A typo must not take the AI down: fall back to the default and say why.
    warned.add(name);
    logger.warn(`[AI] Unknown ${name}="${raw}", using openrouter`);
  }
  return "openrouter";
};

export const getLlmProvider = (): LlmProvider => readProvider("LLM_PROVIDER");
export const getEmbeddingsProvider = (): LlmProvider => readProvider("EMBEDDINGS_PROVIDER");

const positiveInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export const getLocalLlmConfig = (): LocalLlmConfig => {
  const model = process.env.LOCAL_LLM_MODEL?.trim() || DEFAULT_LOCAL_MODEL;
  return {
    baseUrl: trimSlash(process.env.LOCAL_LLM_BASE_URL?.trim() || DEFAULT_OLLAMA_URL),
    apiKey: process.env.LOCAL_LLM_API_KEY?.trim() || undefined,
    model,
    fastModel: process.env.LOCAL_LLM_FAST_MODEL?.trim() || model,
    contextTokens: positiveInt("LOCAL_LLM_CONTEXT_TOKENS", DEFAULT_LOCAL_CONTEXT),
  };
};

export const getLocalEmbeddingsConfig = (): LocalEmbeddingsConfig => ({
  baseUrl: trimSlash(
    process.env.LOCAL_EMBEDDINGS_BASE_URL?.trim() ||
      process.env.LOCAL_LLM_BASE_URL?.trim() ||
      DEFAULT_OLLAMA_URL,
  ),
  apiKey:
    process.env.LOCAL_EMBEDDINGS_API_KEY?.trim() ||
    process.env.LOCAL_LLM_API_KEY?.trim() ||
    undefined,
  model: process.env.LOCAL_EMBEDDINGS_MODEL?.trim() || DEFAULT_LOCAL_EMBEDDINGS,
  dimension: positiveInt("LOCAL_EMBEDDINGS_DIMENSION", DEFAULT_LOCAL_EMBEDDINGS_DIMENSION),
});

/**
 * The local model for a requested model id. `fast` picks the cheaper model
 * when the caller asked for FAST_AI_MODEL; every other id gets the main one.
 */
export const getLocalLanguageModel = (
  fast = false,
  config: LocalLlmConfig = getLocalLlmConfig(),
) => {
  const provider = createOpenAICompatible({
    name: "local",
    baseURL: config.baseUrl,
    // Ollama ignores the key; vLLM and LM Studio can require one.
    apiKey: config.apiKey ?? "local",
    // Ollama (0.5+) and vLLM both honour response_format json_schema, which is
    // what Output.object() sends. Without this flag the SDK would fall back to
    // plain JSON mode and the schema would only be a suggestion.
    supportsStructuredOutputs: true,
    includeUsage: true,
  });
  return provider(fast ? config.fastModel : config.model);
};
