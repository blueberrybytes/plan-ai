import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TaskStatus } from "@prisma/client";
import prisma from "../prisma/prismaClient";

/**
 * Creates the Plan AI MCP server with all tools registered.
 * Auth context (userId + workspaceId) is closed over per-connection — no extra hacks needed.
 */
export function createPlanAiMcpServer(userId: string, workspaceId: string): McpServer {
  const server = new McpServer({
    name: "plan-ai",
    version: "1.0.0",
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
                  project: t.project
                    ? { id: t.project.id, title: t.project.title }
                    : null,
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
                transcript: transcript.transcript,
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
      description:
        "List tasks from your workspace, optionally filtered by status or project.",
      inputSchema: {
        projectId: z.string().optional().describe("Filter by project ID"),
        status: z
          .enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])
          .optional()
          .describe("Filter by task status"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe("Max number of tasks to return"),
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

  return server;
}
