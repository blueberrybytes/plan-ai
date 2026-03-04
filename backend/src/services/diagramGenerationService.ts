import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { queryContexts } from "../vector/contextFileVectorService";

export interface DiagramGenerationRequest {
  diagramId: string;
  userId: string;
  prompt: string;
  type: string;
  contextIds: string[];
  transcriptIds: string[];
}

class DiagramGenerationService {
  private openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });
  private modelName = "google/gemini-2.5-flash";

  async triggerGeneration(request: DiagramGenerationRequest): Promise<void> {
    const { diagramId, userId, prompt, type, contextIds, transcriptIds } = request;

    try {
      await prisma.diagram.update({
        where: { id: diagramId },
        data: { status: "GENERATING" },
      });

      const rawContextData = await queryContexts(contextIds, prompt);

      let contextContent = "";
      if (rawContextData && rawContextData.length > 0) {
        contextContent = rawContextData
          .map((c) => {
            // Some chunks exist in contexts
            return `## Context Chunk: \n${c || "(No readable text)"}`;
          })
          .join("\n\n---\n\n");
      }

      const rawTranscripts = await prisma.transcript.findMany({
        where: {
          id: { in: transcriptIds },
          userId,
        },
      });

      let transcriptContent = "";
      if (rawTranscripts.length > 0) {
        transcriptContent = rawTranscripts
          .map((t) => `## Transcript: ${t.title || "Untitled"}\n${t.transcript || ""}`)
          .join("\n\n---\n\n");
      }

      const systemPrompt = this.buildPrompt(type, contextContent, transcriptContent);

      logger.info(`Starting diagram generation for ${diagramId}`);

      const model = this.openrouter(this.modelName);

      const { textStream } = streamText({
        model,
        system: systemPrompt,
        prompt: `User Request: ${prompt}`,
        temperature: 0.2,
      });

      let fullMermaidCode = "";

      for await (const textPart of textStream) {
        fullMermaidCode += textPart;
        await prisma.diagram.update({
          where: { id: diagramId },
          data: { mermaidCode: this.cleanMermaidSyntax(fullMermaidCode) },
        });
      }

      await prisma.diagram.update({
        where: { id: diagramId },
        data: {
          mermaidCode: this.cleanMermaidSyntax(fullMermaidCode),
          status: "DRAFT",
        },
      });

      logger.info(`Diagram generation for ${diagramId} completed successfully.`);
    } catch (error) {
      logger.error(`Diagram generation failed for ${diagramId}`, error);
      await prisma.diagram
        .update({
          where: { id: diagramId },
          data: { status: "FAILED" },
        })
        .catch(() => {});
    }
  }

  private cleanMermaidSyntax(rawText: string): string {
    let cleaned = rawText.trim();
    if (cleaned.startsWith("```mermaid")) {
      cleaned = cleaned.replace(/^```mermaid\s*\n?/i, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*\n?/i, "");
    }

    if (cleaned.endsWith("```")) {
      cleaned = cleaned.replace(/\s*```$/i, "");
    }

    return cleaned.trim();
  }

  private buildPrompt(type: string, contextContent: string, transcriptContent: string): string {
    return `You are an expert Mermaid diagram architect.
Your sole purpose is to output EXCLUSIVELY raw Mermaid syntax matching the requested diagram type: ${type}.
Do NOT output any markdown blocks, conversational text, explanations, or preamble.
The very first character of your response MUST be the start of the Mermaid syntax.

## Guidelines per type:
- FLOWCHART: Use 'flowchart TD' or 'flowchart LR'.
- SEQUENCE: Use 'sequenceDiagram'.
- GANTT: Use 'gantt' and define axes and formats clearly.
- MINDMAP: Use 'mindmap'.
- CLASS: Use 'classDiagram'.
- ER: Use 'erDiagram'.
- ARCHITECTURE: Use 'architecture-beta' or 'flowchart TD' if standard architecture syntax is too strict.

Use the provided source material to accurately deduce relationships, dependencies, hierarchies, and timelines.

${contextContent ? `## Source Contexts\n${contextContent}` : ""}
${transcriptContent ? `## Source Transcripts\n${transcriptContent}` : ""}`;
  }
}

export const diagramGenerationService = new DiagramGenerationService();
