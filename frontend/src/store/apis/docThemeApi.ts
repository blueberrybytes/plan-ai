import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type DocThemeResponse = components["schemas"]["DocThemeResponse"];
export type CreateDocThemeRequest = components["schemas"]["CreateDocThemeInput"];

export const docThemeApi = createApi({
  reducerPath: "docThemeApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["DocTheme"],
  endpoints: (builder) => ({
    getDocThemes: builder.query<DocThemeResponse[], void>({
      query: () => "/api/doc-themes",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "DocTheme" as const, id })),
              { type: "DocTheme", id: "LIST" },
            ]
          : [{ type: "DocTheme", id: "LIST" }],
    }),

    getDocTheme: builder.query<DocThemeResponse, string>({
      query: (id) => `/api/doc-themes/${id}`,
      providesTags: (_result, _error, id) => [{ type: "DocTheme", id }],
    }),

    createDocTheme: builder.mutation<DocThemeResponse, CreateDocThemeRequest>({
      query: (body) => ({ url: "/api/doc-themes", method: "POST", body }),
      invalidatesTags: [{ type: "DocTheme", id: "LIST" }],
    }),

    updateDocTheme: builder.mutation<
      DocThemeResponse,
      { id: string; data: Partial<CreateDocThemeRequest> }
    >({
      query: ({ id, data }) => ({ url: `/api/doc-themes/${id}`, method: "PUT", body: data }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "DocTheme", id },
        { type: "DocTheme", id: "LIST" },
      ],
    }),

    deleteDocTheme: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/api/doc-themes/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "DocTheme", id: "LIST" }],
    }),
  }),
});

export const {
  useGetDocThemesQuery,
  useGetDocThemeQuery,
  useCreateDocThemeMutation,
  useUpdateDocThemeMutation,
  useDeleteDocThemeMutation,
} = docThemeApi;
