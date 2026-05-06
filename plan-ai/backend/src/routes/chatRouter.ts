/* eslint-disable @typescript-eslint/no-unused-vars */
import { Router } from "express";
import { streamObject, streamText, stepCountIs } from "ai";
import { z } from "zod";
import {
  getConfiguredModel,
  DEFAULT_AI_MODEL,
  getFallbackProviderOptions,
} from "../utils/aiModelUtils";
import prisma from "../prisma/prismaClient";
import { authenticateUser, AuthenticatedRequest } from "../middleware/authMiddleware";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";
import { assistantChatService } from "../services/assistantService";
import { aiUsageService } from "../services/aiUsageService";
import { mcpClientService } from "../services/mcpClientService";

const router = Router();

// POST /api/chat/threads/:threadId/stream
router.post(
  "/threads/:threadId/stream",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
    const { threadId } = req.params;
    const { content, modelKey } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { firebaseUid: req.user.uid },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const workspaceId = req.headers["x-workspace-id"] as string;
      if (!workspaceId) {
        return res.status(400).json({ message: "Missing x-workspace-id header" });
      }

      const thread = await prisma.chatThread.findFirstOrThrow({
        where: { id: threadId, userId: user.id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 100,
          },
        },
      });

      // 1. Save User Message
      await prisma.chatMessage.create({
        data: {
          threadId,
          role: "USER",
          content,
        },
      });

      // Removed ResponseSchema as we map strictly to streamText now

      // 2. Retrieve Context (RAG)
      let contextText = "";
      const toolsUsed: string[] = [];
      let gitnexusTools = undefined;

      if (thread.contextIds.length > 0) {
        const contexts = await queryContexts(thread.contextIds, content, 500);
        if (contexts && contexts.length > 0) {
          contextText = contexts.join("\n---\n");
          toolsUsed.push("Plan AI Graph Power");
        }

        // 2b. Check for MCP tools availability (memory, search, codebase)
        if (mcpClientService.isAvailable) {
          // Check if we should pass repo context for codebase queries
          const contextsWithGithub = await prisma.context.findMany({
            where: {
              id: { in: thread.contextIds },
              metadata: { path: ["gitnexusReady"], equals: true },
            },
            select: { id: true },
          });

          if (contextsWithGithub.length > 0) {
            gitnexusTools = mcpClientService.getAiTools();
          } else {
            // Even if no GitHub repo is attached, we still want fetch_url and memory tools!
            const allTools = mcpClientService.getAiTools();
            if (allTools) {
              // Only pick the non-gitnexus tools if no repo is attached
              const { query_codebase: _qc, get_symbol_context: _gsc, ...generalTools } = allTools;
              gitnexusTools = generalTools;
            }
          }
        }
      }

      const startTime = Date.now();
      const codeIntelligenceSection =
        gitnexusTools && "query_codebase" in gitnexusTools
          ? `\n\nYou also have access to a live codebase knowledge graph via your tools. Use the \`query_codebase\` tool to trace execution flows and the \`get_symbol_context\` tool to inspect specific functions or classes. Only invoke these tools when the user's question is clearly about the code or the repository structure.`
          : "";

      const systemPrompt = `You are a helpful AI coding assistant.
You have access to the user's codebase context.
Answer the user's question based on the provided context if applicable.
If the user asks for a diagram, architecture, or flow, or if explaining a complex process would benefit from a visual aid, you MUST output a \`\`\`mermaid markdown block. The frontend natively supports rendering Mermaid diagrams.
CRITICAL RULES FOR MERMAID:
1. ANY node label that contains spaces, parentheses "()", ampersands "&", or hyphens "-" MUST be strictly enclosed in double quotes. Example: A["Target Audience (B2B)"] --> B["Content Strategy"]
2. FOR STATEDIAGRAM: NEVER use double quotes directly in transition arrows. ALWAYS define an alias first using 'state "Label" as ID', and then transition between IDs.
3. DO NOT include any custom styling, classDefs, or inline colors. The frontend natively injects dynamic theme colors.
CRITICAL CITATION RULES:
Whenever you state a fact, reference code, or pull information from the Context below, you MUST fill out the 'citations' array in your JSON output (unless you are answering via plain text in an agentic reasoning loop).
Do NOT output inline citations (e.g. [{"filename": "...", ...}]) in your markdown 'text' output. Your markdown 'text' output must flow naturally.
${codeIntelligenceSection}

Context:
${contextText}
`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...thread.messages.map((m) => {
          let cleanContent = m.content;
          if (m.role === "ASSISTANT") {
            try {
              const parsed = JSON.parse(cleanContent);
              if (parsed.text) {
                cleanContent = parsed.text;
              }
            } catch {
              cleanContent = cleanContent.replace(/\[\s*\{\s*"filename"[\s\S]*?\]/g, "");
              cleanContent = cleanContent.split("---CITATIONS---")[0].trim();
            }
          }
          return {
            role: m.role.toLowerCase() as "user" | "assistant",
            content: cleanContent,
          };
        }),
        { role: "user" as const, content },
      ];

      const requestedModelKey = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
      const isReasoningModel =
        requestedModelKey.includes("deepseek-r1") ||
        requestedModelKey.includes("o1") ||
        requestedModelKey.includes("o3") ||
        requestedModelKey.includes("opus");

      const ResponseSchema = z.object({
        text: z.string().describe("The markdown-formatted conversational response."),
        citations: z
          .array(
            z.object({
              filename: z.string().describe("The name of the file being cited."),
              lines: z.string().describe("The line coverage of the citation (e.g. '45-50')."),
            }),
          )
          .describe(
            "An array of citations matching the precise sources used from the context blocks.",
          ),
      });

      if (isReasoningModel || gitnexusTools) {
        // Reasoning models or Agentic Tool runs via pure streamText
        const result = await streamText({
          model: getConfiguredModel(requestedModelKey),
          providerOptions: getFallbackProviderOptions(requestedModelKey),
          messages,
          maxRetries: 3,
          ...(gitnexusTools ? { tools: gitnexusTools, stopWhen: stepCountIs(5) } : {}),
          onFinish: async ({ text, usage }) => {
            try {
              if (usage) {
                aiUsageService
                  .logUsage({
                    userId: user.id,
                    workspaceId,
                    feature: "CHAT",
                    provider: "openrouter",
                    model: requestedModelKey,
                    inputTokens: usage.inputTokens || 0,
                    outputTokens: usage.outputTokens || 0,
                  })
                  .catch(() => {});
              }
              const latencyMs = Date.now() - startTime;

              if (gitnexusTools) {
                const resolvedSteps = await result.steps;
                if (resolvedSteps && resolvedSteps.length > 0) {
                  const usedToolNames = new Set<string>();
                  for (const step of resolvedSteps) {
                    if (step.toolCalls) {
                      for (const tc of step.toolCalls) {
                        if (tc.toolName === "fetch_url") usedToolNames.add("Web Search");
                        else if (
                          tc.toolName === "query_codebase" ||
                          tc.toolName === "get_symbol_context"
                        )
                          usedToolNames.add("Plan AI Code Graph");
                        else if (tc.toolName === "add_memory" || tc.toolName === "query_memory")
                          usedToolNames.add("Organization Memory");
                        else usedToolNames.add(tc.toolName);
                      }
                    }
                  }
                  toolsUsed.push(...Array.from(usedToolNames));
                }
              }

              await prisma.chatMessage.create({
                data: {
                  threadId,
                  role: "ASSISTANT",
                  content: JSON.stringify({
                    text: text || "Failed to generate text content.",
                    latencyMs,
                    tools: toolsUsed,
                  }),
                },
              });
              await prisma.chatThread.update({
                where: { id: threadId },
                data: { updatedAt: new Date() },
              });
            } catch (err) {
              logger.error("Failed to persist streamed message", err);
            }
          },
        });

        // Use result.textStream with modern iterator because pipeTextStreamToResponse might differ across versions
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        for await (const chunk of result.textStream) {
          res.write(chunk);
        }
        res.end();
        return;
      } else {
        // Standard models use strict streamObject to enforce text/citation separation.
        const result = await streamObject({
          model: getConfiguredModel(requestedModelKey),
          providerOptions: getFallbackProviderOptions(requestedModelKey),
          messages,
          maxRetries: 3,
          schema: ResponseSchema,
          onFinish: async ({ object, error, usage }) => {
            try {
              if (usage) {
                aiUsageService
                  .logUsage({
                    userId: user.id,
                    workspaceId,
                    feature: "CHAT",
                    provider: "openrouter",
                    model: requestedModelKey,
                    inputTokens: usage.inputTokens || 0,
                    outputTokens: usage.outputTokens || 0,
                  })
                  .catch(() => {});
              }
              const latencyMs = Date.now() - startTime;
              const finalObject = object
                ? { ...object, latencyMs, tools: toolsUsed }
                : {
                    reply:
                      "Failed to process AI response natively. This typically occurs when reasoning models are used.",
                    error: (error as Error)?.message || "Unknown parsing error",
                    latencyMs,
                    tools: toolsUsed,
                  };

              await prisma.chatMessage.create({
                data: {
                  threadId,
                  role: "ASSISTANT",
                  content: JSON.stringify(finalObject),
                },
              });
              await prisma.chatThread.update({
                where: { id: threadId },
                data: { updatedAt: new Date() },
              });
            } catch (err) {
              logger.error("Failed to persist streamed message", err);
            }
          },
        });

        // Map object streams back to text directly for express
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        for await (const chunk of result.textStream) {
          res.write(chunk);
        }
        res.end();
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error("Streaming error", error);
      let msg = error instanceof Error ? error.message : "Streaming failed";

      if (error?.responseBody) {
        try {
          const parsed = JSON.parse(error.responseBody);
          if (parsed?.error?.message) {
            msg = parsed.error.message;
          }
        } catch (e) {
          // ignore
        }
      }

      return res.status(500).json({ message: msg });
    }
  },
);

