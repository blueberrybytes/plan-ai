import { DocDocument } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";

export interface CreateDocInput {
  title: string;
  prompt: string;
  contextIds?: string[];
  transcriptIds?: string[];
  themeId?: string;
}

export interface UpdateDocInput {
  title?: string;
  content?: string;
  themeId?: string | null;
  isPublic?: boolean;
}

export class DocGenerationService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });

  private readonly modelName = "google/gemini-2.0-flash-001";

  public async startGeneration(userId: string, input: CreateDocInput): Promise<DocDocument> {
    const doc = await prisma.docDocument.create({
      data: {
        userId,
        title: input.title,
        content: "",
        status: "GENERATING",
        contextIds: input.contextIds ?? [],
        transcriptIds: input.transcriptIds ?? [],
        themeId: input.themeId ?? null,
        prompt: input.prompt,
      },
    });

    // Fire-and-forget background generation
    this.generateBackground(userId, doc.id, input).catch((err) => {
      logger.error(`Doc generation failed for ${doc.id}`, err);
      prisma.docDocument
        .update({ where: { id: doc.id }, data: { status: "FAILED" } })
        .catch(() => {});
    });

    return doc;
  }

  private async generateBackground(
    userId: string,
    docId: string,
    input: CreateDocInput,
  ): Promise<void> {
    const contextChunks: string[] = [];

    // Gather context chunks from vector store
    if (input.contextIds && input.contextIds.length > 0) {
      try {
        const chunks = await queryContexts(input.contextIds, input.prompt, 1500);
        contextChunks.push(...chunks);
      } catch (err) {
        logger.warn("Failed to query contexts for doc generation", err);
      }
    }

    // Gather transcript content
    const transcriptTexts: string[] = [];
    if (input.transcriptIds && input.transcriptIds.length > 0) {
      const transcripts = await prisma.transcript.findMany({
        where: { id: { in: input.transcriptIds }, userId },
        select: { title: true, transcript: true, summary: true },
      });
      for (const t of transcripts) {
        const parts = [`## Transcript: ${t.title ?? "Untitled"}`];
        if (t.summary) parts.push(`**Summary:** ${t.summary}`);
        if (t.transcript) parts.push(t.transcript);
        transcriptTexts.push(parts.join("\n"));
      }
    }

    const prompt = this.buildPrompt(input.prompt, contextChunks, transcriptTexts);
    const model = this.openrouter(this.modelName);

    let fullContent = "";

    const { textStream } = await streamText({ model, prompt, temperature: 0.4 });

    for await (const chunk of textStream) {
      fullContent += chunk;
      // Update DB every ~500 chars to show streaming progress
      if (fullContent.length % 500 < chunk.length) {
        await prisma.docDocument.update({
          where: { id: docId },
          data: { content: fullContent },
        });
      }
    }

    await prisma.docDocument.update({
      where: { id: docId },
      data: { content: fullContent, status: "DRAFT" },
    });

    logger.info(`Doc generation complete for ${docId}`);
  }

  private buildPrompt(userPrompt: string, contextChunks: string[], transcripts: string[]): string {
    const contextSection =
      contextChunks.length > 0 ? `## Context Knowledge\n\n${contextChunks.join("\n\n")}\n` : "";

    const transcriptSection =
      transcripts.length > 0 ? `## Transcripts\n\n${transcripts.join("\n\n---\n\n")}\n` : "";

    return `You are an expert document writer. Generate a well-structured, professional document in **rich Markdown format**.

Use appropriate headings (# ## ###), bold, italic, bullet lists, numbered lists, tables, and blockquotes where suitable.
The document should be comprehensive, well-organized, and ready to share.
Do NOT include any preamble like "Here is your document" — start directly with the content.

${contextSection}
${transcriptSection}

## User Request

${userPrompt}`;
  }

  // --- CRUD ---

  public async findAll(userId: string): Promise<DocDocument[]> {
    return prisma.docDocument.findMany({
      where: { userId },
      include: { theme: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  public async findById(userId: string, id: string): Promise<DocDocument> {
    const doc = await prisma.docDocument.findFirst({
      where: { id, userId },
      include: { theme: true },
    });
    if (!doc) throw { status: 404, message: "Document not found" };
    return doc;
  }

  public async findPublicById(id: string): Promise<DocDocument> {
    const doc = await prisma.docDocument.findFirst({
      where: { id },
      include: { theme: true },
    });
    if (!doc) throw { status: 404, message: "Document not found" };
    return doc;
  }

  public async update(userId: string, id: string, input: UpdateDocInput): Promise<DocDocument> {
    await this.findById(userId, id);
    const updated = await prisma.docDocument.update({
      where: { id },
      data: { ...input, updatedAt: new Date() },
      include: { theme: true },
    });
    return updated;
  }

  public async delete(userId: string, id: string): Promise<void> {
    await this.findById(userId, id);
    await prisma.docDocument.delete({ where: { id } });
  }
}

export const docGenerationService = new DocGenerationService();
