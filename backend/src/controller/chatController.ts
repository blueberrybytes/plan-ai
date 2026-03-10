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
import { type LiveChatHistoryItem, type ApiResponse } from "./controllerTypes";
import { ChatRole } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { queryContexts } from "../vector/contextFileVectorService";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "../utils/EnvUtils";

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
  englishLevel?: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
}

interface CreateThreadRequest {
  title?: string;
  contextIds: string[];
  englishLevel?: string;
}

interface SendMessageRequest {
  content: string;
}

interface SendMessageResponse {
  message: ChatMessage;
  response: ChatMessage;
}

export interface LiveChatMessageRequest {
  content: string;
  liveTranscript: string;
  contextIds?: string[];
  history?: LiveChatHistoryItem[];
}

export interface LiveChatMessageResponse {
  response: string;
}

@Route("api/chat")
@Tags("Chat")
@Security("ClientLevel")
export class ChatController extends Controller {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });
  private readonly modelName = "google/gemini-2.0-flash-001";

  @Get("threads")
  public async listThreads(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread[]>> {
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
    return { status: 200, data: threads };
  }

  @Get("threads/{threadId}")
  public async getThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
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
    return { status: 200, data: thread };
  }

  @Post("threads")
  public async createThread(
    @Body() body: CreateThreadRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
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

    // 1. Generate an intelligent title if none provided
    let title = body.title || "New Chat";
    if (!body.title) {
      try {
        const contentPreview = "New user asking questions about context/recordings.";
        const aiResponse = await generateText({
          model: this.openrouter(this.modelName),
          messages: [
            {
              role: "system",
              content:
                "Given the context/activity, provide a very short, 3-5 word title for this new chat. Respond ONLY with the title. No quotes.",
            },
            { role: "user", content: contentPreview },
          ],
        });
        if (aiResponse?.text) {
          title = aiResponse.text.trim().replace(/^["'](.*)["']$/, "$1");
        }
      } catch (e) {
        logger.warn("Failed to generate intelligent title for chat thread", e);
      }
    }

    const thread = await prisma.chatThread.create({
      data: {
        userId: user.id,
        title,
        contextIds: body.contextIds,
        englishLevel: body.englishLevel,
      },
      include: { messages: true },
    });

    return { status: 200, data: thread };
  }

  @Put("threads/{threadId}")
  public async updateThread(
    @Path() threadId: string,
    @Body() body: { title?: string; contextIds?: string[]; englishLevel?: string },
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
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
        englishLevel: body.englishLevel,
      },
    });
    return { status: 200, data: thread };
  }

  @Delete("threads/{threadId}")
  public async deleteThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<{ success: boolean }>> {
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
    return { status: 200, data: { success: true } };
  }

  @Post("threads/{threadId}/messages")
  public async sendMessage(
    @Path() threadId: string,
    @Body() body: SendMessageRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<SendMessageResponse>> {
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

    // Verify thread ownership
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!thread) {
      this.setStatus(404);
      throw new Error("Chat thread not found");
    }

    // 1. Save User Message
    const userMessage = await prisma.chatMessage.create({
      data: {
        threadId,
        role: "USER",
        content: body.content,
      },
    });

    // 2. Build Context (Vector RAG)
    let contextText = "";
    if (thread.contextIds.length > 0) {
      const contexts = await queryContexts(thread.contextIds, body.content, 5);
      if (contexts && contexts.length > 0) {
        contextText = contexts.join("\n---\n");
      }
    }

    // 3. System Prompt & History Construction
    const systemPrompt = `You are a helpful AI Meeting Assistant and Document Analyst.
You excel at answering questions based on the provided context, which are typically meeting transcripts or related documents.

${
  thread.englishLevel
    ? `The user has requested you speak at the following English fluency level: ${thread.englishLevel}. Adjust your vocabulary, structure, and idioms accordingly.`
    : ""
}

Here is the context provided for answering the user's queries:
<context>
${contextText}
</context>

Answer directly, accurately, and concisely. If the answer is not contained primarily in the context or conversation history, state that you do not have enough information derived from the provided documents.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (thread.messages) {
      for (const m of thread.messages) {
        if (m.role === "USER" || m.role === "ASSISTANT") {
          messages.push({
            role: m.role === "USER" ? "user" : "assistant",
            content: m.content,
          });
        }
      }
    }

    messages.push({ role: "user", content: body.content });

    try {
      const aiResponse = await generateText({
        model: this.openrouter(this.modelName),
        messages: messages,
      });

      const replyContent = aiResponse?.text || "I'm sorry, I couldn't generate a response.";

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
        status: 200,
        data: {
          message: userMessage,
          response: assistantMessage,
        },
      };
    } catch (error) {
      logger.error("Error generating AI response", error);
      throw new Error("Failed to generate response");
    }
  }

  @Post("live")
  public async sendMessageLive(
    @Body() body: LiveChatMessageRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<LiveChatMessageResponse>> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    // 1. Retrieve Context (RAG) if any contextIds are provided
    let contextText = "";
    if (body.contextIds && body.contextIds.length > 0) {
      const contexts = await queryContexts(body.contextIds, body.content, 500);
      if (contexts && contexts.length > 0) {
        contextText = contexts.join("\n---\n");
      }
    }

    // 2. Build the Live system prompt
    const systemPrompt = `You are a helpful AI Meeting Assistant sidekick.
You are actively listening in on a live meeting. 
The user will ask you questions about the meeting or related documents.

Here is what has been spoken in the live meeting transcript so far:
<live_transcript>
${body.liveTranscript}
</live_transcript>

Here is the supplementary Knowledge Base Context (if any):
<context>
${contextText}
</context>

Answer the user's question directly and concisely, drawing primarily from the live transcript and context provided. If the topic has not been discussed yet, say so.

CRITICAL: You MUST respond in the EXACT same language that the user used to ask their question. (e.g., if the user asks in Spanish, you MUST answer in Spanish; if in English, answer in English).`;

    // 3. Construct history array
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (body.history && Array.isArray(body.history)) {
      for (const h of body.history) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: body.content });

    // 4. Generate stateless response using Vercel AI
    try {
      const aiResponse = await generateText({
        model: this.openrouter(this.modelName),
        messages: messages,
      });

      return {
        status: 200,
        data: {
          response: aiResponse?.text || "I'm sorry, I couldn't generate a response.",
        },
      };
    } catch (error) {
      logger.error("Error generating Live AI response", error);
      throw new Error("Failed to generate live response");
    }
  }
}
