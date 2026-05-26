import { Router, Response } from "express";
import { getConfiguredModel, getFallbackProviderOptions, DEFAULT_AI_MODEL } from "../utils/aiModelUtils";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { mcpClientService } from "../services/mcpClientService";
import { logger } from "../utils/logger";
import { authenticateUser, AuthenticatedRequest } from "../middleware/authMiddleware";
import { aiUsageService } from "../services/aiUsageService";
import prisma from "../prisma/prismaClient";
import {
  requireActiveSubscription,
  SubscriptionRequiredError,
} from "../services/subscriptionGuard";

const router = Router();

/**
 * POST /api/gitnexus/chat
 * Streams an AI response using GitNexus MCP tools to answer codebase questions.
 * Requires Firebase auth.
 */
router.post("/api/gitnexus/chat", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (process.env.USE_GITNEXUS !== "true") {
    res.status(503).json({ error: "GitNexus is not enabled on this server." });
    return;
  }

  const workspaceHeader = req.headers["x-workspace-id"];
  const wsId = Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader;
  if (wsId) {
    try {
      await requireActiveSubscription(wsId);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        res
          .status(err.status)
          .json({ code: err.code, message: err.message, reason: err.reason });
        return;
      }
      throw err;
    }
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
            onFinish: async ({ usage }) => {
              const firebaseUid = req.user?.uid;
              const workspaceId = req.headers["x-workspace-id"];
              const resolvedWorkspaceId = Array.isArray(workspaceId) ? workspaceId[0] : workspaceId;
              if (firebaseUid && resolvedWorkspaceId) {
                try {
                  const dbUser = await prisma.user.findUnique({ where: { firebaseUid } });
                  if (dbUser) {
                    aiUsageService.logUsage({
                      userId: dbUser.id,
                      workspaceId: resolvedWorkspaceId,
                      feature: "CHAT",
                      provider: "openrouter",
                      model: DEFAULT_AI_MODEL,
                      inputTokens: usage.inputTokens ?? 0,
                      outputTokens: usage.outputTokens ?? 0,
                    }).catch((err) => logger.error("Failed to log GitNexus usage", err));
                  }
                } catch (err) {
                  logger.error("Failed to resolve user for GitNexus usage log", err);
                }
              }
            },
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
