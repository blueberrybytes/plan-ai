/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * All workspaces share one Qdrant collection and its points carry no
 * workspace. These tests pin the rule that keeps them apart: an id of another
 * workspace's project or context never reaches the vector store.
 *
 * Two workspaces: Ana's own (ws_ana) and client X (ws_x), which Ana left.
 */

const CONTEXTS = [
  { id: "ctx_ana", projectId: "proj_ana", workspaceId: "ws_ana", userId: "ana" },
  { id: "ctx_x", projectId: "proj_x", workspaceId: "ws_x", userId: "boss_x" },
];

const mocks = vi.hoisted(() => ({
  queryVectors: vi.fn(),
  fullPayloads: vi.fn(),
  repomixPayloads: vi.fn(),
  embeddingConfig: vi.fn(),
  embedQuery: vi.fn(),
  logUsage: vi.fn(),
}));

vi.mock("../../prisma/prismaClient", () => ({
  default: {
    context: {
      // A small stand-in for the real table that honours the same filters.
      findMany: async ({ where }: any) =>
        CONTEXTS.filter(
          (c) =>
            (!where.id || where.id.in.includes(c.id)) &&
            (!where.projectId?.in || where.projectId.in.includes(c.projectId)) &&
            (where.workspaceId === undefined || where.workspaceId === c.workspaceId),
        ),
    },
  },
}));
vi.mock("../contextVectorStore", () => ({
  ensureContextCollection: vi.fn(),
  upsertContextVectors: vi.fn(),
  deleteVectorsByFile: vi.fn(),
  deleteVectorsByContext: vi.fn(),
  queryVectors: mocks.queryVectors,
  getFullContextPayloads: mocks.fullPayloads,
  getRepomixContextPayloads: mocks.repomixPayloads,
}));
vi.mock("../../utils/aiModelUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/aiModelUtils")>()),
  resolveWorkspaceEmbeddingConfig: mocks.embeddingConfig,
}));
vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: class {
    embedQuery = mocks.embedQuery;
  },
}));
vi.mock("../../services/aiUsageService", () => ({
  aiUsageService: { logUsage: mocks.logUsage },
}));

import {
  keepWorkspaceContextIds,
  mergeProjectAndContextIds,
  resolveProjectIdsToContextIds,
} from "../../services/projectContextResolver";
import {
  getFullContextPayloads,
  getRepomixContextPayloads,
  queryContexts,
} from "../contextFileVectorService";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.embeddingConfig.mockResolvedValue({ apiKey: "k", model: "text-embedding-3-small" });
  mocks.embedQuery.mockResolvedValue([0.1, 0.2]);
  mocks.logUsage.mockResolvedValue(undefined);
  mocks.queryVectors.mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({ id, vector: [], payload: { text: `chunk of ${id}` } })),
  );
  mocks.fullPayloads.mockImplementation(async (ids: string[]) => ids.map((id) => `full ${id}`));
  mocks.repomixPayloads.mockImplementation(async (ids: string[]) => ids.map((id) => `repo ${id}`));
});

describe("project and context ids from the client", () => {
  it("resolves a project of the caller's workspace", async () => {
    expect(await resolveProjectIdsToContextIds(["proj_ana"], "ws_ana")).toEqual(["ctx_ana"]);
  });

  it("resolves another workspace's project to nothing", async () => {
    expect(await resolveProjectIdsToContextIds(["proj_x"], "ws_ana")).toEqual([]);
    expect(await resolveProjectIdsToContextIds(["proj_x", "proj_ana"], "ws_ana")).toEqual([
      "ctx_ana",
    ]);
  });

  it("resolves nothing without a workspace", async () => {
    expect(await resolveProjectIdsToContextIds(["proj_ana"], "")).toEqual([]);
    expect(await keepWorkspaceContextIds(["ctx_ana"], "")).toEqual([]);
  });

  it("drops direct context ids of another workspace when merging", async () => {
    const merged = await mergeProjectAndContextIds(["proj_x"], ["ctx_x", "ctx_ana"], "ws_ana");
    expect(merged).toEqual(["ctx_ana"]);
  });
});

describe("reads from the shared vector collection", () => {
  it("searches only the contexts of the caller's workspace", async () => {
    const chunks = await queryContexts("ws_ana", ["ctx_x", "ctx_ana"], "contract terms", 5);
    expect(mocks.queryVectors).toHaveBeenCalledWith(["ctx_ana"], [0.1, 0.2], 5);
    expect(chunks).toEqual(["chunk of ctx_ana"]);
  });

  it("does not search, embed or bill anything when no context is the caller's", async () => {
    expect(await queryContexts("ws_ana", ["ctx_x"], "contract terms", 5)).toEqual([]);
    expect(mocks.queryVectors).not.toHaveBeenCalled();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
    expect(mocks.embeddingConfig).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("embeds with the caller's key and bills the caller, not the first context's owner", async () => {
    await queryContexts("ws_ana", ["ctx_x", "ctx_ana"], "contract terms");
    expect(mocks.embeddingConfig).toHaveBeenCalledWith("ws_ana");
    await vi.waitFor(() =>
      expect(mocks.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws_ana", userId: "ana" }),
      ),
    );
  });

  it("applies the same rule to the full dump and to repository files", async () => {
    expect(await getFullContextPayloads("ws_ana", ["ctx_x", "ctx_ana"])).toEqual(["full ctx_ana"]);
    expect(await getFullContextPayloads("ws_ana", ["ctx_x"])).toEqual([]);
    expect(await getRepomixContextPayloads("ws_ana", ["ctx_x"], "file_1")).toEqual([]);
    expect(mocks.fullPayloads).toHaveBeenCalledTimes(1);
    expect(mocks.repomixPayloads).not.toHaveBeenCalled();
  });
});

describe("MCP semantic_search", () => {
  const callSemanticSearch = async (workspaceId: string, projectId: string) => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createPlanAiMcpServer } = await import("../../mcp/planAiMcpServer");
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createPlanAiMcpServer("ana", workspaceId).connect(serverSide);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(clientSide);
    const result = await client.callTool({
      name: "semantic_search",
      arguments: { projectId, query: "contract terms" },
    });
    await client.close();
    return JSON.parse((result.content as Array<{ text: string }>)[0].text);
  };

  it("returns nothing for a project id of a workspace the token is not for", async () => {
    // Ana left client X, kept the project id, and asks with a token of her own workspace.
    const out = await callSemanticSearch("ws_ana", "proj_x");
    expect(out.results).toEqual([]);
    expect(mocks.queryVectors).not.toHaveBeenCalled();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
  });

  it("still searches the token's own projects", async () => {
    const out = await callSemanticSearch("ws_ana", "proj_ana");
    expect(out.results).toEqual(["chunk of ctx_ana"]);
    expect(mocks.queryVectors).toHaveBeenCalledWith(["ctx_ana"], [0.1, 0.2], 8);
  });
});
