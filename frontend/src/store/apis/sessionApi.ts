import { createApi } from "@reduxjs/toolkit/query/react";
import { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

// Define types from the generated API types
export type ApiResponseUserResponse = components["schemas"]["ApiResponse_UserResponse_"];
export type ApiResponseSessionResponse = components["schemas"]["ApiResponse_SessionResponse_"];
export type ApiResponseSessionListResponse =
  components["schemas"]["ApiResponse_SessionListResponse_"];
export type ApiResponseNull = components["schemas"]["ApiResponse_null_"];

export type LoginRequest = operations["Login"]["requestBody"]["content"]["application/json"];
export type CreateSessionRequest =
  operations["CreateSession"]["requestBody"]["content"]["application/json"];
export type UpdateSessionRequest =
  operations["UpdateSession"]["requestBody"]["content"]["application/json"];
export type ListSessionsParams = operations["ListSessions"]["parameters"]["query"];
export type CreateTranscriptRequest =
  operations["CreateTranscript"]["requestBody"]["content"]["application/json"];
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

export type ListTranscriptsParams = operations["ListTranscripts"]["parameters"]["query"];
export type TranscriptPathParams = operations["GetTranscript"]["parameters"]["path"];
export type ManualTranscriptRequest =
  operations["CreateManualTranscript"]["requestBody"]["content"]["application/json"];
export type UpdateTranscriptRequest =
  operations["UpdateTranscript"]["requestBody"]["content"]["application/json"];

export interface UploadSessionTranscriptArgs {
  sessionId: string;
  files: File[];
  title?: string;
  recordedAt?: string;
  metadataJson?: string;
  language?: string;
  summary?: string;
}

export type ListTasksParams = operations["ListTasks"]["parameters"]["query"];
export type TaskPathParams = operations["GetTask"]["parameters"]["path"];
export type CreateTaskRequest =
  operations["CreateTask"]["requestBody"]["content"]["application/json"];
export type UpdateTaskRequest =
  operations["UpdateTask"]["requestBody"]["content"]["application/json"];

export const sessionApi = createApi({
  reducerPath: "sessionApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Session", "Transcript", "Task"],
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponseUserResponse, LoginRequest>({
      query: (credentials) => ({
        url: "/api/session/login",
        method: "POST",
        body: credentials,
      }),
    }),
    getCurrentUser: builder.query<ApiResponseUserResponse, void>({
      query: () => "/api/session/me",
    }),
    listSessions: builder.query<ApiResponseSessionListResponse, ListSessionsParams | undefined>({
      query: (params) => ({
        url: "/api/sessions",
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result) => {
        const sessions = result?.data?.sessions ?? [];
        return [
          { type: "Session" as const, id: "LIST" },
          ...sessions.map((session) => ({
            type: "Session" as const,
            id: session.id,
          })),
        ];
      },
    }),
    getSession: builder.query<ApiResponseSessionResponse, string>({
      query: (sessionId) => ({
        url: `/api/sessions/${sessionId}`,
        method: "GET",
      }),
      providesTags: (result, error, sessionId) => [{ type: "Session" as const, id: sessionId }],
    }),
    createSession: builder.mutation<ApiResponseSessionResponse, CreateSessionRequest>({
      query: (body) => ({
        url: "/api/sessions",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Session" as const, id: "LIST" }],
    }),
    updateSession: builder.mutation<
      ApiResponseSessionResponse,
      { sessionId: string; body: UpdateSessionRequest }
    >({
      query: ({ sessionId, body }) => ({
        url: `/api/sessions/${sessionId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: "Session" as const, id: "LIST" },
        { type: "Session" as const, id: sessionId },
      ],
    }),
    deleteSession: builder.mutation<ApiResponseNull, string>({
      query: (sessionId) => ({
        url: `/api/sessions/${sessionId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, sessionId) => [
        { type: "Session" as const, id: "LIST" },
        { type: "Session" as const, id: sessionId },
      ],
    }),
    listSessionTranscripts: builder.query<
      ApiResponseTranscriptListResponse,
      { sessionId: string; params?: ListTranscriptsParams }
    >({
      query: ({ sessionId, params }) => ({
        url: `/api/sessions/${sessionId}/transcripts`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result, error, { sessionId }) => {
        const transcripts = result?.data?.transcripts ?? [];
        return [
          { type: "Session" as const, id: sessionId },
          { type: "Transcript" as const, id: `${sessionId}-LIST` },
          ...transcripts.map((transcript) => ({
            type: "Transcript" as const,
            id: transcript.id,
          })),
        ];
      },
    }),
    getSessionTranscript: builder.query<ApiResponseTranscriptResponse, TranscriptPathParams>({
      query: ({ sessionId, transcriptId }) => ({
        url: `/api/sessions/${sessionId}/transcripts/${transcriptId}`,
        method: "GET",
      }),
      providesTags: (result, error, { sessionId, transcriptId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: transcriptId },
      ],
    }),
    createSessionTranscript: builder.mutation<
      ApiResponseCreateTranscriptResponse,
      { sessionId: string; body: CreateTranscriptRequest }
    >({
      query: ({ sessionId, body }) => ({
        url: `/api/sessions/${sessionId}/transcripts`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: `${sessionId}-LIST` },
      ],
    }),
    uploadSessionTranscript: builder.mutation<
      ApiResponseTranscriptResponse,
      UploadSessionTranscriptArgs
    >({
      query: ({ sessionId, files, title, recordedAt, metadataJson, language, summary }) => {
        const formData = new FormData();
        files.forEach((file) => {
          formData.append("files", file);
        });

        if (title) {
          formData.append("title", title);
        }
        if (recordedAt) {
          formData.append("recordedAt", recordedAt);
        }
        if (metadataJson) {
          formData.append("metadata", metadataJson);
        }
        if (language) {
          formData.append("language", language);
        }
        if (summary) {
          formData.append("summary", summary);
        }

        return {
          url: `/api/sessions/${sessionId}/transcripts/upload`,
          method: "POST",
          body: formData,
        };
      },
      invalidatesTags: (result, error, { sessionId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: `${sessionId}-LIST` },
      ],
    }),
    createManualTranscript: builder.mutation<
      ApiResponseTranscriptResponse,
      { sessionId: string; body: ManualTranscriptRequest }
    >({
      query: ({ sessionId, body }) => ({
        url: `/api/sessions/${sessionId}/transcripts/manual`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: `${sessionId}-LIST` },
      ],
    }),
    updateSessionTranscript: builder.mutation<
      ApiResponseTranscriptResponse,
      { path: TranscriptPathParams; body: UpdateTranscriptRequest }
    >({
      query: ({ path: { sessionId, transcriptId }, body }) => ({
        url: `/api/sessions/${sessionId}/transcripts/${transcriptId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { path: { sessionId, transcriptId } }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: transcriptId },
        { type: "Transcript" as const, id: `${sessionId}-LIST` },
      ],
    }),
    deleteSessionTranscript: builder.mutation<ApiResponseNull, TranscriptPathParams>({
      query: ({ sessionId, transcriptId }) => ({
        url: `/api/sessions/${sessionId}/transcripts/${transcriptId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { sessionId, transcriptId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Transcript" as const, id: transcriptId },
        { type: "Transcript" as const, id: `${sessionId}-LIST` },
      ],
    }),
    listSessionTasks: builder.query<
      ApiResponseTaskListResponse,
      { sessionId: string; params?: ListTasksParams }
    >({
      query: ({ sessionId, params }) => ({
        url: `/api/sessions/${sessionId}/tasks`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: (result, error, { sessionId }) => {
        const tasks = result?.data?.tasks ?? [];
        return [
          { type: "Session" as const, id: sessionId },
          { type: "Task" as const, id: `${sessionId}-LIST` },
          ...tasks.map((task) => ({ type: "Task" as const, id: task.id })),
        ];
      },
    }),
    getSessionTask: builder.query<
      components["schemas"]["ApiResponse_TaskResponse_"],
      TaskPathParams
    >({
      query: ({ sessionId, taskId }) => ({
        url: `/api/sessions/${sessionId}/tasks/${taskId}`,
        method: "GET",
      }),
      providesTags: (result, error, { sessionId, taskId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Task" as const, id: taskId },
      ],
    }),
    createSessionTask: builder.mutation<
      components["schemas"]["ApiResponse_TaskResponse_"],
      { sessionId: string; body: CreateTaskRequest }
    >({
      query: ({ sessionId, body }) => ({
        url: `/api/sessions/${sessionId}/tasks`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Task" as const, id: `${sessionId}-LIST` },
      ],
    }),
    updateSessionTask: builder.mutation<
      components["schemas"]["ApiResponse_TaskResponse_"],
      { path: TaskPathParams; body: UpdateTaskRequest }
    >({
      query: ({ path: { sessionId, taskId }, body }) => ({
        url: `/api/sessions/${sessionId}/tasks/${taskId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { path: { sessionId, taskId } }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Task" as const, id: taskId },
        { type: "Task" as const, id: `${sessionId}-LIST` },
      ],
    }),
    deleteSessionTask: builder.mutation<ApiResponseNull, TaskPathParams>({
      query: ({ sessionId, taskId }) => ({
        url: `/api/sessions/${sessionId}/tasks/${taskId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { sessionId, taskId }) => [
        { type: "Session" as const, id: sessionId },
        { type: "Task" as const, id: taskId },
        { type: "Task" as const, id: `${sessionId}-LIST` },
      ],
    }),
  }),
});

// Export the generated hooks
export const {
  useLoginMutation,
  useGetCurrentUserQuery,
  useListSessionsQuery,
  useGetSessionQuery,
  useCreateSessionMutation,
  useUpdateSessionMutation,
  useDeleteSessionMutation,
  useCreateSessionTranscriptMutation,
  useUploadSessionTranscriptMutation,
  useListSessionTranscriptsQuery,
  useGetSessionTranscriptQuery,
  useCreateManualTranscriptMutation,
  useUpdateSessionTranscriptMutation,
  useDeleteSessionTranscriptMutation,
  useListSessionTasksQuery,
  useGetSessionTaskQuery,
  useCreateSessionTaskMutation,
  useUpdateSessionTaskMutation,
  useDeleteSessionTaskMutation,
} = sessionApi;
