import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tool } from "ai";
import { z } from "zod";
import { logger } from "../utils/logger";

const MCP_TOOL_TIMEOUT_MS = 10_000; // 10 seconds per tool call
const MCP_CONNECT_TIMEOUT_MS = 5_000;
const MCP_CIRCUIT_BREAKER_THRESHOLD = 3; // Consecutive failures before disabling

export class McpClientService {
  private static instance: McpClientService;
  private client: Client | null = null;
  public isAvailable: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private consecutiveFailures: number = 0;
  private isReconnecting: boolean = false;

  private constructor() {
    this.initializationPromise = this.initialize();
  }

  public static getInstance(): McpClientService {
    if (!McpClientService.instance) {
      McpClientService.instance = new McpClientService();
    }
    return McpClientService.instance;
  }

  private async initialize() {
    if (process.env.USE_GITNEXUS !== "true") {
      logger.info("USE_GITNEXUS is not 'true'. MCP Integration disabled.");
      this.isAvailable = false;
      this.client = null;
      return;
    }

    const url = process.env.GITNEXUS_MCP_URL;
    if (!url) {
      logger.info("GITNEXUS_MCP_URL not provided. MCP Integration disabled.");
      this.isAvailable = false;
      return;
    }

    try {
      logger.info(`Attempting to connect to MCP Server at ${url}`);
      const transport = new StreamableHTTPClientTransport(new URL(url));

      this.client = new Client(
        {
          name: "plan-ai-backend",
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      // Give connection a 5-second timeout
      await Promise.race([
        this.client.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000)),
      ]);

      this.isAvailable = true;
      this.consecutiveFailures = 0;
      logger.info("Successfully connected to GitNexus MCP Server.");
    } catch (e) {
      logger.error("Failed to connect to GitNexus MCP Server. Continuing without it.", e);
      this.isAvailable = false;
      this.client = null;
    }
  }

