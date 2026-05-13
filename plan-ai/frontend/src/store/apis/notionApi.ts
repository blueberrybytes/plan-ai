import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type NotionSummaryResponse = components["schemas"]["NotionSummaryResponse"];

export const notionApi = createApi({
  reducerPath: "notionApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["NotionIntegration"],
  endpoints: (builder) => ({
    getNotionSummary: builder.query<{ data: NotionSummaryResponse }, void>({
      query: () => ({
        url: "/api/notion/summary",
        method: "GET",
      }),
      providesTags: ["NotionIntegration"],
    }),
    getNotionDatabases: builder.query<{ data: { id: string; name: string; url: string }[] }, void>({
      query: () => ({
        url: "/api/notion/databases",
        method: "GET",
      }),
      providesTags: ["NotionIntegration"],
    }),
    setNotionDefaultDatabase: builder.mutation<{ data: null }, { databaseId: string }>({
      query: (body) => ({
        url: "/api/notion/default-database",
        method: "POST",
        body,
      }),
      invalidatesTags: ["NotionIntegration"],
    }),
    getNotionAuthUrl: builder.query<{ data: { authorizationUrl: string } }, { redirectPath?: string } | void>({
      query: (arg) => ({
        url: "/api/notion/auth-url",
        method: "GET",
        params: arg || {},
      }),
    }),
  }),
});

export const {
  useGetNotionSummaryQuery,
  useGetNotionDatabasesQuery,
  useSetNotionDefaultDatabaseMutation,
  useLazyGetNotionAuthUrlQuery,
} = notionApi;
