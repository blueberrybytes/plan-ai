import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TaskStatus, TaskPriority, TaskType } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { taskCrudService } from "../services/taskCrudService";
import { queryContexts } from "../vector/contextFileVectorService";
import { mergeProjectAndContextIds } from "../services/projectContextResolver";
import { docGenerationService } from "../services/docGenerationService";

// Enum value tuples shared by the task tools (kept in sync with schema.prisma).
const TASK_STATUSES = ["BACKLOG", "IN_PROGRESS", "BLOCKED", "COMPLETED", "ARCHIVED"] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const TASK_TYPES = ["TASK", "BUG", "STORY", "EPIC"] as const;

/**
 * Creates the Plan AI MCP server with all tools registered.
 * Auth context (userId + workspaceId) is closed over per-connection — no extra hacks needed.
 */
export function createPlanAiMcpServer(userId: string, workspaceId: string): McpServer {
  const server = new McpServer({
    name: "plan-ai",
    version: "1.0.0",
  });

  // ─── Response helpers ────────────────────────────────────────────────────
  const jsonResult = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });
  const errorResult = (message: string) => ({
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  });

  // ─── get_recent_meetings ─────────────────────────────────────────────────

  server.registerTool(
    "get_recent_meetings",
    {
      description: "List the most recent meetings/transcripts in your workspace.",
      inputSchema: {
        limit: z.number().min(1).max(50).default(10).describe("Max number of meetings to return"),
        projectId: z.string().optional().describe("Filter by project ID"),
      },
    },
    async (args) => {
      const transcripts = await prisma.transcript.findMany({
        where: {
          workspaceId,
          ...(args.projectId ? { projectId: args.projectId } : {}),
        },
        select: {
          id: true,
          title: true,
          summary: true,
          recordedAt: true,
          createdAt: true,
          durationSeconds: true,
          source: true,
          project: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                meetings: transcripts.map((t) => ({
                  id: t.id,
                  title: t.title || "Untitled Meeting",
                  summary: t.summary ? t.summary.substring(0, 300) : null,
                  recordedAt: t.recordedAt ?? t.createdAt,
                  durationSeconds: t.durationSeconds,
                  source: t.source,
                  project: t.project ? { id: t.project.id, title: t.project.title } : null,
                })),
                total: transcripts.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ─── get_meeting_detail ──────────────────────────────────────────────────

  server.registerTool(
    "get_meeting_detail",
    {
      description:
        "Get the full transcript text, summary, and metadata for a specific meeting by its ID.",
      inputSchema: {
        meetingId: z.string().describe("The transcript/meeting ID"),
        transcriptOffset: z
          .number()
          .min(0)
          .default(0)
          .describe(
            "Character offset to start the transcript slice from (for paging long meetings)",
          ),
        transcriptMaxChars: z
          .number()
          .min(500)
          .max(100000)
          .default(12000)
          .describe("Max characters of transcript text to return"),
      },
    },
    async (args) => {
      const transcript = await prisma.transcript.findFirst({
        where: { id: args.meetingId, workspaceId },
        include: {
          project: { select: { id: true, title: true } },
          taskLinks: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  assignee: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      });

      if (!transcript) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Meeting with ID "${args.meetingId}" not found in this workspace.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: transcript.id,
                title: transcript.title || "Untitled Meeting",
                recordedAt: transcript.recordedAt ?? transcript.createdAt,
                durationSeconds: transcript.durationSeconds,
                source: transcript.source,
                summary: transcript.summary,
                transcript: (transcript.transcript ?? "").slice(
                  args.transcriptOffset,
                  args.transcriptOffset + args.transcriptMaxChars,
                ),
                transcriptMeta: {
                  totalChars: (transcript.transcript ?? "").length,
                  offset: args.transcriptOffset,
                  truncated:
                    args.transcriptOffset + args.transcriptMaxChars <
                    (transcript.transcript ?? "").length,
                },
                project: transcript.project,
                tasks: transcript.taskLinks.map((l) => l.task),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ─── search_meetings ─────────────────────────────────────────────────────

  server.registerTool(
    "search_meetings",
    {
      description:
        "Search across all meeting transcripts using a keyword or phrase. Returns meetings whose title, summary, or transcript content match the query.",
      inputSchema: {
        query: z.string().describe("Search term or phrase"),
        limit: z.number().min(1).max(20).default(5).describe("Max results to return"),
      },
    },
    async (args) => {
      const transcripts = await prisma.transcript.findMany({
        where: {
          workspaceId,
          OR: [
            { title: { contains: args.query, mode: "insensitive" } },
            { summary: { contains: args.query, mode: "insensitive" } },
            { transcript: { contains: args.query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          summary: true,
          recordedAt: true,
          createdAt: true,
          project: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: args.query,
                results: transcripts.map((t) => ({
                  id: t.id,
                  title: t.title || "Untitled Meeting",
                  summary: t.summary?.substring(0, 400),
                  recordedAt: t.recordedAt ?? t.createdAt,
                  project: t.project,
                })),
                total: transcripts.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ─── get_projects ────────────────────────────────────────────────────────

  server.registerTool(
    "get_projects",
    {
      description: "List all projects in your workspace.",
      inputSchema: {},
    },
    async () => {
      const projects = await prisma.project.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          _count: { select: { transcripts: true, tasks: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                projects: projects.map((p) => ({
                  id: p.id,
                  title: p.title,
                  description: p.description,
                  status: p.status,
                  createdAt: p.createdAt,
                  meetingCount: p._count.transcripts,
                  taskCount: p._count.tasks,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ─── get_tasks ───────────────────────────────────────────────────────────

  server.registerTool(
    "get_tasks",
    {
      description: "List tasks from your workspace, optionally filtered by status or project.",
      inputSchema: {
        projectId: z.string().optional().describe("Filter by project ID"),
        status: z.enum(TASK_STATUSES).optional().describe("Filter by task status"),
        limit: z.number().min(1).max(100).default(20).describe("Max number of tasks to return"),
      },
    },
    async (args) => {
      const tasks = await prisma.task.findMany({
        where: {
          project: { workspaceId },
          ...(args.projectId ? { projectId: args.projectId } : {}),
          ...(args.status ? { status: args.status as TaskStatus } : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueDate: true,
          createdAt: true,
          assignee: { select: { name: true, email: true } },
          project: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ tasks, total: tasks.length }, null, 2),
          },
        ],
      };
    },
  );

  // ─── search_tasks ────────────────────────────────────────────────────────

  server.registerTool(
    "search_tasks",
    {
      description: "Search tasks by keyword across title and description.",
      inputSchema: {
        query: z.string().describe("Search term"),
        limit: z.number().min(1).max(50).default(10).describe("Max results"),
      },
    },
    async (args) => {
      const tasks = await prisma.task.findMany({
        where: {
          project: { workspaceId },
          OR: [
            { title: { contains: args.query, mode: "insensitive" } },
            { description: { contains: args.query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          assignee: { select: { name: true, email: true } },
          project: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ query: args.query, tasks, total: tasks.length }, null, 2),
          },
        ],
      };
    },
  );

  // ─── get_task_detail ─────────────────────────────────────────────────────

  server.registerTool(
    "get_task_detail",
    {
      description:
        "Get full detail for a single task: description, acceptance criteria, status, priority, assignee, parent task and subtasks.",
      inputSchema: { taskId: z.string().describe("The task ID") },
    },
    async (args) => {
      const task = await prisma.task.findFirst({
        where: { id: args.taskId, project: { workspaceId } },
        include: {
          assignee: { select: { name: true, email: true } },
          project: { select: { id: true, title: true } },
          parent: { select: { id: true, title: true, status: true } },
          subtasks: { select: { id: true, title: true, status: true } },
        },
      });
      if (!task) return errorResult(`Task "${args.taskId}" not found in this workspace.`);
      return jsonResult(task);
    },
  );

  // ─── get_project_detail ──────────────────────────────────────────────────

  server.registerTool(
    "get_project_detail",
    {
      description:
        "Get a single project's detail: description, status, task breakdown by status, and its most recent meetings.",
      inputSchema: { projectId: z.string().describe("The project ID") },
    },
    async (args) => {
      const project = await prisma.project.findFirst({
        where: { id: args.projectId, workspaceId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          _count: { select: { transcripts: true, tasks: true } },
        },
      });
      if (!project) return errorResult(`Project "${args.projectId}" not found in this workspace.`);

      const byStatus = await prisma.task.groupBy({
        by: ["status"],
        where: { projectId: args.projectId },
        _count: { _all: true },
      });
      const recentMeetings = await prisma.transcript.findMany({
        where: { projectId: args.projectId },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      return jsonResult({
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          status: project.status,
          createdAt: project.createdAt,
          meetingCount: project._count.transcripts,
          taskCount: project._count.tasks,
        },
        tasksByStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
        recentMeetings,
      });
    },
  );

  // ─── list_workspace_members ──────────────────────────────────────────────

  server.registerTool(
    "list_workspace_members",
    {
      description:
        "List the members of your workspace (name, email, role) — useful when deciding who to assign work to.",
      inputSchema: {},
    },
    async () => {
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return jsonResult({
        members: members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        })),
      });
    },
  );

  // ─── create_task ─────────────────────────────────────────────────────────

  server.registerTool(
    "create_task",
    {
      description:
        "Create a new task in a project — turn a discussion point or action item into a tracked task. Returns the created task.",
      inputSchema: {
        projectId: z.string().describe("Project the task belongs to"),
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Full task description (markdown)"),
        acceptanceCriteria: z.string().optional().describe("Acceptance criteria (markdown)"),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        type: z.enum(TASK_TYPES).optional(),
        dueDate: z.string().optional().describe("Due date as an ISO 8601 string"),
      },
    },
    async (args) => {
      try {
        const task = await taskCrudService.createTaskForWorkspace(workspaceId, {
          projectId: args.projectId,
          title: args.title,
          description: args.description,
          acceptanceCriteria: args.acceptanceCriteria,
          status: args.status as TaskStatus | undefined,
          priority: args.priority as TaskPriority | undefined,
          type: args.type as TaskType | undefined,
          dueDate: args.dueDate ? new Date(args.dueDate) : undefined,
        });
        return jsonResult({ created: true, task });
      } catch (e) {
        return errorResult(`Failed to create task: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  // ─── update_task ─────────────────────────────────────────────────────────

  server.registerTool(
    "update_task",
    {
      description:
        "Update an existing task — change status, priority, title, description, acceptance criteria, type or due date. Only the fields you pass are changed. Returns the updated task.",
      inputSchema: {
        taskId: z.string().describe("The task ID"),
        title: z.string().optional(),
        description: z.string().optional(),
        acceptanceCriteria: z.string().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        type: z.enum(TASK_TYPES).optional(),
        dueDate: z
          .string()
          .nullable()
          .optional()
          .describe("Due date as an ISO 8601 string, or null to clear it"),
      },
    },
    async (args) => {
      try {
        const task = await taskCrudService.updateTaskForWorkspace(workspaceId, args.taskId, {
          title: args.title,
          description: args.description,
          acceptanceCriteria: args.acceptanceCriteria,
          status: args.status as TaskStatus | undefined,
          priority: args.priority as TaskPriority | undefined,
          type: args.type as TaskType | undefined,
          dueDate:
            typeof args.dueDate === "undefined"
              ? undefined
              : args.dueDate
                ? new Date(args.dueDate)
                : null,
        });
        return jsonResult({ updated: true, task });
      } catch (e) {
        return errorResult(`Failed to update task: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  // ─── semantic_search ─────────────────────────────────────────────────────

  server.registerTool(
    "semantic_search",
    {
      description:
        "Semantic (meaning-based) search over a project's knowledge base / context files using embeddings. Use this for conceptual queries where keyword search would miss synonyms or paraphrases.",
      inputSchema: {
        projectId: z.string().describe("Project whose knowledge base to search"),
        query: z.string().describe("Natural-language query"),
        limit: z.number().min(1).max(20).default(8).describe("Max chunks to return"),
      },
    },
    async (args) => {
      const contextIds = await mergeProjectAndContextIds([args.projectId], null);
      if (contextIds.length === 0) {
        return jsonResult({
          query: args.query,
          results: [],
          note: "This project has no knowledge base / context files to search.",
        });
      }
      const chunks = await queryContexts(contextIds, args.query, args.limit);
      return jsonResult({ query: args.query, results: chunks, total: chunks.length });
    },
  );

  // ─── generate_document ───────────────────────────────────────────────────

  server.registerTool(
    "generate_document",
    {
      description:
        "Kick off AI generation of a Markdown document from a prompt, optionally grounded in a project's context and specific meetings. Generation runs in the background; returns the new document's id and status.",
      inputSchema: {
        title: z.string().describe("Document title"),
        prompt: z.string().describe("What the document should cover"),
        projectId: z.string().optional().describe("Ground the doc in this project's context"),
        transcriptIds: z
          .array(z.string())
          .optional()
          .describe("Specific meeting IDs to ground the doc in"),
      },
    },
    async (args) => {
      try {
        const doc = await docGenerationService.startGeneration(userId, workspaceId, {
          title: args.title,
          prompt: args.prompt,
          projectId: args.projectId,
          projectIds: args.projectId ? [args.projectId] : undefined,
          transcriptIds: args.transcriptIds,
        });
        return jsonResult({
          started: true,
          documentId: doc.id,
          status: doc.status,
          message: "Document is generating in the background.",
        });
      } catch (e) {
        return errorResult(
          `Failed to start document generation: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

  return server;
}
