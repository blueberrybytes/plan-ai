/**
 * The OpenAPI description of the public API (routes/publicApiRouter.ts),
 * written by hand and served at GET /api/v1/openapi.json. Keep it in step
 * with the router: publicApiRouter.spec.ts fails when a route is missing here.
 */

const TASK_STATUSES = ["BACKLOG", "IN_PROGRESS", "BLOCKED", "COMPLETED", "ARCHIVED"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TASK_TYPES = ["TASK", "BUG", "STORY", "EPIC"];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Record<string, unknown>) => ({ ...schema, nullable: true });
const str = { type: "string" };
const date = { type: "string", format: "date-time" };
const int = { type: "integer" };

const json = (schema: Record<string, unknown>) => ({
  content: { "application/json": { schema } },
});

const errorResponse = (description: string) => ({ description, ...json(ref("Error")) });

const COMMON_ERRORS = {
  "401": errorResponse("The token is missing, wrong or revoked."),
  "429": errorResponse("Too many requests."),
};

const listOf = (name: string) => ({
  type: "object",
  required: ["data", "nextCursor"],
  properties: {
    data: { type: "array", items: ref(name) },
    nextCursor: nullable({
      ...str,
      description: "Pass it back as `cursor` to get the next page. Null on the last page.",
    }),
  },
});

const idParam = (what: string) => ({
  name: "id",
  in: "path",
  required: true,
  description: `Id of the ${what}.`,
  schema: str,
});

const limitParam = {
  name: "limit",
  in: "query",
  description: "Rows per page, 1 to 100. Default 25.",
  schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
};

const cursorParam = {
  name: "cursor",
  in: "query",
  description: "The `nextCursor` of the previous page.",
  schema: str,
};

const projectRef = {
  type: "object",
  required: ["id", "title"],
  properties: { id: str, title: str },
};

const taskWriteFields = {
  title: { type: "string", minLength: 1, maxLength: 500 },
  description: nullable({ type: "string", maxLength: 20000 }),
  acceptanceCriteria: nullable({ type: "string", maxLength: 20000 }),
  status: { type: "string", enum: TASK_STATUSES },
  priority: { type: "string", enum: TASK_PRIORITIES },
  type: { type: "string", enum: TASK_TYPES },
  dueDate: nullable(date),
  assigneeEmail: nullable({
    type: "string",
    format: "email",
    description: "Email of a member of the workspace. Null leaves the task with nobody.",
  }),
};

const taskProperties = {
  id: str,
  title: str,
  description: nullable(str),
  acceptanceCriteria: nullable(str),
  status: { type: "string", enum: TASK_STATUSES },
  priority: { type: "string", enum: TASK_PRIORITIES },
  type: { type: "string", enum: TASK_TYPES },
  dueDate: nullable(date),
  completedAt: nullable(date),
  assignee: nullable({
    type: "object",
    properties: { id: str, name: nullable(str), email: str },
  }),
  project: projectRef,
  parentId: nullable(str),
  url: nullable({ ...str, description: "Link to the task in the web app." }),
  createdAt: date,
  updatedAt: date,
};

const meetingProperties = {
  id: str,
  title: nullable(str),
  status: {
    type: "string",
    enum: ["processing", "ready", "failed"],
    description: "The summary and tasks are there once it is `ready`.",
  },
  summary: nullable(str),
  durationSeconds: nullable(int),
  speakerCount: nullable(int),
  language: nullable(str),
  source: { type: "string", enum: ["MANUAL", "RECORDING", "UPLOAD", "IMPORTED", "TELEGRAM"] },
  project: nullable(projectRef),
  url: nullable({ ...str, description: "Link to the meeting in the web app." }),
  recordedAt: nullable(date),
  createdAt: date,
  updatedAt: date,
};

