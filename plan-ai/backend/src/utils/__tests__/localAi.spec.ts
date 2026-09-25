import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * LLM_PROVIDER / EMBEDDINGS_PROVIDER=local route every AI call to a
 * self-hosted OpenAI-compatible server. These tests pin both halves: in local
 * mode nothing reaches OpenRouter or asks for a key, and by default nothing
 * changes at all.
 */

const mocks = vi.hoisted(() => ({
  workspaceFind: vi.fn(),
  usageCreate: vi.fn(async () => ({})),
}));

vi.mock("../../prisma/prismaClient", () => ({
  default: {
    workspace: { findUnique: mocks.workspaceFind },
    aiUsageLog: { create: mocks.usageCreate },
    // ~100k tokens of attached context: fits a 1M window, not a 32k one.
    contextFile: { aggregate: async () => ({ _sum: { sizeBytes: 400_000 } }) },
  },
}));
// aiContextRouter builds its own PrismaClient rather than using the shared
// one, so the aggregate it runs has to be stubbed at the package.
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    contextFile = { aggregate: async () => ({ _sum: { sizeBytes: 400_000 } }) };
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../services/pricingCacheService", () => ({
  pricingCacheService: {
    getAllPricing: () => ({ "google/gemini-3.7-flash": { prompt: 1e-6, completion: 2e-6 } }),
  },
}));

import {
  getConfiguredModel,
  getWorkspaceModel,
  getCachedContextModel,
  resolveWorkspaceEmbeddingConfig,
  DEFAULT_AI_MODEL,
  FAST_AI_MODEL,
} from "../aiModelUtils";
import { getLlmProvider, getLocalLlmConfig, getLocalEmbeddingsConfig } from "../localAi";
import { getContextCollectionName } from "../../vector/qdrantClient";
import { aiUsageService } from "../../services/aiUsageService";
import { aiContextRouter } from "../../services/aiContextRouter";
import { imageGenerationService } from "../../services/imageGenerationService";

const ENV = [
  "LLM_PROVIDER",
  "EMBEDDINGS_PROVIDER",
  "LOCAL_LLM_BASE_URL",
  "LOCAL_LLM_MODEL",
  "LOCAL_LLM_FAST_MODEL",
  "LOCAL_LLM_CONTEXT_TOKENS",
  "LOCAL_EMBEDDINGS_MODEL",
  "LOCAL_EMBEDDINGS_DIMENSION",
  "QDRANT_CONTEXT_COLLECTION",
];

type ModelInfo = { provider: string; modelId: string };
const info = (m: unknown) => m as ModelInfo;

