import {
  getConfiguredModel,
  getFallbackProviderOptions,
  DEFAULT_AI_MODEL,
} from "../utils/aiModelUtils";
import { streamText, convertToModelMessages, UIMessage, stepCountIs, tool } from "ai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import prisma from "../prisma/prismaClient";
import { aiUsageService } from "./aiUsageService";
import { getPersonaInstructions } from "./personaService";

export class AssistantChatService {
  public async handleAssistantStream(
    messages: UIMessage[],
    userId: string,
    workspaceId: string,
    modelKey?: string,
  ) {
    try {
      let knowledgeBasePath = path.join(__dirname, "../knowledge/plan_ai_overview.md");
      if (!fs.existsSync(knowledgeBasePath)) {
        knowledgeBasePath = path.join(process.cwd(), "src/knowledge/plan_ai_overview.md");
      }
      let planAiKnowledge = "";
      try {
        planAiKnowledge = fs.readFileSync(knowledgeBasePath, "utf-8");
      } catch (e) {
        console.warn("[AssistantService] Could not read plan_ai_overview.md", e);
      }

      const personaInstructions = await getPersonaInstructions(userId, workspaceId);

      const systemPrompt = `You are Plan AI Assistant, a helpful AI integrated directly into the workspace via a Floating Action Button.
You help the user navigate the app, find information, manage the system, and execute quick actions.
You have access to tools to create entities and fetch data. If the user asks you to do something that a tool can handle, ALWAYS use the tool.
If the user asks a general question, answer concisely.
Do not invent URLs. Use the 'navigate' tool to send the user to pages.

${personaInstructions}

When returning lists of items (projects, contexts, tasks, docs), format them beautifully in markdown. ALWAYS include markdown hyperlinks so the user can click them (e.g. [Project Name](/projects/123) or [Task Title](/projects/123?task=456)).

When creating an item or telling the user how to create an item, enthusiastically provide the link back to the user formatted as a Markdown hyperlink.

Available Pages to Navigate To or Link To:
- Dashboard: /
- Context Library (documents/files): /contexts
- Create a Document: /docs/create
- Setup a new Document Theme: /docs/themes/create
- Create a Slide Presentation: /slides/create
- Setup a new Slide Theme: /slides/themes/create
- Projects Dashboard: /projects
- Integrations: /integrations
- Settings / Profile: /profile
- Plan AI Chat: /chat

---
Plan AI Knowledge Base Context:
${planAiKnowledge}

`;

      const selectedModel = modelKey && modelKey.length > 0 ? modelKey : DEFAULT_AI_MODEL;
      const result = streamText({
        model: getConfiguredModel(selectedModel),
        providerOptions: getFallbackProviderOptions(selectedModel),
        maxRetries: 3,
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
        tools: {
          navigate: tool({
            description: "Navigate the user to a specific page in the application.",
            inputSchema: z.object({
              path: z.string().describe("The local path to navigate to (e.g. '/', '/contexts')."),
            }),
            execute: async ({ path }) => {
              return { success: true, navigatedTo: path };
            },
          }),
          listProjects: tool({
            description: "List the user's current projects.",
            inputSchema: z.object({}),
            execute: async () => {
              const projects = await prisma.project.findMany({
                where: { workspaceId },
                select: { id: true, title: true, status: true },
              });
              return {
                projects: projects.map((p) => ({
                  ...p,
                  url: `/projects/${p.id}`,
                })),
              };
            },
          }),
          listTasks: tool({
            description: "List tasks assigned to the user or globally for a project.",
            inputSchema: z.object({
              projectId: z.string().optional().describe("Optional project ID to filter tasks by."),
            }),
            execute: async ({ projectId }) => {
              const tasks = await prisma.task.findMany({
                where: {
                  AND: [{ assigneeId: userId }, projectId ? { projectId: projectId } : {}],
                },
                select: { id: true, title: true, status: true, priority: true, projectId: true },
                take: 10,
                orderBy: { updatedAt: "desc" },
              });
              return {
                tasks: tasks.map((t) => ({
                  ...t,
                  url: `/projects/${t.projectId}?task=${t.id}`,
                })),
              };
            },
          }),
          listContexts: tool({
            description: "List the user's Context Library elements/folders.",
            inputSchema: z.object({}),
            execute: async () => {
              const contexts = await prisma.context.findMany({
                where: { userId },
                select: { id: true, name: true, description: true },
              });
              return {
                contexts: contexts.map((c) => ({
                  ...c,
                  url: `/contexts/${c.id}`,
                })),
              };
            },
          }),
          listDocuments: tool({
            description: "List the user's rich text documents.",
            inputSchema: z.object({}),
            execute: async () => {
              const documents = await prisma.docDocument.findMany({
                where: { userId },
                select: { id: true, title: true, status: true },
              });
              return {
                documents: documents.map((d) => ({
                  ...d,
                  url: `/docs/${d.id}`,
                })),
              };
            },
          }),
          listFeatures: tool({
            description: "Explain the features and capabilities of this application.",
            inputSchema: z.object({}),
            execute: async () => {
              console.log("listFeatures");
              return {
                features: [
                  "Projects: Group work, track status, and manage timelines.",
                  "Tasks: Individual units of work assigned within Projects (Kanban style).",
                  "Context Library: File/knowledge management nodes where users upload files to anchor AI reasoning.",
                  "Documents: Rich-text MDX enabled writing pads.",
                  "Slide Templates & Presentations: Generative presentation engines.",
                  "Integrations: Connect Jira or Linear via OAuth.",
                ],
              };
            },
          }),
          explainProject: tool({
            description:
              "Provide a detailed explanation of a specific project, including its tasks and transcripts.",
            inputSchema: z.object({
              projectId: z.string().describe("The ID of the project to look up."),
            }),
            execute: async ({ projectId }) => {
              const project = await prisma.project.findUnique({
                where: { id: projectId, userId },
                include: {
                  tasks: { take: 10, select: { title: true, status: true, priority: true } },
                  transcripts: { take: 5, select: { title: true, source: true } },
                },
              });
              if (!project) return { error: "Project not found or unauthorized." };
              return { project };
            },
          }),
          createProject: tool({
            description: "Create a new project.",
            inputSchema: z.object({
              title: z.string().describe("The name of the new project."),
              description: z.string().optional().describe("Optional description of the project."),
            }),
            execute: async ({ title, description }) => {
              const project = await prisma.project.create({
                data: {
                  userId,
                  workspaceId,
                  title: title,
                  description: description,
                  status: "ACTIVE",
                },
              });
              return { success: true, project: { ...project, url: `/projects/${project.id}` } };
            },
          }),
          createDocument: tool({
            description: "Create a new rich text document.",
            inputSchema: z.object({
              title: z.string().describe("The title of the document."),
              content: z.string().describe("The initial markdown or text content of the document."),
            }),
            execute: async ({ title, content }) => {
              const doc = await prisma.docDocument.create({
                data: {
                  userId,
                  workspaceId,
                  title: title,
                  content: content,
                  status: "DRAFT",
                },
              });
              return { success: true, document: { ...doc, url: `/docs/${doc.id}` } };
            },
          }),
          createContext: tool({
            description: "Create a new Context Library (knowledge base) folder.",
            inputSchema: z.object({
              name: z.string().describe("The name of the new context library."),
              description: z.string().optional().describe("Optional description."),
            }),
            execute: async ({ name, description }) => {
              const context = await prisma.context.create({
                data: {
                  userId,
                  workspaceId,
                  name: name,
                  description: description,
                },
              });
              return { success: true, context: { ...context, url: `/contexts/${context.id}` } };
            },
          }),
          listRecordings: tool({
            description: "List the user's recent meeting transcripts and audio recordings.",
            inputSchema: z.object({}),
            execute: async () => {
              const transcripts = await prisma.transcript.findMany({
                where: { userId, workspaceId },
                select: { id: true, title: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 10,
              });
              return {
                transcripts: transcripts.map((t) => ({
                  id: t.id,
                  title: t.title,
                  createdAt: t.createdAt.toISOString(),
                })),
              };
            },
          }),
          requestDocumentGeneration: tool({
            description:
              "CRITICAL: When the user asks you to GENERATE A REPORT or CREATE A DOCUMENT, DO NOT use createDocument directly! You MUST use this tool instead. This tool requires 'purpose' and 'recordingId'. If 'recordingId' or 'contextId' are missing but the user provides a conversational hint (e.g. 'last recording', 'the latest one', or a context name), you MUST use the listRecordings and listContexts tools to look up those IDs automatically for the user FIRST before calling this. Only ask the user for clarification if you absolutely cannot guess the ID after looking at the listed tools. Calling this tool yields a UI Card to the user for them to confirm.",
            inputSchema: z.object({
              purpose: z
                .string()
                .describe("The explicit goal or purpose of the document (e.g. 'Weekly Update')."),
              recordingId: z.string().describe("The ID of the recording/transcript to use."),
              recordingName: z
                .string()
                .optional()
                .describe("The user-friendly title of the recording"),
              contextId: z
                .string()
                .optional()
                .describe("An optional Context Library ID to use as a knowledge base reference."),
              contextName: z.string().optional().describe("The user-friendly title of the context"),
            }),
            execute: async ({ purpose, recordingId, recordingName, contextId, contextName }) => {
              // Instead of executing code, we deliberately yield a parseable Markdown string back to the stream!
              return {
                yieldHtml: `[UI:CONFIRM_DOC purpose="${purpose}" recordingId="${recordingId}" recordingName="${recordingName || recordingId}" contextId="${contextId || ""}" contextName="${contextName || contextId || ""}"]`,
              };
            },
          }),
          requestTaskCreation: tool({
            description:
              "CRITICAL: When the user asks you to CREATE A TASK, TICKET, OR ISSUE, you MUST use this tool. This tool requires 'title', 'description', and 'projectId'. If 'projectId' is missing but the user provides a project name or conversational hint, use the listProjects tool to look it up FIRST before calling this. If the user has no projects, tell them they need a project or offer to create one using createProject. Calling this tool yields a UI Card to the user for them to confirm.",
            inputSchema: z.object({
              title: z.string().describe("The title of the task or ticket."),
              description: z.string().describe("A detailed description of what needs to be done."),
              projectId: z.string().describe("The ID of the project this task belongs to."),
              projectName: z.string().optional().describe("The user-friendly name of the project"),
            }),
            execute: async ({ title, description, projectId, projectName }) => {
              // Yield a parseable Markdown string back to the stream for the UI to render a confirmation card
              return {
                yieldHtml: `[UI:CONFIRM_TASK title="${title}" description="${description}" projectId="${projectId}" projectName="${projectName || projectId}"]`,
              };
            },
          }),
          createBrandTheme: tool({
            description: "Create a new Brand Theme.",
            inputSchema: z.object({
              name: z.string().describe("The name of the theme."),
              primaryColor: z
                .string()
                .optional()
                .describe("A hex color code for the primary color (e.g. #FF5733)."),
            }),
            execute: async ({ name, primaryColor }) => {
              const theme = await prisma.brandTheme.create({
                data: {
                  userId,
                  workspaceId,
                  name: name,
                  primaryColor: primaryColor || "#4361EE",
                },
              });
              return { success: true, themeId: theme.id, themeName: theme.name };
            },
          }),
        },
        onFinish: async ({ text, finishReason, usage }) => {
          console.log("[AssistantService] Stream finished!", { finishReason, usage });
          console.log("[AssistantService] Output text generated:", text);
          if (usage) {
            aiUsageService
              .logUsage({
                userId,
                workspaceId,
                feature: "CHAT",
                provider: "openrouter",
                model: selectedModel,
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
              })
              .catch(() => {});
          }
        },
        onError: (error) => {
          console.error("[AssistantService] Stream error occurred:", error);
        },
      });

      return result;
    } catch (error) {
      console.error("[AssistantService] Error in handleAssistantStream:", error);
      throw error;
    }
  }
}

export const assistantChatService = new AssistantChatService();
