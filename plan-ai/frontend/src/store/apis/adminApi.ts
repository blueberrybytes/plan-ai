import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

type AdminEmailTemplatesResponse = components["schemas"]["AdminEmailTemplatesResponse"];

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AdminEmails"],
  endpoints: (builder) => ({
    getAdminEmailTemplates: builder.query<AdminEmailTemplatesResponse, void>({
      query: () => "/api/admin/emails/templates",
      providesTags: ["AdminEmails"],
    }),
  }),
});

export const { useGetAdminEmailTemplatesQuery } = adminApi;
