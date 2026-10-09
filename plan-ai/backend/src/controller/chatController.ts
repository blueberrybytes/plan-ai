import { chatMessageFeature, countFeature } from "../services/featureUsageService";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import {
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
  UploadedFile,
} from "tsoa";
import { uploadChatAttachmentToFirebaseStorage } from "../firebase/firebaseStorage";
import { DISPLAY_URL_TTL_MS, signedUrlForPath } from "../firebase/privateStorage";
import { toDisplayAttachments } from "../services/chatAttachments";
import { deleteChatThreadArtifacts } from "../services/dataDeletionService";
import {
  resolveProjectIdsToContextIds,
  resolveContextIdsToProjectIds,
} from "../services/projectContextResolver";
import { type LiveChatHistoryItem, type ApiResponse } from "./controllerTypes";
import { MERMAID_SYNTAX_RULES } from "../prompts/mermaidRules";
import { ChatRole } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { type AuthenticatedRequest } from "../middleware/authMiddleware";
import { queryContexts } from "../vector/contextFileVectorService";
import {
  CONTEXT_SUPPORTED_FILE_LABELS,
  extractTextFromBuffer,
  isSupportedContextFileMimeType,
} from "../utils/documentTextExtractor";
import { generateText, stepCountIs } from "ai";
import {
  getConfiguredModel,
  getFallbackProviderOptions,
  DEFAULT_AI_MODEL,
  FAST_AI_MODEL,
} from "../utils/aiModelUtils";
import { mcpClientService, repoNameForContexts } from "../services/mcpClientService";
import { extractUrls } from "../utils/urlAllowlist";
import { aiUsageService } from "../services/aiUsageService";

export interface ChatAttachment {
  url: string;
  type: string;
  name: string;
  size?: number;
}

interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[] | null;
  createdAt: Date;
}

interface ChatThread {
  id: string;
  userId: string;
  title: string;
  contextIds: string[];
  /** User-facing project IDs (1:1 with contextIds). Resolved by the backend. */
  projectIds?: string[];
  complexityLevel?: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
}

interface CreateThreadRequest {
  title?: string;
  /** Legacy: direct context IDs. Prefer `projectIds`. */
  contextIds?: string[];
  /** Preferred user-facing path: project IDs are resolved to contextIds internally. */
  projectIds?: string[];
  complexityLevel?: string;
}

interface SendMessageRequest {
  content: string;
  modelKey?: string;
}

interface SendMessageResponse {
  message: ChatMessage;
  response: ChatMessage;
}

export interface LiveChatMessageRequest {
  content: string;
  liveTranscript: string;
  /** Legacy: direct context IDs. Prefer `projectIds`. */
  contextIds?: string[];
  /** Preferred: user-facing project IDs (auto-resolved to contextIds). */
  projectIds?: string[];
  history?: LiveChatHistoryItem[];
  modelKey?: string;
  complexityLevel?: string;
  /**
   * Files attached to the chat during the meeting, as the text returned by
   * POST /api/chat/live/documents. The client sends them with every question.
   */
  documents?: LiveChatDocument[];
}

export interface LiveChatDocument {
  name: string;
  text: string;
}

export interface LiveChatMessageResponse {
  response: string;
}

export interface LiveChatDocumentResponse {
  name: string;
  mimeType: string;
  size: number;
  text: string;
  /** The file had more text than the chat keeps. Only the start is in `text`. */
  truncated: boolean;
}

// One file is cut at 50,000 characters (about 12,000 tokens) and all files
// together at 150,000, because the whole text goes with every question.
const LIVE_DOCUMENT_MAX_CHARS = 50_000;
const LIVE_DOCUMENTS_TOTAL_MAX_CHARS = 150_000;
const LIVE_DOCUMENTS_MAX_COUNT = 5;
const LIVE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

// The recorder sends "" or application/octet-stream when the OS does not know
// the extension, which happens with .md on macOS.
const TEXT_TYPE_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
};

const liveDocumentMimeType = (mimetype: string, fileName: string): string => {
  if (mimetype && mimetype !== "application/octet-stream") return mimetype;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_TYPE_BY_EXTENSION[ext] ?? mimetype;
};

