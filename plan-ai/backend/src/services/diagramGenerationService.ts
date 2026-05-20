import { streamText } from "ai";
import { getConfiguredModel, getFallbackProviderOptions } from "../utils/aiModelUtils";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { queryContexts } from "../vector/contextFileVectorService";
import { aiUsageService } from "./aiUsageService";
import { getPersonaInstructions } from "./personaService";

export interface DiagramGenerationRequest {
  diagramId: string;
  userId: string;
  workspaceId: string;
  prompt: string;
  type: string;
  contextIds: string[];
  transcriptIds: string[];
  overrideSystemContext?: string;
}

export interface DiagramAssistantTriggerRequest {
  diagramId: string;
  userId: string;
  workspaceId: string;
  instruction: string;
  currentCode: string;
  contextIds: string[];
  transcriptIds: string[];
}

class DiagramGenerationService {
  async triggerGeneration(request: DiagramGenerationRequest): Promise<void> {
    const {
      diagramId,
      userId,
      workspaceId,
      prompt,
      type,
      contextIds,
      transcriptIds,
      overrideSystemContext,
    } = request;

    try {
      await prisma.diagram.update({
        where: { id: diagramId },
        data: { status: "GENERATING" },
      });

      let contextContent = "";

      if (overrideSystemContext) {
        // Truncate to ~1M characters maximum to avoid catastrophic OpenRouter payload rejection
        // 1M characters provides roughly 250K-300K tokens, huge enough for structural insights.
        const maxChars = 1000000;
        let safeContext = overrideSystemContext;
        if (safeContext.length > maxChars) {
          logger.warn(
            `Truncating overrideSystemContext for diagram ${diagramId} from ${safeContext.length} chars down to ${maxChars} chars.`,
          );
          safeContext =
            safeContext.substring(0, maxChars) + "\n...[TRUNCATED DUE TO SIZE LIMIT]...";
        }
        contextContent = `## Explicit System Context Chunk: \n${safeContext}`;
      } else {
        const rawContextData = await queryContexts(contextIds, prompt);
        if (rawContextData && rawContextData.length > 0) {
          contextContent = rawContextData
            .map((c) => `## Context Chunk: \n${c || "(No readable text)"}`)
            .join("\n\n---\n\n");
        }
      }

      const rawTranscripts = await prisma.transcript.findMany({
        where: {
          id: { in: transcriptIds },
          userId,
          workspaceId,
        },
      });

      let transcriptContent = "";
      if (rawTranscripts.length > 0) {
        transcriptContent = rawTranscripts
          .map((t) => `## Transcript: ${t.title || "Untitled"}\n${t.transcript || ""}`)
          .join("\n\n---\n\n");
      }

      const personaInstructions = await getPersonaInstructions(userId, workspaceId);
      const systemPrompt = this.buildPrompt(
        type,
        contextContent,
        transcriptContent,
        personaInstructions,
      );

      logger.info(`Starting diagram generation for ${diagramId}`);

      const { textStream, usage } = await streamText({
        model: getConfiguredModel(),
        providerOptions: getFallbackProviderOptions(),
        system: systemPrompt,
        prompt: `User Request: ${prompt}`,
        temperature: 0.2,
        maxRetries: 3,
        //maxOutputTokens: 4000,
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

      try {
        const usageData = await usage;
        await aiUsageService.logUsage({
          userId,
          workspaceId,
          feature: "DIAGRAM",
          provider: "openrouter",
          model: getConfiguredModel().modelId || "anthropic/claude-sonnet-4.6",
          inputTokens: usageData.inputTokens || 0,
          outputTokens: usageData.outputTokens || 0,
        });
      } catch (usageErr) {
        logger.error("Failed to log diagram generation usage", usageErr);
      }

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

  async triggerImprovement(request: DiagramAssistantTriggerRequest): Promise<void> {
    const { diagramId, userId, workspaceId, instruction, currentCode, contextIds, transcriptIds } =
      request;

    try {
      logger.info(
        `[triggerImprovement] Started for diagram ${diagramId} with instruction: ${instruction}`,
      );

      const rawContextData = await queryContexts(contextIds, instruction);
      let contextContent = "";
      if (rawContextData && rawContextData.length > 0) {
        contextContent = rawContextData
          .map((c) => `## Context Chunk: \n${c || "(No readable text)"}`)
          .join("\n\n---\n\n");
      }

      const rawTranscripts = await prisma.transcript.findMany({
        where: { id: { in: transcriptIds }, userId },
      });
      let transcriptContent = "";
      if (rawTranscripts.length > 0) {
        transcriptContent = rawTranscripts
          .map((t) => `## Transcript: ${t.title || "Untitled"}\n${t.transcript || ""}`)
          .join("\n\n---\n\n");
      }

      const personaInstructions = await getPersonaInstructions(userId, workspaceId);
      const systemPrompt = `You are an expert Mermaid diagram architect.
You are helping the user improve or fix an EXISTING Mermaid diagram.
Your HIGH-LEVEL INSTRUCTION: ${instruction}

${personaInstructions}

**RULES:**
1. Your sole purpose is to output EXCLUSIVELY raw Mermaid syntax representing the updated diagram.
2. Do NOT output any markdown blocks, conversational text, explanations, or preamble.
3. The very first character of your response MUST be the start of the Mermaid syntax.
4. Try your best to adhere to standard Mermaid syntax to prevent rendering errors.
5. CRITICAL FOR FLOWCHARTS AND GRAPHS: NODE IDs MUST be strictly alphanumeric. ANY node label that contains spaces, punctuation, parentheses "()", ampersands "&", hyphens "-", or slashes "/" MUST be strictly enclosed in double quotes. Example: A["Menu (Client)"] instead of A[Menu (Client)].
6. SUBGRAPHS: Every \`subgraph\` MUST have a matching \`end\` keyword. Do not truncate the diagram.
7. CRITICAL FOR STATEDIAGRAM: NEVER use double quotes directly in transitions. ALWAYS define an alias first using the 'state "Label" as Alias ID' syntax, and then transition between Alias IDs. Example: 'state "Homepage/Landing" as HL \\n [*] --> HL'.
8. CRITICAL FOR ER DIAGRAMS: Attribute types and names MUST be strictly alphanumeric. NEVER use special characters like '?', '!', '[', ']', or '()' in types or field names. For example, use 'String email' instead of 'String? email', and 'StringArray ids' instead of 'String[] ids'.
9. CRITICAL FOR CLASS DIAGRAMS: Generics MUST use tildes instead of angle brackets. For example, use 'List~String~' instead of 'List<String>'.
10. CRITICAL FOR MINDMAPS: Ensure strict indentation using spaces. Avoid special characters in node text unless you enclose the node text in double quotes or standard brackets like 'id(Text)'.
11. CRITICAL FOR GANTT CHARTS: You MUST specify a valid 'dateFormat' (e.g., 'YYYY-MM-DD'). Dates MUST adhere strictly to that exact format.
12. CRITICAL FOR XYCHART: Start with 'xychart-beta'. You MUST define the x-axis and y-axis. Use 'x-axis' and 'y-axis', followed by 'bar' or 'line' datasets.
13. CRITICAL FOR QUADRANT: Use 'quadrantChart'. Define x-axis, y-axis, and 4 quadrants before listing points.
14. CRITICAL FOR KANBAN: Use 'kanban' and organize strictly by columns.
15. CRITICAL FOR SANKEY: Use 'sankey-beta', format is 'Source, Target, Value'.
16. CRITICAL FOR TIMELINE/PIE/JOURNEY/BLOCK: Use exact syntax 'timeline', 'pie', 'journey', 'block-beta'.
17. CRITICAL FOR THEMING: NEVER generate 'style', 'classDef', 'linkStyle', or 'theme' directives unless the user explicitly requests a specific color. We apply unified dynamic CSS theming globally.

**CURRENT MERMAID CODE:**
${currentCode}

${contextContent ? `## Source Contexts\n${contextContent}` : ""}
${transcriptContent ? `## Source Transcripts\n${transcriptContent}` : ""}`;

      logger.info(`Starting diagram improvement for ${diagramId}`);

      const { textStream, usage } = await streamText({
        model: getConfiguredModel(),
        providerOptions: getFallbackProviderOptions(),
        system: systemPrompt,
        prompt: `Please apply this instruction to the diagram: ${instruction}`,
        temperature: 0.2,
        maxRetries: 3,
        //maxOutputTokens: 4000,
      });

      let fullMermaidCode = "";

      for await (const textPart of textStream) {
        fullMermaidCode += textPart;
        await prisma.diagram.update({
          where: { id: diagramId },
          data: { mermaidCode: this.cleanMermaidSyntax(fullMermaidCode) },
        });
      }

      logger.info(`[triggerImprovement] Stream fully consumed. Updating diagram status to DRAFT.`);
      await prisma.diagram.update({
        where: { id: diagramId },
        data: {
          mermaidCode: this.cleanMermaidSyntax(fullMermaidCode),
          status: "DRAFT",
        },
      });

      try {
        const usageData = await usage;
        await aiUsageService.logUsage({
          userId,
          workspaceId,
          feature: "DIAGRAM",
          provider: "openrouter",
          model: getConfiguredModel().modelId || "anthropic/claude-sonnet-4.6",
          inputTokens: usageData.inputTokens || 0,
          outputTokens: usageData.outputTokens || 0,
        });
      } catch (usageErr) {
        logger.error("Failed to log diagram improvement usage", usageErr);
      }

      logger.info(`Diagram improvement for ${diagramId} completed successfully.`);
    } catch (error) {
      logger.error(`[triggerImprovement] Diagram improvement failed for ${diagramId}`, error);
      await prisma.diagram
        .update({ where: { id: diagramId }, data: { status: "FAILED" } })
        .catch(() => {});
    }
  }

  private cleanMermaidSyntax(rawText: string): string {
    let cleaned = rawText.trim();

    // Attempt to extract the content explicitly out of any markdown backticks block
    // to bypass AI padding it with conversational sentences at the end
    const mermaidMatch = cleaned.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/im);
    if (mermaidMatch && mermaidMatch[1]) {
      return mermaidMatch[1].trim();
    }

    // Fallback if no full blocks are perfectly matched (e.g. streaming or no blocks)
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

  private buildPrompt(
    type: string,
    contextContent: string,
    transcriptContent: string,
    personaInstructions: string,
  ): string {
    let typeInstructions = `Your sole purpose is to output EXCLUSIVELY raw Mermaid syntax matching the requested diagram type: ${type}.`;
    if (type === "AUTO") {
      typeInstructions = `You must analyze the user's request and provided context to select the SINGLE MOST APPROPRIATE Mermaid.js diagram type. 
You can choose from: flowchart TD, sequenceDiagram, gantt, mindmap, classDiagram, erDiagram, xychart-beta, timeline, pie, quadrantChart, journey, kanban, sankey-beta, block-beta.
Your sole purpose is to output EXCLUSIVELY raw Mermaid syntax representing the optimal diagram format (fallback to Flowchart if unsure).`;
    }

    return `You are an expert Mermaid diagram architect.
${typeInstructions}
${personaInstructions}
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
- XYCHART: Use 'xychart-beta'. Include title, x-axis, y-axis, and bar/line elements.
- TIMELINE: Use 'timeline' followed by title and chronological events.
- PIE: Use 'pie title XYZ' and quotes for keys.
- QUADRANT: Use 'quadrantChart'. Define x-axis, y-axis, and 4 quadrants before listing points.
- JOURNEY: Use 'journey' to map user tasks over sections.
- KANBAN: Use 'kanban' and organize by 'Todo', 'In Progress', 'Done'.
- SANKEY: Use 'sankey-beta' to show flows (Source, Target, Value).
- BLOCK: Use 'block-beta' for topological abstract layouts.

Use the provided source material to accurately deduce relationships, dependencies, hierarchies, and timelines.

CRITICAL SYNTAX RULES:
1. NODE IDs: Node IDs MUST be strictly alphanumeric. NEVER use dots, slashes, hyphens, or spaces in Node IDs. (e.g. use \`NodeJS\` instead of \`Node.js\`).
2. NODE LABELS: ANY node label that contains spaces, parentheses "()", ampersands "&", hyphens "-", slashes "/", or ANY punctuation MUST be strictly enclosed in double quotes. Example: A["Menu (Client)"] instead of A[Menu (Client)]. NEVER use unescaped characters unless enclosed in double quotes.
3. SUBGRAPHS: Every \`subgraph\` block MUST be explicitly closed with an \`end\` keyword. Do NOT truncate the code or leave subgraphs unclosed.
4. FOR STATEDIAGRAMS: NEVER use double quotes directly in transition arrows. ALWAYS define an alias first using the 'state "Label" as ID' syntax, and then transition between IDs. Example: 'state "Homepage/Landing" as hPage \\n [*] --> hPage'.
5. FOR ER DIAGRAMS: Attribute types and names MUST be strictly alphanumeric words. NEVER use special characters like '?', '!', '[', ']', or '()' in types or field names. For example, use 'String email' instead of 'String? email', and 'StringArray tags' instead of 'String[] tags'.
6. FOR CLASS DIAGRAMS: Generic types MUST use tildes. Use 'List~String~' instead of 'List<String>'.
7. FOR MINDMAPS: You MUST rely on strict indentation. 
8. FOR GANTT CHARTS: Include 'dateFormat YYYY-MM-DD' and ensure dates match.
9. FOR XYCHART: Use 'xychart-beta'. x-axis array items must be enclosed in brackets (e.g. x-axis ["A", "B"]). Define data directly on 'bar' or 'line' (e.g., bar [10, 20]).
10. FOR THEMING: NEVER generate inline 'style', 'classDef', 'linkStyle', or 'theme' variables unless the user explicitly demands a specific color. The platform forces a unified dynamic theme via global CSS class overrides that you will break.

${contextContent ? `## Source Contexts\n${contextContent}` : ""}
${transcriptContent ? `## Source Transcripts\n${transcriptContent}` : ""}`;
  }
}

export const diagramGenerationService = new DiagramGenerationService();
