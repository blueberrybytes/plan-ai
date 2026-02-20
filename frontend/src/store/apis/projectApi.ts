import { createApi } from "@reduxjs/toolkit/query/react";
import { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

// Define types from the generated API types
export type ApiResponseUserResponse = components["schemas"]["ApiResponse_UserResponse_"];
export type ApiResponseProjectResponse = components["schemas"]["ApiResponse_ProjectResponse_"];
export type ApiResponseProjectListResponse =
  components["schemas"]["ApiResponse_ProjectListResponse_"];
export type ApiResponseNull = components["schemas"]["ApiResponse_null_"];

export type CreateProjectRequest =
  operations["CreateSession"]["requestBody"]["content"]["application/json"];
export type UpdateProjectRequest =
  operations["UpdateSession"]["requestBody"]["content"]["application/json"];
export type ListProjectsParams = operations["ListSessions"]["parameters"]["query"];
export type CreateTranscriptRequest =
  operations["CreateProjectTranscript"]["requestBody"]["content"]["application/json"];
export type ApiResponseCreateTranscriptResponse =
  components["schemas"]["ApiResponse_CreateTranscriptResponse_"];
export type ApiResponseTranscriptListResponse =
  components["schemas"]["ApiResponse_TranscriptListResponse_"];
export type ApiResponseTranscriptResponse =
  components["schemas"]["ApiResponse_TranscriptResponse_"];
export type ApiResponseTaskListResponse = components["schemas"]["ApiResponse_TaskListResponse_"];
export type ApiResponseTaskResponse = components["schemas"]["ApiResponse_TaskResponse_"];
export type TaskResponse = components["schemas"]["TaskResponse"];
export type TaskStatusSchema = components["schemas"]["TaskStatus"];
export type TaskPrioritySchema = components["schemas"]["TaskPriority"];

export type ListTranscriptsParams = operations["ListProjectTranscripts"]["parameters"]["query"];
export type TranscriptPathParams = operations["GetProjectTranscript"]["parameters"]["path"];
export type ManualTranscriptRequest =
  operations["CreateManualTranscript"]["requestBody"]["content"]["application/json"];
export type UpdateTranscriptRequest =
  operations["UpdateProjectTranscript"]["requestBody"]["content"]["application/json"];

export interface CreateProjectTaskArgs {
  projectId: string;
  body: CreateTaskRequest;
}
export interface UploadProjectTranscriptArgs {
  projectId: string;
  files: File[];
  title?: string;
  recordedAt?: string;
  metadataJson?: string;
  persona?: components["schemas"]["CreateTranscriptRequest"]["persona"];
  contextIds?: string[];
  objective?: string;
  englishLevel?: string;
}

export type ListTasksParams = operations["ListTasks"]["parameters"]["query"];
export type TaskPathParams = operations["GetTask"]["parameters"]["path"];
export type CreateTaskRequest =
  operations["CreateTask"]["requestBody"]["content"]["application/json"];
export type UpdateTaskRequest =
  operations["UpdateTask"]["requestBody"]["content"]["application/json"];

export const projectApi = createApi({
  reducerPath: "projectApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Project", "Transcript", "Task"],
  endpoints: (builder) => ({
    listProjects: builder.query<ApiResponseProjectListResponse, ListProjectsParams | undefined>({
      query: (params) => ({
        url: "/api/projects",
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result) => {
        const projects = result?.data?.projects ?? [];
        return [
          { type: "Project" as const, id: "LIST" },
          ...projects.map((project: { id: string }) => ({
            type: "Project" as const,
            id: project.id,
          })),
        ];
      },
    }),
    getProject: builder.query<ApiResponseProjectResponse, string>({
      query: (projectId) => ({
        url: `/api/projects/${projectId}`,
        method: "GET",
      }),
      providesTags: (result, error, projectId) => [{ type: "Project" as const, id: projectId }],
    }),
    createProject: builder.mutation<ApiResponseProjectResponse, CreateProjectRequest>({
      query: (body) => ({
        url: "/api/projects",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Project" as const, id: "LIST" }],
    }),
    updateProject: builder.mutation<
      ApiResponseProjectResponse,
      { projectId: string; body: UpdateProjectRequest }
    >({
      query: ({ projectId, body }) => ({
        url: `/api/projects/${projectId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Project" as const, id: "LIST" },
        { type: "Project" as const, id: projectId },
      ],
    }),
    deleteProject: builder.mutation<ApiResponseNull, string>({
      query: (projectId) => ({
        url: `/api/projects/${projectId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, projectId) => [
        { type: "Project" as const, id: "LIST" },
        { type: "Project" as const, id: projectId },
      ],
    }),
    listProjectTranscripts: builder.query<
      ApiResponseTranscriptListResponse,
      { projectId: string; params?: ListTranscriptsParams }
    >({
      query: ({ projectId, params }) => ({
        url: `/api/projects/${projectId}/transcripts`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result, error, { projectId }) => {
        const transcripts = result?.data?.transcripts ?? [];
        return [
          { type: "Project" as const, id: projectId },
          { type: "Transcript" as const, id: `${projectId}-LIST` },
          ...transcripts.map((transcript: { id: string }) => ({
            type: "Transcript" as const,
            id: transcript.id,
          })),
        ];
      },
    }),
    getProjectTranscript: builder.query<ApiResponseTranscriptResponse, TranscriptPathParams>({
      query: ({ projectId, transcriptId }) => ({
        url: `/api/projects/${projectId}/transcripts/${transcriptId}`,
        method: "GET",
      }),
      providesTags: (result, error, { projectId, transcriptId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Transcript" as const, id: transcriptId },
      ],
    }),
    createProjectTranscript: builder.mutation<
      ApiResponseCreateTranscriptResponse,
      { projectId: string; body: CreateTranscriptRequest }
    >({
      query: (arg: { projectId: string; body: CreateTranscriptRequest }) => ({
        url: `/api/projects/${arg.projectId}/transcripts`,
        method: "POST",
        body: arg.body,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "Project" as const, id: arg.projectId },
        { type: "Transcript" as const, id: `${arg.projectId}-LIST` },
      ],
    }),
    uploadProjectTranscript: builder.mutation<
      ApiResponseCreateTranscriptResponse,
      UploadProjectTranscriptArgs
    >({
      query: (arg: UploadProjectTranscriptArgs) => {
        const {
          projectId,
          files,
          title,
          recordedAt,
          metadataJson,
          persona,
          contextIds,
          objective,
          englishLevel,
        } = arg;
        const formData = new FormData();
        files.forEach((file) => {
          formData.append("files", file);
        });

        if (title) formData.append("title", title);
        if (recordedAt) formData.append("recordedAt", recordedAt);
        if (metadataJson) formData.append("metadata", metadataJson);
        if (persona) formData.append("persona", persona);
        if (objective) formData.append("objective", objective);
        if (englishLevel) formData.append("englishLevel", englishLevel);
        if (contextIds && contextIds.length > 0) {
          contextIds.forEach((id: string) => formData.append("contextIds", id));
        }

        return {
          url: `/api/projects/${projectId}/transcripts/upload`,
          method: "POST",
          body: formData,
        };
      },
      invalidatesTags: (result, error, arg) => [
        { type: "Project" as const, id: arg.projectId },
        { type: "Transcript" as const, id: `${arg.projectId}-LIST` },
      ],
    }),
    createManualTranscript: builder.mutation<
      ApiResponseTranscriptResponse,
      { projectId: string; body: ManualTranscriptRequest }
    >({
      query: ({ projectId, body }) => ({
        url: `/api/projects/${projectId}/transcripts/manual`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Transcript" as const, id: `${projectId}-LIST` },
      ],
    }),
    updateProjectTranscript: builder.mutation<
      ApiResponseTranscriptResponse,
      { path: TranscriptPathParams; body: UpdateTranscriptRequest }
    >({
      query: ({ path: { projectId, transcriptId }, body }) => ({
        url: `/api/projects/${projectId}/transcripts/${transcriptId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { path: { projectId, transcriptId } }) => [
        { type: "Project" as const, id: projectId },
        { type: "Transcript" as const, id: transcriptId },
        { type: "Transcript" as const, id: `${projectId}-LIST` },
      ],
    }),
    deleteProjectTranscript: builder.mutation<ApiResponseNull, TranscriptPathParams>({
      query: ({ projectId, transcriptId }) => ({
        url: `/api/projects/${projectId}/transcripts/${transcriptId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { projectId, transcriptId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Transcript" as const, id: transcriptId },
        { type: "Transcript" as const, id: `${projectId}-LIST` },
      ],
    }),
    listProjectTasks: builder.query<
      ApiResponseTaskListResponse,
      { projectId: string; params?: ListTasksParams }
    >({
      query: ({ projectId, params }) => ({
        url: `/api/projects/${projectId}/tasks`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result, error, { projectId }) => {
        const tasks = result?.data?.tasks ?? [];
        return [
          { type: "Project" as const, id: projectId },
          { type: "Task" as const, id: `${projectId}-LIST` },
          ...tasks.map((task: { id: string }) => ({ type: "Task" as const, id: task.id })),
        ];
      },
    }),
    getProjectTask: builder.query<
      components["schemas"]["ApiResponse_TaskResponse_"],
      TaskPathParams
    >({
      query: ({ projectId, taskId }) => ({
        url: `/api/projects/${projectId}/tasks/${taskId}`,
        method: "GET",
      }),
      providesTags: (result, error, { projectId, taskId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Task" as const, id: taskId },
      ],
    }),
    createProjectTask: builder.mutation<TaskResponse, CreateProjectTaskArgs>({
      query: ({ projectId, body }) => ({
        url: `/api/projects/${projectId}/tasks`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Task" as const, id: `${projectId}-LIST` },
      ],
    }),
    updateProjectTask: builder.mutation<
      components["schemas"]["ApiResponse_TaskResponse_"],
      { path: TaskPathParams; body: UpdateTaskRequest }
    >({
      query: ({ path: { projectId, taskId }, body }) => ({
        url: `/api/projects/${projectId}/tasks/${taskId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { path: { projectId, taskId } }) => [
        { type: "Project" as const, id: projectId },
        { type: "Task" as const, id: taskId },
        { type: "Task" as const, id: `${projectId}-LIST` },
      ],
    }),
    deleteProjectTask: builder.mutation<ApiResponseNull, TaskPathParams>({
      query: ({ projectId, taskId }) => ({
        url: `/api/projects/${projectId}/tasks/${taskId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: "Project" as const, id: projectId },
        { type: "Task" as const, id: taskId },
        { type: "Task" as const, id: `${projectId}-LIST` },
      ],
    }),
  }),
});

// Export the generated hooks
export const {
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useCreateProjectTranscriptMutation,
  useUploadProjectTranscriptMutation,
  useListProjectTranscriptsQuery,
  useGetProjectTranscriptQuery,
  useCreateManualTranscriptMutation,
  useUpdateProjectTranscriptMutation,
  useDeleteProjectTranscriptMutation,
  useListProjectTasksQuery,
  useGetProjectTaskQuery,
  useCreateProjectTaskMutation,
  useUpdateProjectTaskMutation,
  useDeleteProjectTaskMutation,
} = projectApi;
