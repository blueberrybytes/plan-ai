import { Router, Request, Response } from "express";
import { getConfiguredModel, getFallbackProviderOptions } from "../utils/aiModelUtils";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { mcpClientService } from "../services/mcpClientService";
import { logger } from "../utils/logger";
import { authenticateUser } from "../middleware/authMiddleware";

const router = Router();

/**
 * POST /api/gitnexus/chat
 * Streams an AI response using GitNexus MCP tools to answer codebase questions.
 * Requires Firebase auth.
 */
router.post("/api/gitnexus/chat", authenticateUser, async (req: Request, res: Response) => {
  if (process.env.USE_GITNEXUS !== "true") {
    res.status(503).json({ error: "GitNexus is not enabled on this server." });
    return;
  }

  // Extract which repo to scope tool calls to (sent by GitNexusChatDialog)
  const repoFullName: string | undefined = req.body.repoFullName;
  // Extract organizationId for memory scoped to the org
  const organizationId: string | undefined = req.body.organizationId;

  // Convert "owner/repo" to just "repo" name for GitNexus lookup
  const repoName = repoFullName ? repoFullName.split("/").pop() : undefined;

  const tools = mcpClientService.getAiTools(repoName, organizationId);
  if (!tools) {
    res.status(503).json({ error: "GitNexus MCP server is not available." });
    return;
  }

  // Pre-fetch recent memories
  let memoryContext = "";
  if (organizationId) {
    try {
      const { memoryService } = await import("../services/memoryService");
      const memories = await memoryService.getRecentMemories(organizationId, 10);
      if (memories.length > 0) {
        memoryContext = `\n\n### Organization Knowledge Graph (Past Decisions & Facts)\n${memories.map((m) => `- ${m.fact}`).join("\n")}\n\n`;
      }
    } catch (e) {
      logger.error("Failed to fetch recent memories", e);
    }
  }

  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });

        const thinkingSteps = [
          "🔍 Querying knowledge graph...",
          "🧬 Tracing execution flows...",
          "📡 Resolving symbol context...",
          "⚙️ Analyzing dependencies...",
          "✨ Preparing answer...",
        ];
        let stepIdx = 0;

        writer.write({ type: "data-custom", data: { status: "Exploring codebase..." } });

        const heartbeat = setInterval(() => {
          const statusText =
            stepIdx < thinkingSteps.length
              ? thinkingSteps[stepIdx++]
              : "⏳ Processing complex query...";
          writer.write({ type: "data-custom", data: { status: statusText } });
        }, 3500);

        try {
          const result = streamText({
            model: getConfiguredModel(),
            providerOptions: getFallbackProviderOptions(),
            maxRetries: 3,
            stopWhen: stepCountIs(10),
            system: `You are a senior software architect with DIRECT ACCESS to a live codebase knowledge graph via tools.
${
  repoFullName
    ? `You are analyzing the repository: **${repoFullName}**. All tool calls are already scoped to this repo.
`
    : ""
}${memoryContext}
CRITICAL RULES — follow these without exception:
1. NEVER ask the user clarifying questions. Every user question has enough context to act on.
2. On EVERY user message, you MUST call at least one tool BEFORE writing any prose response.
3. Start with \`query_codebase\` for conceptual questions, or \`get_symbol_context\` for specific function/class names.
4. Chain multiple tool calls when needed (e.g., query first, then get_symbol_context on a result).
5. Only write your final answer AFTER the tool results are in.
6. Cite specific file paths, function names, and execution flows from tool results.
7. Format answers in clear Markdown with code blocks. Keep it technical and precise.
8. If a tool returns nothing useful, try a different query — do NOT ask the user for help.

You have up to 10 agentic steps. Use them all if needed.`,
            messages: req.body.messages
              ? await convertToModelMessages(req.body.messages)
              : [{ role: "user", content: "Hello" }],
            tools,
            onError: (error) => {
              logger.error("Error in GitNexus chat streamText:", error);
              writer.write({ type: "error", errorText: "Error querying the codebase." });
            },
          });

          await writer.merge(result.toUIMessageStream({ sendStart: false }));
        } catch (error) {
          logger.error("Critical error in GitNexus chat endpoint:", error);
          writer.write({ type: "error", errorText: "Failed to query codebase." });
        } finally {
          clearInterval(heartbeat);
        }
      },
    }),
  });
});

export default router;
