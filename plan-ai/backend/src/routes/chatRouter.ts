/* eslint-disable @typescript-eslint/no-unused-vars */
import { Router } from "express";
import { streamText, stepCountIs, Output, type ModelMessage } from "ai";
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
import {
  requireActiveSubscription,
  SubscriptionRequiredError,
} from "../services/subscriptionGuard";
import { checkUsageLimit, UsageLimitExceededError } from "../services/usageLimitGuard";

const router = Router();

// POST /api/chat/threads/:threadId/stream
router.post(
  "/threads/:threadId/stream",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
    const { threadId } = req.params;
    const { content, modelKey, attachments } = req.body as {
      content: string;
      modelKey?: string;
      attachments?: Array<{ url: string; type: string; name: string; size?: number }>;
    };

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

      try {
        await requireActiveSubscription(workspaceId);
      } catch (err) {
        if (err instanceof SubscriptionRequiredError) {
          return res
            .status(err.status)
            .json({ code: err.code, message: err.message, reason: err.reason });
        }
        throw err;
      }

      try {
        await checkUsageLimit(workspaceId, "llm");
      } catch (err) {
        if (err instanceof UsageLimitExceededError) {
          return res
            .status(err.status)
            .json({ code: err.code, message: err.message, limitType: err.limitType, used: err.used, allowed: err.allowed });
        }
        throw err;
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

      // 1. Save User Message (with optional image/PDF attachments)
      await prisma.chatMessage.create({
        data: {
          threadId,
          role: "USER",
          content,
          attachments:
            attachments && attachments.length > 0
              ? (attachments as unknown as import("@prisma/client").Prisma.InputJsonValue)
              : undefined,
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

        // 2a. Also pull transcripts attached to any of the selected contexts so
        // the chat can reason over recorded meetings, not just uploaded files.
        try {
          const attachedTranscripts = await prisma.transcript.findMany({
            where: {
              workspaceId,
              contextIds: { hasSome: thread.contextIds },
            },
            select: {
              id: true,
              title: true,
              summary: true,
              transcript: true,
              recordedAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20, // cap to avoid blowing the context window
          });

          if (attachedTranscripts.length > 0) {
            const blocks = attachedTranscripts.map((t) => {
              const heading = `## Meeting: ${t.title || "Untitled"}${
                t.recordedAt ? ` (${new Date(t.recordedAt).toISOString().slice(0, 10)})` : ""
              }`;
              const body = t.summary?.trim()
                ? t.summary
                : (t.transcript ?? "").slice(0, 4000); // truncate raw transcript fallback
              return `${heading}\n${body}`;
            });
            const transcriptsSection = `\n\nRelevant Meeting Transcripts (attached to selected contexts):\n${blocks.join(
              "\n\n---\n\n",
            )}`;
            contextText = contextText
              ? `${contextText}\n\n---\n\n${transcriptsSection.trim()}`
              : transcriptsSection.trim();
            toolsUsed.push(`${attachedTranscripts.length} Meeting Transcripts`);
          }
        } catch (err) {
          logger.warn("Failed to enrich chat context with attached transcripts", err);
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
CITATION RULES:
When referencing code from the Context below, mention the filename naturally in your response (e.g. "In \`authService.ts\`, the login flow..."). Do NOT output raw JSON citation objects inline.
${codeIntelligenceSection}

Context:
${contextText}
`;

      type AttachmentRef = { url: string; type: string; name: string; size?: number };

      // Build a multimodal user message for the LLM when an attachment is
      // present. Falls back to plain text content otherwise.
      const buildUserMessage = (
        text: string,
        atts?: AttachmentRef[] | null,
      ): ModelMessage => {
        if (!atts || atts.length === 0) {
          return { role: "user", content: text };
        }
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "image"; image: URL }
          | { type: "file"; data: URL; mediaType: string }
        > = [];
        if (text) parts.push({ type: "text", text });
        for (const a of atts) {
          if (a.type.startsWith("image/")) {
            parts.push({ type: "image", image: new URL(a.url) });
          } else if (a.type === "application/pdf") {
            parts.push({ type: "file", data: new URL(a.url), mediaType: a.type });
          }
        }
        return { role: "user", content: parts };
      };

      const messages: ModelMessage[] = [
        { role: "system", content: systemPrompt },
        ...thread.messages.map<ModelMessage>((m) => {
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
          if (m.role === "USER") {
            const pastAttachments = (m.attachments ?? null) as AttachmentRef[] | null;
            return buildUserMessage(cleanContent, pastAttachments);
          }
          return { role: "assistant", content: cleanContent };
        }),
        buildUserMessage(content, attachments),
      ];

      const requestedModelKey = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;

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

      // Tool-using models: pure streamText (text streaming)
      // Standard models: streamText + Output.object (structured output with citations)
      const useStructuredOutput = !gitnexusTools;

      const result = await streamText({
        model: getConfiguredModel(requestedModelKey),
        providerOptions: getFallbackProviderOptions(requestedModelKey),
        messages,
        maxRetries: 3,
        ...(gitnexusTools
          ? { tools: gitnexusTools, stopWhen: stepCountIs(5) }
          : {
              output: Output.object({
                name: "StreamedChatResponse",
                description: "Outputs a conversational response along with precise context citations.",
                schema: ResponseSchema,
              }),
            }),
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

            // Extract text + citations from structured output, or use raw text for tool models
            let finalText = text || "Failed to generate text content.";
            let citations: { filename: string; lines: string }[] = [];
            if (useStructuredOutput) {
              try {
                const outputObj = await result.output;
                if (outputObj?.text) finalText = outputObj.text;
                if (outputObj && Array.isArray(outputObj.citations))
                  citations = outputObj.citations;
              } catch {
                // If output parsing fails, fall back to raw text
              }
            }

            // Build aiGraphTrace only when agentic tools were actually used (not just basic RAG)
            let aiGraphTrace: { nodes: { id: string; name: string; group: string; val: number }[]; links: { source: string; target: string }[] } | undefined;
            if (gitnexusTools && toolsUsed.length > 0) {
              const graphNodes: { id: string; name: string; group: string; val: number }[] = [
                { id: "ai", name: "Plan AI", group: "function", val: 30 },
              ];
              const graphLinks: { source: string; target: string }[] = [];
              for (const toolName of toolsUsed) {
                const toolId = `tool-${toolName}`;
                graphNodes.push({ id: toolId, name: toolName, group: "database", val: 20 });
                graphLinks.push({ source: "ai", target: toolId });
              }
              aiGraphTrace = { nodes: graphNodes, links: graphLinks };
            }

            await prisma.chatMessage.create({
              data: {
                threadId,
                role: "ASSISTANT",
                content: JSON.stringify({
                  text: finalText,
                  latencyMs,
                  tools: toolsUsed,
                  ...(citations.length > 0 ? { citations } : {}),
                  ...(aiGraphTrace ? { aiGraphTrace } : {}),
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

      // Stream text to the client (always clean readable text, never raw JSON)
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      for await (const chunk of result.textStream) {
        res.write(chunk);
      }
      res.end();
      return;
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

    const { messages, projectId } = req.body as { messages: unknown; projectId?: string };

    console.log("[ChatRouter] Assistant Stream requested with DB user:", user.id);

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: "Invalid messages format" });
    }

    const workspaceId = req.headers["x-workspace-id"] as string;
    if (!workspaceId) {
      return res.status(400).json({ message: "Missing x-workspace-id header" });
    }

    try {
      await requireActiveSubscription(workspaceId);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        return res
          .status(err.status)
          .json({ code: err.code, message: err.message, reason: err.reason });
      }
      throw err;
    }

    try {
      await checkUsageLimit(workspaceId, "llm");
    } catch (err) {
      if (err instanceof UsageLimitExceededError) {
        return res
          .status(err.status)
          .json({ code: err.code, message: err.message, limitType: err.limitType, used: err.used, allowed: err.allowed });
      }
      throw err;
    }

    const { modelKey } = req.query;
    const result = await assistantChatService.handleAssistantStream(
      messages,
      user.id,
      workspaceId,
      modelKey as string,
      projectId,
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
      } else if (part.type === "tool-call" && part.toolName === "navigate") {
        // The model just decided to take the user somewhere — emit a marker
        // the frontend parses and routes to. Without this, the model says
        // "I've navigated you to X" but nothing actually happens.
        const input = part.input as { path?: string };
        if (input.path) {
          res.write(`\n\n[UI:NAVIGATE path="${input.path}"]\n\n`);
        }
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
