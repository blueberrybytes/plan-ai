import { generateText, stepCountIs, Output } from "ai";
import { z } from "zod";
import { aiUsageService } from "./aiUsageService";
import { mcpClientService } from "./mcpClientService";
import {
  getConfiguredModel,
  getFallbackProviderOptions,
  DEFAULT_AI_MODEL,
} from "../utils/aiModelUtils";
// `.nullable()` (not `.optional()`): OpenAI/Azure strict structured-output mode
// requires every property to appear in `required`. `.optional()` omits the field
// from `required` and those providers reject the schema with a 400. The portable
// pattern for an "optional" field is required-but-nullable; we coerce the null
// back to undefined when building the result below.
const TaskCoachRefinementSchema = z.object({
  refinedTitle: z.string().describe("A concise, actionable title for the task."),
  structuredDescription: z
    .string()
    .describe(
      "A detailed description formatted according to the task type template (e.g., 'As a [user], I want [action] so that [value]' for STORY; 'Steps to reproduce, Expected, Actual' for BUG; clear summary for TASK).",
    ),
  acceptanceCriteria: z
    .string()
    .nullable()
    .describe("Clear, testable acceptance criteria as a bulleted list."),
  storyPoints: z
    .number()
    .nullable()
    .describe("Suggested agile story points (e.g. 1, 2, 3, 5, 8) based on inferred complexity."),
  estimatedMinutes: z
    .number()
    .nullable()
    .describe("Suggested estimated time in minutes if story points aren't appropriate."),
});

export interface RefineTaskInput {
  title: string;
  summary?: string | null;
  description?: string | null;
  acceptanceCriteria?: string | null;
  type: string;
  priority: string;
  workspaceId: string;
  userId: string;
}

export interface RefineTaskOutput {
  refinedTitle: string;
  structuredDescription: string;
  acceptanceCriteria?: string;
  storyPoints?: number;
  estimatedMinutes?: number;
}

export class AiTaskCoachService {
  public async refineTask(input: RefineTaskInput): Promise<RefineTaskOutput> {
    // Default fast, capable model
    const defaultModel = DEFAULT_AI_MODEL;
    const model = getConfiguredModel(defaultModel);
    const providerOptions = getFallbackProviderOptions(defaultModel);

    // Step 1: Optional Agentic Investigation via MCP
    const tools = mcpClientService.getAiTools();
    let investigationContext = "";
    if (tools) {
      try {
        const investigation = await generateText({
          model,
          providerOptions,
          tools,
          stopWhen: stepCountIs(3),
          system:
            "You are an AI Software Architect. The user is refining an Agile task ticket. IF the ticket is a simple, non-technical business or life task, DO NOT query the codebase. Simply return 'No codebase context needed.' OTHERWISE, use your tools to query the codebase knowledge graph and gather relevant structural context (e.g. affected files, existing implementations). Summarize your findings so the task refiner can write highly accurate, technically specific acceptance criteria.",
          prompt: `Task:\nTitle: ${input.title}\nSummary: ${input.summary || "None"}\nDescription: ${input.description || "None"}\n\nPlease investigate the codebase ONLY IF this is a technical software task to gather any missing structural context.`,
        });

        if (investigation.text) {
          investigationContext = `\n\n### Codebase Investigation Context:\n${investigation.text}`;
        }

        if (investigation.totalUsage) {
          await aiUsageService.logUsage({
            userId: input.userId,
            workspaceId: input.workspaceId,
            feature: "TASK_EXTRACTION",
            provider: "openrouter",
            model: defaultModel,
            inputTokens: investigation.totalUsage.inputTokens || 0,
            outputTokens: investigation.totalUsage.outputTokens || 0,
          });
        }
      } catch (err) {
        console.error("Failed during MCP agentic investigation step for task refinement", err);
      }
    }

    const systemPrompt = `You are an elite agile project manager and technical writer. Your goal is to refine raw task input into a perfectly structured, actionable ticket.
Strictly adhere to the following templates based on the task type:
- STORY: Use the "As a [user], I want [action] so that [value]" framework.
- BUG: Use the "Steps to reproduce", "Expected behavior", and "Actual behavior" format.
- TASK/EPIC: Provide a clear, structured summary and objective.

Additionally, infer and provide testable acceptance criteria if not already present or if they can be improved.
Estimate the complexity using storyPoints (Fibonacci: 1, 2, 3, 5, 8) or estimatedMinutes.`;

    const userPrompt = `Please refine the following task:
Type: ${input.type}
Priority: ${input.priority}
Title: ${input.title}
Summary/Note: ${input.summary || "None provided"}
Current Description: ${input.description || "None provided"}
Current Acceptance Criteria: ${input.acceptanceCriteria || "None provided"}
${investigationContext}

Generate the refined version strictly following the instructed template.`;

    const response = await generateText({
      model,
      providerOptions,
      output: Output.object({
        name: "TaskCoachRefinement",
        description: "Refines a raw task into a perfectly structured, actionable ticket based on its type.",
        schema: TaskCoachRefinementSchema,
      }),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2, // Low temp for more deterministic formatting
    });

    // Schema fields are `.nullable()` for strict-mode compatibility — coerce the
    // resulting nulls back to undefined to match RefineTaskOutput's optionals.
    const raw = response.output;
    const result: RefineTaskOutput = {
      refinedTitle: raw.refinedTitle,
      structuredDescription: raw.structuredDescription,
      acceptanceCriteria: raw.acceptanceCriteria ?? undefined,
      storyPoints: raw.storyPoints ?? undefined,
      estimatedMinutes: raw.estimatedMinutes ?? undefined,
    };

    if (response.totalUsage) {
      await aiUsageService.logUsage({
        userId: input.userId,
        workspaceId: input.workspaceId,
        provider: "OPENROUTER",
        model: defaultModel,
        inputTokens: response.totalUsage.inputTokens || 0,
        outputTokens: response.totalUsage.outputTokens || 0,
        feature: "TASK_EXTRACTION",
      });
    }

    return result;
  }
}

export const aiTaskCoachService = new AiTaskCoachService();
