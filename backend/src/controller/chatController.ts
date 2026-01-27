import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Body,
  Path,
  Security,
  Request,
} from "tsoa";
import { ChatRole } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { queryContexts } from "../vector/contextFileVectorService";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

interface ChatThread {
  id: string;
  userId: string;
  title: string;
  contextIds: string[];
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
}

interface CreateThreadRequest {
  title?: string;
  contextIds: string[];
}

interface SendMessageRequest {
  content: string;
}

interface SendMessageResponse {
  message: ChatMessage;
  response: ChatMessage;
}

@Route("api/chat")
@Tags("Chat")
@Security("ClientLevel")
export class ChatController extends Controller {
  @Get("threads")
  public async listThreads(@Request() request: AuthenticatedRequest): Promise<ChatThread[]> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const threads = await prisma.chatThread.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return threads;
  }

  @Get("threads/{threadId}")
  public async getThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ChatThread> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const thread = await prisma.chatThread.findFirstOrThrow({
      where: { id: threadId, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return thread;
  }

  @Post("threads")
  public async createThread(
    @Body() body: CreateThreadRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ChatThread> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const thread = await prisma.chatThread.create({
      data: {
        userId: user.id,
        title: body.title || "New Chat",
        contextIds: body.contextIds,
      },
    });
    return thread;
  }

  @Put("threads/{threadId}")
  public async updateThread(
    @Path() threadId: string,
    @Body() body: { title?: string; contextIds?: string[] },
    @Request() request: AuthenticatedRequest,
  ): Promise<ChatThread> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const thread = await prisma.chatThread.update({
      where: { id: threadId, userId: user.id },
      data: {
        title: body.title,
        contextIds: body.contextIds,
      },
    });
    return thread;
  }

  @Delete("threads/{threadId}")
  public async deleteThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    await prisma.chatThread.deleteMany({
      where: { id: threadId, userId: user.id },
    });
    return { success: true };
  }

  @Post("threads/{threadId}/messages")
  public async sendMessage(
    @Path() threadId: string,
    @Body() body: SendMessageRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<SendMessageResponse> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    const thread = await prisma.chatThread.findFirstOrThrow({
      where: { id: threadId, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 10, // Limit history
        },
      },
    });

    // 1. Save User Message
    const userMessage = await prisma.chatMessage.create({
      data: {
        threadId,
        role: "USER",
        content: body.content,
      },
    });

    // 2. Retrieve Context (RAG)
    let contextText = "";
    if (thread.contextIds.length > 0) {
      // Swapped arguments to match definition: (contextIds: string[], queryText: string)
      const contexts = await queryContexts(thread.contextIds, body.content);
      if (contexts && contexts.length > 0) {
        contextText = contexts.join("\n---\n");
      }
    }

    // 3. Call LLM using Vercel AI SDK
    const systemPrompt = `You are a helpful AI coding assistant.
You have access to the user's codebase context.
Answer the user's question based on the provided context if applicable.
If the context doesn't contain the answer, use your general knowledge but mention that you didn't find it in the context.

Context:
${contextText}
`;

    // Construct history for AI SDK
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...thread.messages.map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: body.content },
    ];

    try {
      const { text } = await generateText({
        model: openai("gpt-4o"),
        messages: messages,
      });

      const replyContent = text || "I'm sorry, I couldn't generate a response.";

      // 4. Save Assistant Message
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          threadId,
          role: "ASSISTANT",
          content: replyContent,
        },
      });

      // Update thread updatedAt
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });

      return {
        message: userMessage,
        response: assistantMessage,
      };
    } catch (error) {
      logger.error("Error generating AI response", error);
      throw new Error("Failed to generate response");
    }
  }
}
