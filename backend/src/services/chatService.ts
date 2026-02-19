import { ChatRole, ChatThread, ChatMessage } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";

const SYSTEM_PROMPT = `You are Plan AI, an intelligent coding and documentation assistant.
You have access to the user's codebase and documents (Contexts).
When answering, rely primarily on the provided "Relevant Context".
If the context doesn't contain the answer, say so, but try to be helpful based on general knowledge.
Keep answers concise and technical.
`;

export class ChatService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });
  private readonly modelName = "google/gemini-2.0-flash-001";

  public async createThread(
    userId: string,
    contextIds: string[],
    title?: string,
  ): Promise<ChatThread> {
    return prisma.chatThread.create({
      data: {
        userId,
        contextIds,
        title: title ?? "New Chat",
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  public async getThread(
    userId: string,
    threadId: string,
  ): Promise<ChatThread & { messages: ChatMessage[] }> {
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) {
      throw { status: 404, message: "Chat thread not found" };
    }

    return thread;
  }

  public async listThreads(userId: string): Promise<ChatThread[]> {
    return prisma.chatThread.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  public async sendMessage(
    userId: string,
    threadId: string,
    content: string,
  ): Promise<{ message: ChatMessage; response: ChatMessage }> {
    const thread = await this.getThread(userId, threadId);

    // 1. Save User Message
    const userMessage = await prisma.chatMessage.create({
      data: {
        threadId,
        role: ChatRole.USER,
        content,
      },
    });

    // 2. Retrieve Context (RAG)
    let contextSection = "";
    if (thread.contextIds.length > 0) {
      try {
        const chunks = await queryContexts(thread.contextIds, content, 500);
        if (chunks.length > 0) {
          contextSection = `\nRelevant Context from Knowledge Base:\n${chunks.join("\n\n")}\n`;
        }
      } catch (error) {
        logger.warn("Failed to retrieve context for chat", error);
      }
    }

    // 3. Build History
    // We take the last 100 messages to leverage Gemini's large context
    const history = thread.messages.slice(-100).map((msg) => ({
      role: msg.role === ChatRole.USER ? "user" : "assistant",
      content: msg.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;

    // 4. Generate Response
    const model = this.openrouter(this.modelName);
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT + contextSection,
      messages: [...history, { role: "user", content }],
    });

    // 5. Save Assistant Message
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        threadId,
        role: ChatRole.ASSISTANT,
        content: text,
      },
    });

    return {
      message: userMessage,
      response: assistantMessage,
    };
  }
}

export const chatService = new ChatService();