export const publicApiOpenApi = {
  openapi: "3.0.3",
  info: {
    title: "Plan AI API",
    version: "1.0.0",
    description:
      "Read projects, meetings and tasks of a workspace, and create or change tasks. " +
      "Authenticate with a personal token (the same tokens the MCP server uses). " +
      "A token sees what its user sees. The API does not give audio or files.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerToken: [] }],
  paths: {
    "/openapi.json": {
      get: {
        summary: "This description",
        security: [],
        responses: { "200": { description: "The OpenAPI document.", ...json({ type: "object" }) } },
      },
    },
    "/me": {
      get: {
        summary: "Who the token is",
        responses: {
          "200": { description: "The user and the workspace.", ...json(ref("Me")) },
          ...COMMON_ERRORS,
        },
      },
    },
    "/projects": {
      get: {
        summary: "List projects",
        description: "Newest first.",
        parameters: [limitParam, cursorParam],
        responses: {
          "200": { description: "A page of projects.", ...json(listOf("Project")) },
          "400": errorResponse("A parameter is not valid."),
          ...COMMON_ERRORS,
        },
      },
    },
    "/projects/{id}": {
      get: {
        summary: "Get a project",
        parameters: [idParam("project")],
        responses: {
          "200": { description: "The project.", ...json(ref("Project")) },
          "404": errorResponse("No such project in this workspace."),
          ...COMMON_ERRORS,
        },
      },
    },
    "/meetings": {
      get: {
        summary: "List meetings",
        description: "Newest first. The list has no transcript text.",
        parameters: [
          { name: "projectId", in: "query", description: "Only this project.", schema: str },
          {
            name: "since",
            in: "query",
            description: "Only meetings created at or after this date (ISO 8601).",
            schema: date,
          },
          limitParam,
          cursorParam,
        ],
        responses: {
          "200": { description: "A page of meetings.", ...json(listOf("Meeting")) },
          "400": errorResponse("A parameter is not valid."),
          ...COMMON_ERRORS,
        },
      },
    },
    "/meetings/{id}": {
      get: {
        summary: "Get a meeting",
        description:
          "The meeting with its speakers, its tasks and the transcript. " +
          "Each read is written to the workspace audit log.",
        parameters: [idParam("meeting")],
        responses: {
          "200": { description: "The meeting.", ...json(ref("MeetingDetail")) },
          "404": errorResponse("No such meeting in this workspace."),
          ...COMMON_ERRORS,
        },
      },
    },
    "/tasks": {
      get: {
        summary: "List tasks",
        description: "Newest first.",
        parameters: [
          { name: "projectId", in: "query", description: "Only this project.", schema: str },
          {
            name: "status",
            in: "query",
            description: "Only this status.",
            schema: { type: "string", enum: TASK_STATUSES },
          },
          {
            name: "assignee",
            in: "query",
            description: "Only tasks assigned to the member with this email.",
            schema: str,
          },
          {
            name: "updatedSince",
            in: "query",
            description: "Only tasks changed at or after this date (ISO 8601).",
            schema: date,
          },
          limitParam,
          cursorParam,
        ],
        responses: {
          "200": { description: "A page of tasks.", ...json(listOf("Task")) },
          "400": errorResponse("A parameter is not valid."),
          ...COMMON_ERRORS,
        },
      },
      post: {
        summary: "Create a task",
        requestBody: { required: true, ...json(ref("TaskCreate")) },
        responses: {
          "201": { description: "The new task.", ...json(ref("TaskDetail")) },
          "400": errorResponse("The body is not valid."),
          "404": errorResponse("No such project in this workspace."),
          ...COMMON_ERRORS,
        },
      },
    },
    "/tasks/{id}": {
      get: {
        summary: "Get a task",
        parameters: [idParam("task")],
        responses: {
          "200": { description: "The task.", ...json(ref("TaskDetail")) },
          "404": errorResponse("No such task in this workspace."),
          ...COMMON_ERRORS,
        },
      },
      patch: {
        summary: "Change a task",
        description: "Only the fields in the body change.",
        parameters: [idParam("task")],
        requestBody: { required: true, ...json(ref("TaskUpdate")) },
        responses: {
          "200": { description: "The task after the change.", ...json(ref("TaskDetail")) },
          "400": errorResponse("The body is not valid."),
          "404": errorResponse("No such task in this workspace."),
          ...COMMON_ERRORS,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerToken: {
        type: "http",
        scheme: "bearer",
        description: "A personal token, created in Integrations, Plan AI MCP.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "unauthorized",
                  "forbidden",
                  "not_found",
                  "invalid_request",
                  "conflict",
                  "rate_limited",
                  "internal_error",
                ],
              },
              message: str,
            },
          },
        },
      },
      Me: {
        type: "object",
        properties: {
          user: { type: "object", properties: { id: str, email: str, name: nullable(str) } },
          workspace: { type: "object", properties: { id: str, name: str } },
          role: nullable({ type: "string", enum: ["OWNER", "ADMIN", "MEMBER"] }),
        },
      },
      Project: {
        type: "object",
        properties: {
          id: str,
          title: str,
          description: nullable(str),
          status: { type: "string", enum: ["ACTIVE", "COMPLETED", "ARCHIVED"] },
          visibility: { type: "string", enum: ["WORKSPACE", "RESTRICTED"] },
          meetingCount: int,
          taskCount: int,
          url: nullable({ ...str, description: "Link to the project in the web app." }),
          createdAt: date,
          updatedAt: date,
        },
      },
      Meeting: { type: "object", properties: meetingProperties },
      MeetingDetail: {
        type: "object",
        properties: {
          ...meetingProperties,
          speakers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { ...str, description: "The speaker label used in the utterances." },
                name: nullable(str),
                role: nullable(str),
                speakingTimeSeconds: nullable({ type: "number" }),
                utteranceCount: nullable(int),
              },
            },
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: str,
                title: str,
                status: { type: "string", enum: TASK_STATUSES },
                priority: { type: "string", enum: TASK_PRIORITIES },
                assigneeEmail: nullable(str),
              },
            },
          },
          transcript: {
            type: "object",
            properties: {
              text: nullable({
                ...str,
                description: "The whole text. A meeting saved as text has no utterances.",
              }),
              utterances: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    speaker: nullable(str),
                    start: nullable({ type: "number", description: "Seconds." }),
                    end: nullable({ type: "number", description: "Seconds." }),
                    text: str,
                  },
                },
              },
            },
          },
        },
      },
      Task: { type: "object", properties: taskProperties },
      TaskDetail: {
        type: "object",
        properties: {
          ...taskProperties,
          subtasks: {
            type: "array",
            items: {
              type: "object",
              properties: { id: str, title: str, status: { type: "string", enum: TASK_STATUSES } },
            },
          },
          meetingIds: { type: "array", items: str },
        },
      },
      TaskCreate: {
        type: "object",
        required: ["projectId", "title"],
        additionalProperties: false,
        properties: { projectId: str, ...taskWriteFields },
      },
      TaskUpdate: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: taskWriteFields,
      },
    },
  },
} as const;
