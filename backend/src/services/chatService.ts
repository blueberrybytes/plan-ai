import { ChatRole, ChatThread, ChatMessage } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";

const SYSTEM_PROMPT = `You are Plan AI, an intelligent coding and documentation assistant.
You have access to the user's codebase and documents (Contexts).
When answering, rely primarily on the provided "Relevant Context".
If the context doesn't contain the answer, say so, but try to be helpful based on general knowledge.
Keep answers concise and technical.

CRITICAL CITATION RULES:
Whenever you state a fact, reference code, or pull information from the "Relevant Context from Knowledge Base" section below, you MUST fill out the 'citations' array in your output schema.
Do NOT use inline markdown citations like [[filename:lines]]. Your markdown 'text' output should flow naturally, and your exact sources must be securely populated inside the 'citations' array mapping the exact Filename to the exact Line numbers (e.g. '45-50').
`;

const ResponseSchema = z.object({
  text: z.string().describe("The markdown-formatted conversational response."),
  citations: z
    .array(
      z.object({
        filename: z.string().describe("The name of the file being cited."),
        lines: z.string().describe("The exact line coverage of the citation (e.g. '45-50')."),
      }),
    )
    .describe("An array of citations matching the precise sources used from the context blocks."),
});

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
          logger.info(`Retrieved ${chunks.length} RAG Chunks`, { chunks });
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

    // 4. Generate Response Structurally
    const model = this.openrouter(this.modelName);

    // We parse the history string payloads to text only
    // (older messages might be JSON strings now, we need to extract their text for context)
    const historyParsed: Array<{ role: "user" | "assistant"; content: string }> = history.map(
      (msg) => {
        try {
          const parsed = JSON.parse(msg.content);
          return {
            role: msg.role === "user" ? "user" : "assistant",
            content: parsed.text || msg.content,
          };
        } catch {
          return { role: msg.role === "user" ? "user" : "assistant", content: msg.content };
        }
      },
    );

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...historyParsed,
      { role: "user", content },
    ];

    const { object } = await generateObject({
      model,
      system: SYSTEM_PROMPT + contextSection,
      messages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: ResponseSchema as any,
    });

    logger.info("Generated Object Response", { object });

    // 5. Save Assistant Message (Stringified JSON to preserve DB Schema)
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        threadId,
        role: ChatRole.ASSISTANT,
        content: JSON.stringify(object),
      },
    });

    return {
      message: userMessage,
      response: assistantMessage,
    };
  }
}

export const chatService = new ChatService();
