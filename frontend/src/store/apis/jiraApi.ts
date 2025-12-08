import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type ApiResponseJiraAuthorizationResponse =
  components["schemas"]["ApiResponse_JiraAuthorizationResponse_"];

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
  }),
});

export const { useLazyGetJiraAuthorizationUrlQuery } = jiraApi;