  /**
   * Attempt to reconnect to the MCP server after a failure.
   * Uses a lock to prevent concurrent reconnection attempts.
   */
  private async reconnect(): Promise<boolean> {
    if (this.isReconnecting) return false;
    this.isReconnecting = true;
    try {
      logger.info("Attempting to reconnect to GitNexus MCP Server...");
      this.client = null;
      this.isAvailable = false;
      this.initializationPromise = this.initialize();
      await this.initializationPromise;
      return this.isAvailable;
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Records a tool call failure and triggers reconnection if needed.
   * After CIRCUIT_BREAKER_THRESHOLD consecutive failures, disables the client.
   */
  private async handleToolFailure(error: unknown): Promise<void> {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= MCP_CIRCUIT_BREAKER_THRESHOLD) {
      logger.warn(
        `GitNexus MCP: ${this.consecutiveFailures} consecutive failures — circuit breaker open. Attempting reconnect.`,
      );
      this.isAvailable = false;
      await this.reconnect();
    }
  }

  /** Reset failure counter on successful tool call */
  private handleToolSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /** Helper: call a tool with a timeout and extract text content */
  private async callToolWithTimeout(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = await Promise.race([
      this.client!.callTool({ name, arguments: args }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MCP tool '${name}' timeout (${MCP_TOOL_TIMEOUT_MS}ms)`)), MCP_TOOL_TIMEOUT_MS),
      ),
    ]);
    if (!result || !result.content || !Array.isArray(result.content)) return "";
    return result.content
      .filter(
        (c: unknown): c is { type: "text"; text: string } =>
          typeof c === "object" && c !== null && "type" in c && c.type === "text" && "text" in c,
      )
      .map((c) => c.text)
      .join("\n\n");
  }

  /**
   * Safely queries GitNexus. If the server is offline or times out, it gracefully degrades and returns null.
   */
  public async queryContext(prompt: string): Promise<string | null> {
    await this.initializationPromise;

    if (!this.isAvailable || !this.client) {
      return null;
    }

    try {
      const text = await this.callToolWithTimeout("mcp_gitnexus_query", { query: prompt });
      this.handleToolSuccess();
      return text || null;
    } catch (error) {
      logger.error("Error querying GitNexus MCP Server (gracefully degrading).", error);
      await this.handleToolFailure(error);
      return null;
    }
  }

  /**
   * Returns a map of Vercel AI SDK tools that proxy to the GitNexus MCP Server.
   * If the MCP server is unavailable, returns undefined so generation succeeds normally.
   */
  public getAiTools(repo?: string, organizationId?: string) {
    if (!this.isAvailable || !this.client) {
      return undefined;
    }

    return {
      query_codebase: tool({
        description:
          "Search the codebase knowledge graph for execution flows related to a concept. Use this to understand how code works together.",
        inputSchema: z.object({
          query: z.string().describe("Natural language or keyword search query"),
          goal: z.string().optional().describe("What you want to find (e.g. 'auth logic')"),
        }),
        execute: async ({ query, goal }) => {
          try {
            const text = await this.callToolWithTimeout("mcp_gitnexus_query", {
              query,
              goal,
              ...(repo ? { repo } : {}),
            });
            this.handleToolSuccess();
            return text;
          } catch (e) {
            logger.error("Error executing query_codebase tool", e);
            await this.handleToolFailure(e);
            return "Error executing tool. Proceed with existing knowledge.";
          }
        },
      }),
      get_symbol_context: tool({
        description:
          "Get a 360-degree view of a single code symbol (Function, Class, Method), showing callers, callees, and file location.",
        inputSchema: z.object({
          name: z.string().describe("Symbol name (e.g., 'validateUser')"),
          kind: z
            .string()
            .optional()
            .describe("Kind filter to disambiguate (e.g. 'Function', 'Class', 'Method')"),
        }),
        execute: async ({ name, kind }) => {
          try {
            const text = await this.callToolWithTimeout("mcp_gitnexus_context", {
              name,
              kind,
              ...(repo ? { repo } : {}),
            });
            this.handleToolSuccess();
            return text;
          } catch (e) {
            logger.error("Error executing get_symbol_context tool", e);
            await this.handleToolFailure(e);
            return "Error executing tool. Proceed with existing knowledge.";
          }
        },
      }),
      fetch_url: tool({
        description:
          "Fetch the text content of any public URL on the internet. Use this to read documentation, GitHub issues, or StackOverflow links provided by the user.",
        inputSchema: z.object({
          url: z.string().url().describe("The full URL to fetch"),
        }),
        execute: async ({ url }) => {
          try {
            // Lazy import to avoid circular dependencies if any
            const { webScraperService } = await import("./webScraperService");
            const result = await webScraperService.scrapeUrl(url);
            if (!result || !result.content) {
              return "Failed to scrape the URL or the page was empty.";
            }
            return `Title: ${result.title}\n\nContent:\n${result.content}`;
          } catch (e) {
            logger.error(`Error scraping URL ${url}:`, e);
            return "Error scraping URL.";
          }
        },
      }),
      search_web: tool({
        description:
          "Search the internet for real-time information, competitors, or topics. Returns a list of URLs and snippets.",
        inputSchema: z.object({
          query: z.string().describe("The search query (e.g. 'BlueberryBytes competitors')"),
        }),
        execute: async ({ query }) => {
          console.log(`Searching web for "${query}"`);
          try {
            // Lazy import
            const axios = (await import("axios")).default;
            const cheerio = await import("cheerio");

            const response = await axios.get("https://html.duckduckgo.com/html/", {
              params: { q: query },
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
              timeout: 10000,
            });

            const $ = cheerio.load(response.data);
            const results: string[] = [];

            $(".result").each((i, el) => {
              if (i >= 10) return; // limit to top 10 results

              const title = $(el).find(".result__title").text().trim();
              const snippet = $(el).find(".result__snippet").text().trim();
              let url = $(el).find(".result__url").attr("href") || "";

              if (url.includes("uddg=")) {
                try {
                  const param = url.split("uddg=")[1].split("&")[0];
                  url = decodeURIComponent(param);
                } catch {
                  // ignore decoding errors
                }
              }

              if (title && snippet) {
                results.push(`Title: ${title}\nURL: ${url}\nSnippet: ${snippet}\n`);
              }
            });

            if (results.length === 0) {
              return "No results found for your query. Try different keywords.";
            }

            return results.join("\n---\n");
          } catch (e) {
            logger.error(`Error searching web for "${query}":`, e);
            return "Error searching the web. The search engine might be blocking the request temporarily.";
          }
        },
      }),
      add_memory: tool({
        description:
          "Save an important fact, architectural decision, or user preference to the persistent organization memory.",
        inputSchema: z.object({
          fact: z
            .string()
            .describe("The fact to remember (e.g. 'The frontend uses Vite and React')"),
        }),
        execute: async ({ fact }) => {
          if (!organizationId)
            return "Failed: No organization context provided for memory storage.";
          try {
            const { memoryService } = await import("./memoryService");
            const id = await memoryService.addMemory(organizationId, fact);
            return id ? "Successfully saved to memory." : "Failed to save memory.";
          } catch (e) {
            logger.error("Error adding memory:", e);
            return "Error saving to memory.";
          }
        },
      }),
      query_memory: tool({
        description: "Search the organization's persistent memory for past facts or decisions.",
        inputSchema: z.object({
          query: z.string().describe("What to search for (e.g. 'frontend framework')"),
        }),
        execute: async ({ query }) => {
          if (!organizationId)
            return "Failed: No organization context provided for memory storage.";
          try {
            const { memoryService } = await import("./memoryService");
            const results = await memoryService.queryMemories(organizationId, query);
            if (results.length === 0) return "No relevant memories found.";
            return results.map((m) => `- ${m.fact}`).join("\n");
          } catch (e) {
            logger.error("Error querying memory:", e);
            return "Error querying memory.";
          }
        },
      }),
    };
  }
}

export const mcpClientService = McpClientService.getInstance();
