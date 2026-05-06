import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type ApiResponseJiraAuthorizationResponse =
  components["schemas"]["ApiResponse_JiraAuthorizationResponse_"];

export type JiraManualConnectRequest = components["schemas"]["JiraManualConnectRequest"];

export type JiraSummaryResponse = components["schemas"]["JiraSummaryResponse"];

export const jiraApi = createApi({
  reducerPath: "jiraApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["JiraIntegration"],
  endpoints: (builder) => ({
    getJiraAuthorizationUrl: builder.query<ApiResponseJiraAuthorizationResponse, string | void>({
      query: (stateParam) => ({
        url: "/api/jira/auth",
        method: "GET",
        params:
          typeof stateParam === "string" && stateParam.length > 0
            ? { state: stateParam }
            : undefined,
      }),
      providesTags: ["JiraIntegration"],
    }),
    connectJiraManually: builder.mutation<{ data: { success: boolean } }, JiraManualConnectRequest>(
      {
        query: (body) => ({
          url: "/api/jira/manual-connect",
          method: "POST",
          body,
        }),
        invalidatesTags: ["JiraIntegration"],
      },
    ),
    getJiraSummary: builder.query<{ data: JiraSummaryResponse }, void>({
      query: () => ({
        url: "/api/jira/summary",
        method: "GET",
      }),
      providesTags: ["JiraIntegration"],
    }),
    getJiraProjects: builder.query<{ data: { id: string; name: string; key: string }[] }, void>({
      query: () => ({
        url: "/api/jira/projects",
        method: "GET",
      }),
      providesTags: ["JiraIntegration"],
    }),
    setJiraDefaultProject: builder.mutation<{ data: null }, { projectId: string }>({
      query: (body) => ({
        url: "/api/jira/default-project",
        method: "POST",
        body,
      }),
      invalidatesTags: ["JiraIntegration"],
    }),
  }),
});

export const {
  useLazyGetJiraAuthorizationUrlQuery,
  useConnectJiraManuallyMutation,
  useGetJiraSummaryQuery,
  useGetJiraProjectsQuery,
  useSetJiraDefaultProjectMutation,
} = jiraApi;
