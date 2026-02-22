import { Router } from "express";
import { streamObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";
import { authenticateUser, AuthenticatedRequest } from "../middleware/authMiddleware";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";

const router = Router();

const openrouter = createOpenRouter({
  apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
});
const modelName = "google/gemini-2.0-flash-001";

// POST /api/chat/threads/:threadId/stream
router.post(
  "/threads/:threadId/stream",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
    const { threadId } = req.params;
    const { content } = req.body;

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

      const ResponseSchema = z.object({
        text: z.string().describe("The markdown-formatted conversational response."),
        citations: z
          .array(
            z.object({
              filename: z.string().describe("The name of the file being cited."),
              lines: z.string().describe("The exact line coverage of the citation (e.g. '45-50')."),
            }),
          )
          .describe(
            "An array of citations matching the precise sources used from the context blocks.",
          ),
      });

      // 2. Retrieve Context (RAG)
      let contextText = "";
      if (thread.contextIds.length > 0) {
        const contexts = await queryContexts(thread.contextIds, content, 500);
        if (contexts && contexts.length > 0) {
          contextText = contexts.join("\n---\n");
        }
      }

      const systemPrompt = `You are a helpful AI coding assistant.
You have access to the user's codebase context.
Answer the user's question based on the provided context if applicable.
If the context doesn't contain the answer, use your general knowledge but mention that you didn't find it in the context.

CRITICAL CITATION RULES:
Whenever you state a fact, reference code, or pull information from the Context below, you MUST fill out the 'citations' array in your JSON output.
Do NOT output inline citations (e.g. [{"filename": "...", ...}]) in your markdown 'text' output. Your markdown 'text' output must flow naturally, and your sources must be populated ONLY inside the 'citations' array.

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

      // 3. Stream Object
      const result = await streamObject({
        model: openrouter(modelName),
        messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: ResponseSchema as any,
        onFinish: async ({ object }) => {
          try {
            // Persist Assistant Message
            await prisma.chatMessage.create({
              data: {
                threadId,
                role: "ASSISTANT",
                content: JSON.stringify(object),
              },
            });

            // Update thread timestamp
            await prisma.chatThread.update({
              where: { id: threadId },
              data: { updatedAt: new Date() },
            });
          } catch (error) {
            logger.error("Failed to persist streamed message", error);
          }
        },
      });

      return result.pipeTextStreamToResponse(res);
    } catch (error) {
      logger.error("Streaming error", error);
      return res.status(500).json({ message: "Streaming failed" });
    }
  },
);

export default router;
