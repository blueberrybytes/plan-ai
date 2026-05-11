import { DocDocument, BrandTheme } from "@prisma/client";
import {
  getConfiguredModel,
  getFallbackProviderOptions,
  DEFAULT_AI_MODEL,
  getMaxContextChunks,
} from "../utils/aiModelUtils";
import { streamText, generateText, stepCountIs } from "ai";
import prisma from "../prisma/prismaClient";
import { queryContexts } from "../vector/contextFileVectorService";
import { logger } from "../utils/logger";
import { aiUsageService } from "./aiUsageService";
import { getPersonaInstructions } from "./personaService";
import { mcpClientService } from "./mcpClientService";

export interface CreateDocInput {
  title: string;
  prompt?: string;
  contextIds?: string[];
  transcriptIds?: string[];
  themeId?: string;
  isBlank?: boolean;
}

export interface UpdateDocInput {
  title?: string;
  content?: string;
  themeId?: string | null;
  isPublic?: boolean;
}

export class DocGenerationService {
  public async startGeneration(
    userId: string,
    workspaceId: string,
    input: CreateDocInput,
  ): Promise<DocDocument & { theme: BrandTheme | null }> {
    const doc = await prisma.docDocument.create({
      data: {
        userId,
        workspaceId,
        title: input.title,
        content: input.isBlank ? `# ${input.title}\n\n## Subtitle\n\nAdd your content here...` : "",
        status: input.isBlank ? "DRAFT" : "GENERATING",
        contextIds: input.contextIds ?? [],
        transcriptIds: input.transcriptIds ?? [],
        themeId: input.themeId ?? null,
        prompt: input.prompt ?? "",
      },
      include: { theme: true },
    });

    // Fire-and-forget background generation
    if (!input.isBlank) {
      this.generateBackground(userId, workspaceId, doc.id, input).catch((err) => {
        logger.error(`Doc generation failed for ${doc.id}`, err);
        prisma.docDocument
          .update({ where: { id: doc.id }, data: { status: "FAILED" } })
          .catch(() => {});
      });
    }

    return doc;
  }

  private async generateBackground(
    userId: string,
    workspaceId: string,
    docId: string,
    input: CreateDocInput,
  ): Promise<void> {
    const contextChunks: string[] = [];

    // Gather context chunks from vector store
    if (input.contextIds && input.contextIds.length > 0) {
      try {
        const chunks = await queryContexts(
          input.contextIds,
          input.prompt ?? "",
          getMaxContextChunks(DEFAULT_AI_MODEL),
        );
        contextChunks.push(...chunks);
      } catch (err) {
        logger.warn("Failed to query contexts for doc generation", err);
      }
    }

    // Gather transcript content
    const transcriptTexts: string[] = [];
    if (input.transcriptIds && input.transcriptIds.length > 0) {
      const transcripts = await prisma.transcript.findMany({
        where: { id: { in: input.transcriptIds }, workspaceId },
        select: { title: true, transcript: true, summary: true },
      });
      for (const t of transcripts) {
        const parts = [`## Transcript: ${t.title ?? "Untitled"}`];
        if (t.summary) parts.push(`**Summary:** ${t.summary}`);
        if (t.transcript) parts.push(t.transcript);
        transcriptTexts.push(parts.join("\n"));
      }
    }

    const personaInstructions = await getPersonaInstructions(userId, workspaceId);
    let prompt = this.buildPrompt(
      input.prompt ?? "",
      contextChunks,
      transcriptTexts,
      personaInstructions,
    );
    const model = getConfiguredModel();

    // Step 1: Optional Agentic Investigation via MCP
    const tools = mcpClientService.getAiTools();
    console.log("🚀 ~ DocGenerationService ~ generateBackground ~ tools:", tools);

    if (tools) {
      try {
        logger.info(`Starting Two-Step Agentic Investigation for Doc: ${docId}`);
        const investigation = await generateText({
          model,
          providerOptions: getFallbackProviderOptions(),
          tools,
          stopWhen: stepCountIs(3),
          system:
            "You are an AI assistant. The user wants to generate a document or task list based on their prompt. IF the request is a simple, non-technical business or life task, DO NOT query the codebase. Simply return 'No codebase context needed.' OTHERWISE, use your tools to query the codebase knowledge graph and gather relevant structure, execution flows, or context needed to fulfill this request. Summarize your findings to be included in the final document generation prompt.",
          prompt: `Goal: ${input.prompt ?? "Generate document"}\n\nPlease investigate the codebase ONLY IF this is a technical software task to gather any missing context for this request.`,
        });

        if (investigation.text) {
          prompt += `\n\n### Codebase Investigation Context:\n${investigation.text}`;
        }

        aiUsageService.logUsage({
          userId,
          workspaceId,
          feature: "DOC",
          provider: "openrouter",
          model: DEFAULT_AI_MODEL,
          inputTokens: investigation.totalUsage?.inputTokens || 0,
          outputTokens: investigation.totalUsage?.outputTokens || 0,
        }).catch(() => {});
      } catch (err) {
        logger.error("Failed during MCP agentic investigation step for doc generation", err);
      }
    }

    let fullContent = "";

    const { textStream, totalUsage } = await streamText({
      model,
      providerOptions: getFallbackProviderOptions(),
      prompt,
      temperature: 0.4,
      maxRetries: 3,
    });

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

    try {
      const usageData = await totalUsage;
      await aiUsageService.logUsage({
        userId,
        workspaceId,
        feature: "DOC",
        provider: "openrouter",
        model: DEFAULT_AI_MODEL,
        inputTokens: usageData.inputTokens || 0,
        outputTokens: usageData.outputTokens || 0,
      });
    } catch (usageErr) {
      logger.error("Failed to log DOC generation usage", usageErr);
    }

    logger.info(`Doc generation complete for ${docId}`);
  }

