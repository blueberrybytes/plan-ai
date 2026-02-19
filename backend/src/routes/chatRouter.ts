import { Router } from "express";
import { streamText } from "ai";
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

Context:
${contextText}
`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...thread.messages.map((m) => ({
          role: m.role.toLowerCase() as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content },
      ];

      // 3. Stream Text
      const result = await streamText({
        model: openrouter(modelName),
        messages,
        onFinish: async ({ text }) => {
          try {
            // Persist Assistant Message
            await prisma.chatMessage.create({
              data: {
                threadId,
                role: "ASSISTANT",
                content: text,
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
