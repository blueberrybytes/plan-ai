import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export interface SyncTaskRequest {
  targetTeamId?: string;
}

export interface SyncTaskResponse {
  success: boolean;
  externalIssueId: string;
  externalIssueKey: string;
  url: string;
}

export interface ApiResponseSyncTaskResponse {
  status: number;
  message?: string;
  data: SyncTaskResponse;
}

export const taskApi = createApi({
  reducerPath: "taskApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Task"],
  endpoints: (builder) => ({
    syncTask: builder.mutation<
      ApiResponseSyncTaskResponse,
      { taskId: string; provider: string; body: SyncTaskRequest }
    >({
      query: ({ taskId, provider, body }) => ({
        url: `/api/tasks/${taskId}/sync/${provider}`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { taskId }) => [{ type: "Task", id: taskId }],
    }),
  }),
});

export const { useSyncTaskMutation } = taskApi;