/** The attached files as a prompt block, inside the size limits above. */
const formatLiveDocuments = (documents: LiveChatDocument[] | undefined): string => {
  if (!Array.isArray(documents) || documents.length === 0) return "";
  let budget = LIVE_DOCUMENTS_TOTAL_MAX_CHARS;
  const parts: string[] = [];
  for (const doc of documents.slice(0, LIVE_DOCUMENTS_MAX_COUNT)) {
    if (typeof doc?.text !== "string" || budget <= 0) continue;
    const limit = Math.min(LIVE_DOCUMENT_MAX_CHARS, budget);
    const text = doc.text.length > limit ? `${doc.text.slice(0, limit)}\n[cut here]` : doc.text;
    budget -= Math.min(doc.text.length, limit);
    const name = String(doc.name ?? "file").replace(/["<>]/g, "");
    parts.push(`<document name="${name}">\n${text}\n</document>`);
  }
  return parts.join("\n");
};

export interface LiveSummaryRequest {
  /**
   * The transcript so far. When `newTranscript` is sent with a
   * `previousSummary`, clients send only a short recent tail here, for
   * context.
   */
  liveTranscript: string;
  previousSummary?: string;
  /**
   * Only what was said since `previousSummary` was made. Lets the summary be
   * updated from the new lines instead of re-reading the whole meeting every
   * few seconds, which grew with the square of the meeting length.
   */
  newTranscript?: string;
  /** Legacy: direct context IDs. Prefer `projectIds`. */
  contextIds?: string[];
  /** Preferred: user-facing project IDs. */
  projectIds?: string[];
  modelKey?: string;
}

export interface LiveSummaryResponse {
  summary: string;
}

export interface SkillsResponse {
  skills: { name: string; description: string }[];
}

@Route("api/chat")
@Tags("Chat")
@Security("ClientLevel")
export class ChatController extends BaseWorkspaceController {
  private async validateContextIds(
    contextIds: string[] | undefined,
    workspaceId: string,
  ): Promise<string[]> {
    if (!contextIds || contextIds.length === 0) return [];
    const validContexts = await prisma.context.findMany({
      where: { id: { in: contextIds }, workspaceId },
      select: { id: true },
    });
    return validContexts.map((c) => c.id);
  }

  /**
   * Accept either `projectIds` (preferred, user-facing) or `contextIds`
   * (legacy). Resolves projects to contexts, merges with any direct
   * contextIds, validates ownership, returns final contextIds list.
   */
  private async resolveAndValidate(
    projectIds: string[] | undefined,
    contextIds: string[] | undefined,
    workspaceId: string,
  ): Promise<string[]> {
    const fromProjects =
      projectIds && projectIds.length > 0 ? await resolveProjectIdsToContextIds(projectIds, workspaceId) : [];
    const merged = Array.from(new Set([...fromProjects, ...(contextIds ?? [])]));
    return this.validateContextIds(merged, workspaceId);
  }

  /**
   * Build a user-facing ChatThread shape: includes both `contextIds` (legacy)
   * and `projectIds` (preferred) so consumers can transition smoothly.
   */
  private async hydrateThreadResponse<T extends { contextIds: string[] }>(
    thread: T,
  ): Promise<T & { projectIds: string[] }> {
    const projectIds = await resolveContextIdsToProjectIds(thread.contextIds);
    return { ...thread, projectIds };
  }

  @Get("assistant/skills")
  @Security("BearerAuth")
  public async getAssistantSkills(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<SkillsResponse>> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    return {
      status: 200,
      data: {
        skills: [
          {
            name: "Navigate",
            description: "Navigate the user to a specific page in the application.",
          },
          { name: "List Projects", description: "List the user's current projects." },
          {
            name: "List Tasks",
            description: "List tasks assigned to the user or globally for a project.",
          },
          {
            name: "List Contexts",
            description: "List the user's Context Library elements/folders.",
          },
          { name: "List Documents", description: "List the user's rich text documents." },
          {
            name: "List Features",
            description: "Explain the features and capabilities of this application.",
          },
          {
            name: "Explain Project",
            description: "Provide a detailed explanation of a specific project.",
          },
          { name: "Create Project", description: "Create a new project." },
          { name: "Create Document", description: "Create a new rich text document." },
          { name: "Create Context", description: "Create a new Context Library folder." },
          { name: "Create Brand Theme", description: "Create a new Brand Theme." },
        ],
      },
    };
  }

  @Get("threads")
  public async listThreads(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread[]>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const threads = await prisma.chatThread.findMany({
      where: { userId: user.id, workspaceId },
      orderBy: { updatedAt: "desc" },
    });
    const hydrated = await Promise.all(threads.map((t) => this.hydrateThreadResponse(t)));
    return { status: 200, data: hydrated as unknown as ChatThread[] };
  }

  @Get("threads/{threadId}")
  public async getThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const thread = await prisma.chatThread.findFirstOrThrow({
      where: { id: threadId, userId: user.id, workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const hydrated = await this.hydrateThreadResponse(thread);
    // Attachments are saved as private gs:// URIs; the browser gets signed URLs.
    const messages = await Promise.all(
      thread.messages.map(async (m) => ({
        ...m,
        attachments: await toDisplayAttachments(m.attachments, user.id),
      })),
    );
    return { status: 200, data: { ...hydrated, messages } as unknown as ChatThread };
  }

  @Post("threads/{threadId}/attachments")
  public async uploadAttachment(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
    @UploadedFile("file") file: Express.Multer.File,
  ): Promise<ChatAttachment> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    // Confirm the user actually owns the thread before uploading.
    await prisma.chatThread.findFirstOrThrow({
      where: { id: threadId, userId: user.id },
    });

    const ALLOWED_TYPES = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/csv",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/json",
    ];
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `Unsupported attachment type: ${file.mimetype}. Allowed: images, PDFs, CSV, TXT, MD, Excel, Word, JSON.`,
      };
    }

    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      this.setStatus(400);
      throw { status: 400, message: "Attachment too large (max 20MB)" };
    }

    const { storagePath } = await uploadChatAttachmentToFirebaseStorage(
      file.buffer,
      user.id,
      threadId,
      file.originalname,
      file.mimetype,
    );

    return {
      url: await signedUrlForPath(storagePath, DISPLAY_URL_TTL_MS),
      type: file.mimetype,
      name: file.originalname,
      size: file.size,
    };
  }

  /**
   * Threadless attachment upload, used by the workspace-level assistant
   * (Home + Project Assistant tab). Files live under a "workspace" namespace
   * scoped to the user, since these chats don't have a thread row.
   */
  @Post("attachments")
  public async uploadAssistantAttachment(
    @Request() request: AuthenticatedRequest,
    @UploadedFile("file") file: Express.Multer.File,
  ): Promise<ChatAttachment> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);

    const ALLOWED_TYPES = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/csv",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/json",
    ];
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `Unsupported attachment type: ${file.mimetype}. Allowed: images, PDFs, CSV, TXT, MD, Excel, Word, JSON.`,
      };
    }

    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      this.setStatus(400);
      throw { status: 400, message: "Attachment too large (max 20MB)" };
    }

    // "workspace" stands in for the missing threadId — files share that
    // namespace per user. Cleanup policy (if any) can sweep this folder.
    const { storagePath } = await uploadChatAttachmentToFirebaseStorage(
      file.buffer,
      user.id,
      "workspace",
      file.originalname,
      file.mimetype,
    );

    return {
      url: await signedUrlForPath(storagePath, DISPLAY_URL_TTL_MS),
      type: file.mimetype,
      name: file.originalname,
      size: file.size,
    };
  }

  @Post("threads")
  public async createThread(
    @Body() body: CreateThreadRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // 1. Generate an intelligent title if none provided
    let title = body.title || "New Chat";
    if (!body.title) {
      try {
        const contentPreview = "New user asking questions about context/recordings.";
        const aiResponse = await generateText({
          model: getConfiguredModel(DEFAULT_AI_MODEL),
          providerOptions: getFallbackProviderOptions(DEFAULT_AI_MODEL),
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
        aiUsageService
          .logUsage({
            userId: user.id,
            workspaceId,
            feature: "CHAT",
            provider: "openrouter",
            model: DEFAULT_AI_MODEL,
            inputTokens: aiResponse.totalUsage?.inputTokens || 0,
            outputTokens: aiResponse.totalUsage?.outputTokens || 0,
          })
          .catch(() => {});
      } catch (e) {
        logger.warn("Failed to generate intelligent title for chat thread", e);
      }
    }

    const validContextIds = await this.resolveAndValidate(
      body.projectIds,
      body.contextIds,
      workspaceId,
    );

    const thread = await prisma.chatThread.create({
      data: {
        userId: user.id,
        workspaceId,
        title,
        contextIds: validContextIds,
        complexityLevel: body.complexityLevel,
      },
      include: { messages: true },
    });

    const hydrated = await this.hydrateThreadResponse(thread);
    return { status: 200, data: hydrated as unknown as ChatThread };
  }

  @Put("threads/{threadId}")
  public async updateThread(
    @Path() threadId: string,
    @Body()
    body: {
      title?: string;
      contextIds?: string[];
      projectIds?: string[];
      complexityLevel?: string;
    },
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<ChatThread>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const updateData: import("@prisma/client").Prisma.ChatThreadUpdateInput = {
      title: body.title,
      complexityLevel: body.complexityLevel,
    };

    if (body.projectIds !== undefined || body.contextIds !== undefined) {
      updateData.contextIds = await this.resolveAndValidate(
        body.projectIds,
        body.contextIds,
        workspaceId,
      );
    }

    const thread = await prisma.chatThread.update({
      where: { id: threadId, userId: user.id, workspaceId },
      data: updateData,
    });
    const hydrated = await this.hydrateThreadResponse(thread);
    return { status: 200, data: hydrated as unknown as ChatThread };
  }

  @Delete("threads/{threadId}")
  public async deleteThread(
    @Path() threadId: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id, workspaceId },
      select: { id: true, userId: true },
    });
    if (thread) {
      // Attachments live in the bucket, not in the rows the delete cascades.
      await deleteChatThreadArtifacts([thread]);
      await prisma.chatThread.delete({ where: { id: thread.id } });
    }
    return { status: 200, data: { success: true } };
  }

  @Post("threads/{threadId}/messages")
  public async sendMessage(
    @Path() threadId: string,
    @Body() body: SendMessageRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<SendMessageResponse>> {
    const { user, workspaceId } = await this.getPaidLlmAccess(request);

    // Verify thread ownership
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id, workspaceId },
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
    countFeature(chatMessageFeature(thread.transcriptId));

    // 2. Build Context (Vector RAG)
    let contextText = "";
    if (thread.contextIds.length > 0) {
      const contexts = await queryContexts(workspaceId, thread.contextIds, body.content, 5);
      if (contexts && contexts.length > 0) {
        contextText = contexts.join("\n---\n");
      }
    }

    const gitnexusTools = await (async () => {
      if (!mcpClientService.isAvailable) return undefined;
      // Codebase tools only for this thread's own indexed repo; memory scoped
      // to the workspace; fetch_url only for links the user typed here.
      const repo = await repoNameForContexts(thread.contextIds, workspaceId);
      const allowedUrls = new Set(
        [
          ...thread.messages.filter((m) => m.role === "USER").map((m) => m.content),
          body.content,
        ].flatMap((text) => extractUrls(text)),
      );
      return mcpClientService.getAiTools(repo, workspaceId, { allowedUrls });
    })();

    const hasGitnexus = Boolean(gitnexusTools);

    // 3. System Prompt & History Construction
    const codeIntelligenceSection =
      gitnexusTools && "query_codebase" in gitnexusTools
        ? `\n\nYou also have access to a live codebase knowledge graph for the repositories connected to this conversation. Use the \`query_codebase\` tool to trace execution flows and the \`get_symbol_context\` tool to inspect specific functions or classes. Only invoke these tools when the user's question is clearly about the code or the repository structure.`
        : "";

    const systemPrompt = `You are a helpful AI Meeting Assistant and Document Analyst.
You excel at answering questions based on the provided context, which are typically meeting transcripts or related documents.

${
  thread.complexityLevel
    ? `The user has requested you adjust your language and response complexity to the following level: ${thread.complexityLevel}. Adjust your vocabulary, grammatical structure, and idioms accordingly regardless of the language requested.`
    : ""
}${codeIntelligenceSection}

Here is the context provided for answering the user's queries:
<context>
${contextText}
</context>

Answer directly, accurately, and concisely. If the answer is not contained primarily in the context or conversation history, state that you do not have enough information derived from the provided documents.

If the user asks for a diagram, architecture, or flow, or if explaining a complex process would benefit from a visual aid, you MUST output a \`\`\`mermaid markdown block. The frontend natively supports rendering Mermaid diagrams.
${MERMAID_SYNTAX_RULES}`;

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
      const startTime = Date.now();
      const selectedModel =
        body.modelKey && body.modelKey.length > 0 ? body.modelKey : DEFAULT_AI_MODEL;
      const aiResponse = await generateText({
        model: getConfiguredModel(selectedModel),
        providerOptions: getFallbackProviderOptions(selectedModel),
        messages: messages,
        maxRetries: 3,
        ...(gitnexusTools
          ? {
              tools: gitnexusTools,
              stopWhen: stepCountIs(5),
            }
          : {}),
      });

      if (hasGitnexus) {
        logger.info(
          `[ChatController] GitNexus tools active for thread ${threadId} — used ${aiResponse.steps?.length ?? 0} step(s)`,
        );
      }

      const replyContent = aiResponse?.text || "I'm sorry, I couldn't generate a response.";
      const latencyMs = Date.now() - startTime;

      const toolsUsed: string[] = [];
      if (gitnexusTools && aiResponse.steps && aiResponse.steps.length > 0) {
        const usedToolNames = new Set<string>();
        for (const step of aiResponse.steps) {
          if (step.toolCalls) {
            for (const tc of step.toolCalls) {
              if (tc.toolName === "fetch_url") usedToolNames.add("Web Search");
              else if (tc.toolName === "query_codebase" || tc.toolName === "get_symbol_context")
                usedToolNames.add("Plan AI Code Graph");
              else if (tc.toolName === "add_memory" || tc.toolName === "query_memory")
                usedToolNames.add("Organization Memory");
              else usedToolNames.add(tc.toolName);
            }
          }
        }
        toolsUsed.push(...Array.from(usedToolNames));
      }

      // 4. Save Assistant Message
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          threadId,
          role: "ASSISTANT",
          content: JSON.stringify({
            text: replyContent,
            latencyMs,
            tools: toolsUsed,
          }),
        },
      });

      aiUsageService
        .logUsage({
          userId: user.id,
          workspaceId,
          feature: "CHAT",
          provider: "openrouter",
          model: selectedModel,
          inputTokens: aiResponse.totalUsage?.inputTokens || 0,
          outputTokens: aiResponse.totalUsage?.outputTokens || 0,
        })
        .catch(() => {});

      // Update thread updatedAt
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });

      return {
        status: 200,
        data: {
          message: userMessage as unknown as ChatMessage,
          response: assistantMessage as unknown as ChatMessage,
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
    const { workspaceId } = await this.getPaidLlmAccess(request);
    countFeature("chat.live_message");

    // 1. Retrieve Context (RAG) — accept either projectIds (preferred) or contextIds.
    let contextText = "";
    const validContextIds = await this.resolveAndValidate(
      body.projectIds,
      body.contextIds,
      workspaceId,
    );
    if (validContextIds.length > 0) {
      const contexts = await queryContexts(workspaceId, validContextIds, body.content, 500);
      if (contexts && contexts.length > 0) {
        contextText = contexts.join("\n---\n");
      }
    }

    const documentsText = formatLiveDocuments(body.documents);
    const documentsSection = documentsText
      ? `
Here are the files the user attached to this chat during the meeting:
<meeting_documents>
${documentsText}
</meeting_documents>
`
      : "";

    // 2. Build the Live system prompt
    const systemPrompt = `You are a helpful AI Meeting Assistant sidekick.
You are actively listening in on a live meeting.
The user will ask you questions about the meeting or related documents.

Here is what has been spoken in the live meeting transcript so far:
<live_transcript>
${body.liveTranscript}
</live_transcript>
${documentsSection}
Here is the supplementary Knowledge Base Context (if any):
<context>
${contextText}
</context>

Answer the user's question directly and concisely, drawing primarily from the live transcript, the attached files and the context provided. When the answer comes from an attached file, name the file. If the topic has not been discussed yet and is not in the files, say so.

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
      const selectedModel =
        body.modelKey && body.modelKey.length > 0 ? body.modelKey : FAST_AI_MODEL;
      const aiResponse = await generateText({
        model: getConfiguredModel(selectedModel),
        providerOptions: getFallbackProviderOptions(selectedModel),
        messages: messages,
        maxRetries: 3,
      });

      aiUsageService
        .logUsage({
          userId: (await this.getAuthorizedWorkspaceAccess(request)).user.id,
          workspaceId,
          feature: "CHAT",
          provider: "openrouter",
          model: selectedModel,
          inputTokens: aiResponse.totalUsage?.inputTokens || 0,
          outputTokens: aiResponse.totalUsage?.outputTokens || 0,
        })
        .catch(() => {});

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

  /**
   * Reads a file attached to the live chat during a recording and returns its
   * text. Nothing is stored: the recorder keeps the text for the rest of the
   * meeting and sends it with every question.
   */
  @Post("live/documents")
  public async extractLiveChatDocument(
    @Request() request: AuthenticatedRequest,
    @UploadedFile("file") file: Express.Multer.File,
  ): Promise<ApiResponse<LiveChatDocumentResponse>> {
    await this.getAuthorizedWorkspaceAccess(request);

    if (!file) {
      this.setStatus(400);
      throw { status: 400, message: "No file uploaded" };
    }
    if (file.size > LIVE_DOCUMENT_MAX_BYTES) {
      this.setStatus(400);
      throw { status: 400, message: "File too large (max 20MB)" };
    }

    const name = Buffer.from(file.originalname, "latin1").toString("utf8");
    const mimeType = liveDocumentMimeType(file.mimetype, name);
    if (!isSupportedContextFileMimeType(mimeType)) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `Unsupported file type. Supported types: ${CONTEXT_SUPPORTED_FILE_LABELS.join(", ")}.`,
      };
    }

    let text: string;
    try {
      text = await extractTextFromBuffer(file.buffer, mimeType);
    } catch (error) {
      logger.warn(`[LiveChat] Could not read "${name}" (${mimeType})`, error);
      this.setStatus(422);
      throw { status: 422, message: `Could not read ${name}.` };
    }
    if (!text.trim()) {
      this.setStatus(422);
      throw {
        status: 422,
        message: `${name} has no text to read. Scanned PDFs are not supported yet.`,
      };
    }

    const truncated = text.length > LIVE_DOCUMENT_MAX_CHARS;
    return {
      status: 200,
      data: {
        name,
        mimeType,
        size: file.size,
        text: truncated ? text.slice(0, LIVE_DOCUMENT_MAX_CHARS) : text,
        truncated,
      },
    };
  }

  // The knowledge-base lookup behind the live summary uses a fixed query, so
  // its result only changes when the project's files change. It ran on every
  // update (every 15 s); now it is reused for 10 minutes.
  private static liveSummaryContextCache = new Map<string, { text: string; at: number }>();
  private static readonly LIVE_SUMMARY_CONTEXT_TTL_MS = 10 * 60_000;

  private async liveSummaryContext(workspaceId: string, contextIds: string[]): Promise<string> {
    if (contextIds.length === 0) return "";
    const key = `${workspaceId}:${[...contextIds].sort().join(",")}`;
    const cache = ChatController.liveSummaryContextCache;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ChatController.LIVE_SUMMARY_CONTEXT_TTL_MS) return hit.text;
    const contexts = await queryContexts(workspaceId, contextIds, "summary tasks action items", 500);
    const text = contexts && contexts.length > 0 ? contexts.join("\n---\n") : "";
    if (cache.size >= 500) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { text, at: Date.now() });
    return text;
  }

  @Post("live-summary")
  public async generateLiveSummary(
    @Body() body: LiveSummaryRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<LiveSummaryResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    countFeature("chat.live_summary");

    // 1. Retrieve Context (RAG) — accept either projectIds (preferred) or contextIds.
    const validContextIds = await this.resolveAndValidate(
      body.projectIds,
      body.contextIds,
      workspaceId,
    );
    const contextText = await this.liveSummaryContext(workspaceId, validContextIds);

    // 2. Build instructions. With a previous summary and only the new lines,
    // the model updates the summary instead of re-reading the whole meeting.
    const incremental = !!body.previousSummary && body.newTranscript !== undefined;
    const transcriptSection = incremental
      ? `Here is what was said since your last summary:
<new_transcript>
${body.newTranscript}
</new_transcript>

The lines just before that, for context only (already covered by the summary):
<recent_context>
${body.liveTranscript}
</recent_context>`
      : `Here is the transcript of the meeting so far:
<live_transcript>
${body.liveTranscript}
</live_transcript>`;

    const systemPrompt = `You are a real-time meeting summarizer.
Your job is to read the rolling live transcript and extract a clean, concise bulleted summary and a list of specific Action Items/Tasks.

${transcriptSection}

Here is the supplementary Knowledge Base Context to help understand acronyms, rules, or domain specifics (if any):
<context>
${contextText}
</context>

${
  body.previousSummary
    ? `IMPORTANT: Here is the summary you generated earlier:\n<previous_summary>\n${body.previousSummary}\n</previous_summary>\n\nPlease UPDATE this summary. If new information was discussed, append it or modify existing points. Do NOT duplicate identical tasks if they were already listed.`
    : `Please create the initial running summary.`
}

CRITICAL LANGUAGE RULES:
1. You MUST analyze the PREDOMINANT language of the ENTIRE meeting (the transcript, or the previous summary plus the new lines).
2. Even if the meeting starts in one language (e.g. English), if the majority of the conversation shifts to another language (e.g. Spanish), you MUST write the summary and action items in that NEW predominant language.
3. If the previous summary is in the wrong language compared to the current predominant language, TRANSLATE it into the correct language while updating it.
4. This applies to the HEADINGS TOO, not just the body. Writing a Spanish summary under an English heading is wrong — translate the section titles into the predominant language as well.

Format your response exclusively in clean Markdown, with two "###" sections: a running summary first, then the action items. Name those sections in the predominant language of the transcript (in English they would read "Live Summary" and "Action Items"). Be extremely concise and professional. Do NOT include pleasantries, just output the markdown.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "user", content: systemPrompt },
    ];

    try {
      const selectedModel =
        body.modelKey && body.modelKey.length > 0 ? body.modelKey : FAST_AI_MODEL;
      const aiResponse = await generateText({
        model: getConfiguredModel(selectedModel),
        providerOptions: getFallbackProviderOptions(selectedModel),
        messages: messages,
        maxRetries: 3,
      });

      aiUsageService
        .logUsage({
          userId: (await this.getAuthorizedWorkspaceAccess(request)).user.id,
          workspaceId,
          feature: "CHAT",
          provider: "openrouter",
          model: selectedModel,
          inputTokens: aiResponse.totalUsage?.inputTokens || 0,
          outputTokens: aiResponse.totalUsage?.outputTokens || 0,
        })
        .catch(() => {});

      return {
        status: 200,
        data: {
          summary: aiResponse?.text || "*Waiting for enough transcript data to summarize...*",
        },
      };
    } catch (error) {
      logger.error("Error generating Live Summary AI response", error);
      throw new Error("Failed to generate live summary");
    }
  }
}
