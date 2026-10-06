import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

type AdminEmailTemplatesResponse = components["schemas"]["AdminEmailTemplatesResponse"];
export type QdrantWorkspaceBackfill = components["schemas"]["QdrantWorkspaceBackfillStatus"];

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AdminEmails", "QdrantWorkspace"],
  endpoints: (builder) => ({
    getAdminEmailTemplates: builder.query<AdminEmailTemplatesResponse, void>({
      query: () => "/api/admin/emails/templates",
      providesTags: ["AdminEmails"],
    }),
    // The job runs in the background on the server. This reads how far it is
    // and answers at once; the page polls it while a run is going.
    getQdrantWorkspaceStatus: builder.query<QdrantWorkspaceBackfill, void>({
      query: () => "/api/admin/maintenance/qdrant-workspace",
      providesTags: ["QdrantWorkspace"],
    }),
    // Starts a count. Changes nothing.
    checkQdrantWorkspace: builder.mutation<QdrantWorkspaceBackfill, void>({
      query: () => ({ url: "/api/admin/maintenance/qdrant-workspace/check", method: "POST" }),
      invalidatesTags: ["QdrantWorkspace"],
    }),
    // Starts the stamping.
    applyQdrantWorkspaceBackfill: builder.mutation<QdrantWorkspaceBackfill, void>({
      query: () => ({ url: "/api/admin/maintenance/qdrant-workspace/apply", method: "POST" }),
      invalidatesTags: ["QdrantWorkspace"],
    }),
  }),
});

export const {
  useGetAdminEmailTemplatesQuery,
  useGetQdrantWorkspaceStatusQuery,
  useCheckQdrantWorkspaceMutation,
  useApplyQdrantWorkspaceBackfillMutation,
} = adminApi;
