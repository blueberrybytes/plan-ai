import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type DocDocumentResponse = components["schemas"]["DocDocumentResponse"];
export type CreateDocRequest = components["schemas"]["CreateDocInput"];
export type UpdateDocRequest = components["schemas"]["UpdateDocInput"];

export const docApi = createApi({
  reducerPath: "docApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["DocDocument"],
  endpoints: (builder) => ({
    getDocs: builder.query<DocDocumentResponse[], void>({
      query: () => "/api/documents",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "DocDocument" as const, id })),
              { type: "DocDocument", id: "LIST" },
            ]
          : [{ type: "DocDocument", id: "LIST" }],
    }),

    getDoc: builder.query<DocDocumentResponse, string>({
      query: (id) => `/api/documents/${id}`,
      providesTags: (_result, _error, id) => [{ type: "DocDocument", id }],
    }),

    getPublicDoc: builder.query<DocDocumentResponse, string>({
      query: (id) => `/api/public/documents/${id}`,
    }),

    createDoc: builder.mutation<DocDocumentResponse, CreateDocRequest>({
      query: (body) => ({ url: "/api/documents", method: "POST", body }),
      invalidatesTags: [{ type: "DocDocument", id: "LIST" }],
    }),

    updateDoc: builder.mutation<DocDocumentResponse, { id: string; data: UpdateDocRequest }>({
      query: ({ id, data }) => ({ url: `/api/documents/${id}`, method: "PATCH", body: data }),
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        // Optimistically patch the individual doc cache entry
        const patch = dispatch(
          docApi.util.updateQueryData("getDoc", id, (draft) => {
            Object.assign(draft, data);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_result, _error, { id }) => [
        { type: "DocDocument", id },
        { type: "DocDocument", id: "LIST" },
      ],
    }),

    deleteDoc: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/api/documents/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "DocDocument", id: "LIST" }],
    }),
  }),
});

export const {
  useGetDocsQuery,
  useGetDocQuery,
  useGetPublicDocQuery,
  useCreateDocMutation,
  useUpdateDocMutation,
  useDeleteDocMutation,
} = docApi;
