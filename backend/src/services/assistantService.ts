import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import EnvUtils from "../utils/EnvUtils";
import prisma from "../prisma/prismaClient";

export class AssistantChatService {
  private readonly openrouter = createOpenRouter({
    apiKey: EnvUtils.get("OPENROUTER_API_KEY"),
  });
  private readonly modelName = "google/gemini-2.0-flash-001";

  public async handleAssistantStream(messages: UIMessage[], userId: string) {
    try {
      const knowledgeBasePath = path.join(__dirname, "../knowledge/plan_ai_overview.md");
      let planAiKnowledge = "";
      try {
        planAiKnowledge = fs.readFileSync(knowledgeBasePath, "utf-8");
      } catch (e) {
        console.warn("[AssistantService] Could not read plan_ai_overview.md", e);
      }

      const systemPrompt = `You are Plan AI Assistant, a helpful AI integrated directly into the workspace via a Floating Action Button.
You help the user navigate the app, find information, manage the system, and execute quick actions.
You have access to tools to create entities and fetch data. If the user asks you to do something that a tool can handle, ALWAYS use the tool.
If the user asks a general question, answer concisely.
Do not invent URLs. Use the 'navigate' tool to send the user to pages.

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

      const model = this.openrouter(this.modelName);

      const result = streamText({
        model,
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
        tools: {
          navigate: {
            description: "Navigate the user to a specific page in the application.",
            inputSchema: z.object({
              path: z.string().describe("The local path to navigate to (e.g. '/', '/contexts')."),
            }),
            execute: async (args: { path: string }) => {
              return { success: true, navigatedTo: args.path };
            },
          },
          listProjects: {
            description: "List the user's current projects.",
            inputSchema: z.object({}),
            execute: async () => {
              const projects = await prisma.project.findMany({
                where: { userId },
                select: { id: true, title: true, status: true },
              });
              return {
                projects: projects.map((p) => ({
                  ...p,
                  url: `/projects/${p.id}`,
                })),
              };
            },
          },
          listTasks: {
            description: "List tasks assigned to the user or globally for a project.",
            inputSchema: z.object({
              projectId: z.string().optional().describe("Optional project ID to filter tasks by."),
            }),
            execute: async (args: { projectId?: string }) => {
              const tasks = await prisma.task.findMany({
                where: {
                  AND: [
                    { assigneeId: userId },
                    args.projectId ? { projectId: args.projectId } : {},
                  ],
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
          },
          listContexts: {
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
          },
          listDocuments: {
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
          },
          listFeatures: {
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
          },
          explainProject: {
            description:
              "Provide a detailed explanation of a specific project, including its tasks and transcripts.",
            inputSchema: z.object({
              projectId: z.string().describe("The ID of the project to look up."),
            }),
            execute: async (args: { projectId: string }) => {
              const project = await prisma.project.findUnique({
                where: { id: args.projectId, userId },
                include: {
                  tasks: { take: 10, select: { title: true, status: true, priority: true } },
                  transcripts: { take: 5, select: { title: true, source: true } },
                },
              });
              if (!project) return { error: "Project not found or unauthorized." };
              return { project };
            },
          },
          createProject: {
            description: "Create a new project.",
            inputSchema: z.object({
              title: z.string().describe("The name of the new project."),
              description: z.string().optional().describe("Optional description of the project."),
            }),
            execute: async (args: { title: string; description?: string }) => {
              const project = await prisma.project.create({
                data: {
                  userId,
                  title: args.title,
                  description: args.description,
                  status: "ACTIVE",
                },
              });
              return { success: true, project: { ...project, url: `/projects/${project.id}` } };
            },
          },
          createDocument: {
            description: "Create a new rich text document.",
            inputSchema: z.object({
              title: z.string().describe("The title of the document."),
              content: z.string().describe("The initial markdown or text content of the document."),
            }),
            execute: async (args: { title: string; content: string }) => {
              const doc = await prisma.docDocument.create({
                data: {
                  userId,
                  title: args.title,
                  content: args.content,
                  status: "DRAFT",
                },
              });
              return { success: true, document: { ...doc, url: `/docs/${doc.id}` } };
            },
          },
          createContext: {
            description: "Create a new Context Library (knowledge base) folder.",
            inputSchema: z.object({
              name: z.string().describe("The name of the new context library."),
              description: z.string().optional().describe("Optional description."),
            }),
            execute: async (args: { name: string; description?: string }) => {
              const context = await prisma.context.create({
                data: {
                  userId,
                  name: args.name,
                  description: args.description,
                },
              });
              return { success: true, context: { ...context, url: `/contexts/${context.id}` } };
            },
          },
          createDocTheme: {
            description: "Create a new Document styling Theme.",
            inputSchema: z.object({
              name: z.string().describe("The name of the theme."),
              primaryColor: z
                .string()
                .optional()
                .describe("A hex color code for the primary color (e.g. #FF5733)."),
            }),
            execute: async (args: { name: string; primaryColor?: string }) => {
              const theme = await prisma.docTheme.create({
                data: {
                  userId,
                  name: args.name,
                  primaryColor: args.primaryColor || "#4361EE",
                },
              });
              // Assume themes might not have their own isolated page yet, return basic success
              return { success: true, themeId: theme.id, themeName: theme.name };
            },
          },
        },
        onFinish: async ({ text, finishReason, usage }) => {
          console.log("[AssistantService] Stream finished!", { finishReason, usage });
          console.log("[AssistantService] Output text generated:", text);
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
