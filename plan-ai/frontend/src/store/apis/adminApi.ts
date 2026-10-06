import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

type AdminEmailTemplatesResponse = components["schemas"]["AdminEmailTemplatesResponse"];
export type QdrantWorkspaceBackfill = components["schemas"]["QdrantWorkspaceBackfillResult"];

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AdminEmails", "QdrantWorkspace"],
  endpoints: (builder) => ({
    getAdminEmailTemplates: builder.query<AdminEmailTemplatesResponse, void>({
      query: () => "/api/admin/emails/templates",
      providesTags: ["AdminEmails"],
    }),
    // Counts the Qdrant points that still lack their workspace. Changes nothing.
    getQdrantWorkspaceStatus: builder.query<QdrantWorkspaceBackfill, void>({
      query: () => "/api/admin/maintenance/qdrant-workspace",
      providesTags: ["QdrantWorkspace"],
    }),
    applyQdrantWorkspaceBackfill: builder.mutation<QdrantWorkspaceBackfill, void>({
      query: () => ({ url: "/api/admin/maintenance/qdrant-workspace/apply", method: "POST" }),
      invalidatesTags: ["QdrantWorkspace"],
    }),
  }),
});

export const {
  useGetAdminEmailTemplatesQuery,
  useGetQdrantWorkspaceStatusQuery,
  useApplyQdrantWorkspaceBackfillMutation,
} = adminApi;