// POST /api/chat/assistant/stream
router.post("/assistant/stream", authenticateUser, async (req: AuthenticatedRequest, res) => {
  console.log("[ChatRouter] Assistant Stream requested");
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { messages } = req.body;

    console.log("[ChatRouter] Assistant Stream requested with DB user:", user.id);
    console.log("[ChatRouter] Incoming body messages:", JSON.stringify(messages, null, 2));

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: "Invalid messages format" });
    }

    const workspaceId = req.headers["x-workspace-id"] as string;
    if (!workspaceId) {
      return res.status(400).json({ message: "Missing x-workspace-id header" });
    }

    const { modelKey } = req.query;
    const result = await assistantChatService.handleAssistantStream(
      messages,
      user.id,
      workspaceId,
      modelKey as string,
    );

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    console.log("[ChatRouter] Starting stream iteration for assistant/stream");
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        res.write(part.text);
      } else if (part.type === "tool-call" && part.toolName === "requestDocumentGeneration") {
        // TypeScript knows part.input is correctly typed here because of the toolName check
        const input = part.input as { purpose?: string; recordingId?: string; contextId?: string };
        res.write(
          `\n\n[UI:CONFIRM_DOC purpose="${input.purpose || ""}" recordingId="${input.recordingId || ""}" contextId="${input.contextId || ""}"]\n\n`,
        );
      }
    }
    console.log("[ChatRouter] Finished streaming text, ending response.");
    res.end();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error("Assistant Streaming error", error);
    let msg = error instanceof Error ? error.message : "Assistant Streaming failed";

    if (error?.responseBody) {
      try {
        const parsed = JSON.parse(error.responseBody);
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        }
      } catch (e) {
        // ignore
      }
    }

    return res.status(500).json({ message: msg });
  }
});

export default router;