beforeEach(() => {
  mocks.workspaceFind.mockReset();
  mocks.usageCreate.mockClear();
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("default (OpenRouter): nothing changes", () => {
  it("builds OpenRouter models from the catalogue id", () => {
    const m = info(getConfiguredModel(DEFAULT_AI_MODEL, "sk-or-test"));
    expect(m.provider).toMatch(/openrouter/);
    expect(m.modelId).toBe(DEFAULT_AI_MODEL);
  });

  it("still requires the workspace's key", async () => {
    mocks.workspaceFind.mockResolvedValue({ openRouterKey: null, isCourtesy: false });
    await expect(getWorkspaceModel("ws_1")).rejects.toThrow(/MISSING_API_KEY/);
  });

  it("injects the same context whole, since the catalogue model has 1M", async () => {
    const r = await aiContextRouter.decideStrategy(["ctx_1"], DEFAULT_AI_MODEL);
    expect(r.strategy).toBe("FULL_INJECTION");
  });

  it("keeps the shared Qdrant collection and OpenAI-sized vectors", () => {
    process.env.QDRANT_CONTEXT_COLLECTION = "context_files";
    expect(getContextCollectionName()).toBe("context_files");
  });

  it("prices usage from the catalogue as before", async () => {
    await aiUsageService.logUsage({
      userId: "u",
      workspaceId: "w",
      feature: "CHAT",
      provider: "openrouter",
      model: "google/gemini-3.7-flash",
      inputTokens: 1000,
      outputTokens: 500,
    });
    const row = (
      mocks.usageCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(row).toMatchObject({ provider: "GOOGLE", model: "google/gemini-3.7-flash" });
    expect(row.estimatedCost).toBeCloseTo(0.002, 6);
  });
});

describe("LLM_PROVIDER=local", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://ollama:11434/v1/";
    process.env.LOCAL_LLM_MODEL = "qwen3:32b";
    process.env.LOCAL_LLM_FAST_MODEL = "qwen3:8b";
  });

  it("answers every model id with the local model", () => {
    for (const id of [
      DEFAULT_AI_MODEL,
      "anthropic/claude-haiku-4.5",
      "moonshotai/kimi-k3",
      undefined,
    ]) {
      const m = info(getConfiguredModel(id));
      expect(m.provider).toBe("local.chat");
      expect(m.modelId).toBe("qwen3:32b");
    }
  });

  it("uses the fast local model where the app asks for FAST_AI_MODEL", () => {
    expect(info(getConfiguredModel(FAST_AI_MODEL)).modelId).toBe("qwen3:8b");
  });

  it("never looks up or requires an OpenRouter key", async () => {
    mocks.workspaceFind.mockRejectedValue(new Error("must not be called"));
    expect(info(await getWorkspaceModel("ws_1", DEFAULT_AI_MODEL)).provider).toBe("local.chat");
    expect(info(await getCachedContextModel("ws_1")).provider).toBe("local.chat");
    expect(mocks.workspaceFind).not.toHaveBeenCalled();
  });

  it("trims the trailing slash from the server URL", () => {
    expect(getLocalLlmConfig().baseUrl).toBe("http://ollama:11434/v1");
  });

  it("sizes RAG decisions to the local window, not the catalogue's 1M", async () => {
    process.env.LOCAL_LLM_CONTEXT_TOKENS = "32768";
    const r = await aiContextRouter.decideStrategy(["ctx_1"], DEFAULT_AI_MODEL);
    expect(r.strategy).toBe("RAG");
  });

  it("logs usage as LOCAL at zero cost, under the model that really ran", async () => {
    await aiUsageService.logUsage({
      userId: "u",
      workspaceId: "w",
      feature: "CHAT",
      provider: "openrouter",
      model: "google/gemini-3.7-flash",
      inputTokens: 1000,
      outputTokens: 500,
    });
    const row = (
      mocks.usageCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(row).toMatchObject({
      provider: "LOCAL",
      model: "qwen3:32b",
      estimatedCost: 0,
      blueberryTokens: 0,
    });
  });

  it("leaves speech-to-text rows alone", async () => {
    await aiUsageService.logUsage({
      userId: "u",
      workspaceId: "w",
      feature: "RECORDER",
      provider: "DEEPGRAM",
      model: "nova-3-prerecorded",
      inputTokens: 60,
      outputTokens: 0,
    });
    const row = (
      mocks.usageCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(row.provider).toBe("DEEPGRAM");
  });

  it("doesn't send slide image prompts (meeting content) to any cloud model", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      imageGenerationService.generateAndStoreImage("roadmap", "u", "p"),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to OpenRouter on a typo instead of breaking every AI call", () => {
    process.env.LLM_PROVIDER = "locl";
    expect(getLlmProvider()).toBe("openrouter");
  });
});

describe("EMBEDDINGS_PROVIDER=local", () => {
  beforeEach(() => {
    process.env.EMBEDDINGS_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://ollama:11434/v1";
    process.env.QDRANT_CONTEXT_COLLECTION = "context_files";
  });

  it("embeds on the local server without a key", async () => {
    mocks.workspaceFind.mockRejectedValue(new Error("must not be called"));
    const c = await resolveWorkspaceEmbeddingConfig("ws_1");
    expect(c).toMatchObject({
      baseURL: "http://ollama:11434/v1",
      model: "bge-m3",
      usedFallback: false,
    });
  });

  it("keeps local vectors in their own collection, named after model and size", () => {
    expect(getContextCollectionName()).toBe("context_files__bge-m3_1024");
    process.env.LOCAL_EMBEDDINGS_MODEL = "nomic-embed-text:v1.5";
    process.env.LOCAL_EMBEDDINGS_DIMENSION = "768";
    expect(getContextCollectionName()).toBe("context_files__nomic-embed-text-v1-5_768");
    expect(getLocalEmbeddingsConfig().dimension).toBe(768);
  });

  it("logs local embedding usage as LOCAL at zero cost", async () => {
    await aiUsageService.logUsage({
      userId: "u",
      workspaceId: "w",
      feature: "DOC",
      provider: "openrouter",
      model: "bge-m3",
      inputTokens: 5000,
      outputTokens: 0,
    });
    const row = (
      mocks.usageCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(row).toMatchObject({ provider: "LOCAL", model: "bge-m3", estimatedCost: 0 });
  });
});