  public async fixMermaidSyntax(brokenSyntax: string): Promise<string> {
    const model = getConfiguredModel();
    const prompt = `You are an expert at writing Mermaid.js diagrams. The following Mermaid syntax crashes the renderer due to syntax constraints, invalid characters, or formatting errors.
Please fix it so it is completely valid Mermaid code.

Broken code:
\`\`\`mermaid
${brokenSyntax}
\`\`\`

Return ONLY the corrected Mermaid code inside a triple backtick block. Do NOT include any explanations. 
CRITICAL RULES FOR MERMAID:
1. NODE IDs: Node IDs MUST be strictly alphanumeric (A-Z, a-z, 0-9) and underscores. NEVER use dots, slashes, hyphens, or spaces in Node IDs.
   - BAD: Node.js["Node.js"]
   - GOOD: NodeJS["Node.js"]
2. NODE LABELS: ANY node label that contains spaces, punctuation, parentheses "()", ampersands "&", hyphens "-", or slashes "/" MUST be strictly enclosed in double quotes. 
   - BAD: A[Define Target Audience & Objectives] --> B[Develop Content Strategy]
   - GOOD: A["Define Target Audience & Objectives"] --> B["Develop Content Strategy"]
   - BAD: F[Paid Ad Campaigns (LinkedIn)]
   - GOOD: F["Paid Ad Campaigns (LinkedIn)"]
3. FOR STATEDIAGRAM: NEVER use double quotes directly in transition arrows. ALWAYS define an alias first using 'state "Label" as ID', and then transition between IDs.
4. SUBGRAPHS: EVERY \`subgraph\` MUST be properly closed with an \`end\` keyword. Never leave a subgraph unclosed.
5. Ensure edges match standard syntax (--> etc).

If you return the exact same broken code without quotes around parentheses and ampersands, the system will crash again.`;

    const { text, totalUsage } = await generateText({ model, prompt, temperature: 0.2, maxRetries: 3 });

    aiUsageService.logUsage({
      userId: "system",
      workspaceId: "system",
      feature: "DOC",
      provider: "openrouter",
      model: DEFAULT_AI_MODEL,
      inputTokens: totalUsage?.inputTokens || 0,
      outputTokens: totalUsage?.outputTokens || 0,
    }).catch(() => {});

    // Extract code from backticks if present
    const match = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
  }

  private buildPrompt(
    userPrompt: string,
    contextChunks: string[],
    transcripts: string[],
    personaInstructions: string,
  ): string {
    const contextSection =
      contextChunks.length > 0 ? `## Context Knowledge\n\n${contextChunks.join("\n\n")}\n` : "";

    const transcriptSection =
      transcripts.length > 0 ? `## Transcripts\n\n${transcripts.join("\n\n---\n\n")}\n` : "";

    return `You are an expert document writer. Generate a well-structured, professional document in **rich Markdown format**.
${personaInstructions}

Use appropriate headings (# ## ###), bold, italic, bullet lists, numbered lists, tables, and blockquotes where suitable.
If explaining an architecture, workflow, data hierarchy, or multi-step process, you MUST include a \`\`\`mermaid block.
When writing Mermaid code:
- Node IDs must be strictly alphanumeric (no dots, no slashes).
- Node labels with any special characters or spaces MUST be enclosed in double quotes (e.g. \`Node["My Label!"]\`).
- Ensure every \`subgraph\` is properly closed with an \`end\` keyword.
If the user's prompt implies generating tasks, action items, or a checklist, you MUST format each task with a Markdown checkbox (e.g., \`- [ ] Task description\`).
Make the document comprehensive, well-organized, and ready to share.
Do NOT include any preamble like "Here is your document" — start directly with the content.

${contextSection}
${transcriptSection}

## User Request

${userPrompt}`;
  }

  // --- CRUD ---

  public async findAll(
    userId: string,
    workspaceId: string,
  ): Promise<(DocDocument & { theme: BrandTheme | null })[]> {
    return prisma.docDocument.findMany({
      where: { workspaceId },
      include: { theme: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  public async findById(
    userId: string,
    workspaceId: string,
    id: string,
  ): Promise<DocDocument & { theme: BrandTheme | null }> {
    const doc = await prisma.docDocument.findFirst({
      where: { id, workspaceId },
      include: { theme: true },
    });
    if (!doc) throw { status: 404, message: "Document not found" };
    return doc;
  }

  public async findPublicById(id: string): Promise<DocDocument & { theme: BrandTheme | null }> {
    const doc = await prisma.docDocument.findFirst({
      where: { id },
      include: { theme: true },
    });
    if (!doc) throw { status: 404, message: "Document not found" };
    return doc;
  }

  public async update(
    userId: string,
    workspaceId: string,
    id: string,
    input: UpdateDocInput,
  ): Promise<DocDocument & { theme: BrandTheme | null }> {
    await this.findById(userId, workspaceId, id);
    const updated = await prisma.docDocument.update({
      where: { id },
      data: { ...input, updatedAt: new Date() },
      include: { theme: true },
    });
    return updated;
  }

  public async delete(userId: string, workspaceId: string, id: string): Promise<void> {
    await this.findById(userId, workspaceId, id);
    await prisma.docDocument.delete({ where: { id } });
  }
}

export const docGenerationService = new DocGenerationService();
