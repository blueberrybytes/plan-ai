import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components, operations } from "../../types/api";

export type ApiResponseContextListResponse =
  components["schemas"]["ApiResponse_ContextListResponse_"];
export type ApiResponseContextResponse = components["schemas"]["ApiResponse_ContextResponse_"];
export type ApiResponseNull = components["schemas"]["ApiResponse_null_"];

export type CreateContextRequest =
  operations["CreateContext"]["requestBody"]["content"]["application/json"];
export type UpdateContextRequest =
  operations["UpdateContext"]["requestBody"]["content"]["application/json"];

export interface UploadContextFileArgs {
  contextId: string;
  file: File;
  metadata?: components["schemas"]["InputJsonValue"] | null;
}

export interface DeleteContextFileArgs {
  contextId: string;
  fileId: string;
}

export const contextApi = createApi({
  reducerPath: "contextApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Context"],
  endpoints: (builder) => ({
    listContexts: builder.query<ApiResponseContextListResponse, void>({
      query: () => ({
        url: "/api/contexts",
        method: "GET",
      }),
      providesTags: (result) => {
        const contexts = result?.data?.contexts ?? [];
        return [
          { type: "Context" as const, id: "LIST" },
          ...contexts.map((context) => ({
            type: "Context" as const,
            id: context.id,
          })),
        ];
      },
    }),
    getContext: builder.query<ApiResponseContextResponse, string>({
      query: (contextId) => ({
        url: `/api/contexts/${contextId}`,
        method: "GET",
      }),
      providesTags: (result, error, contextId) => [{ type: "Context" as const, id: contextId }],
    }),
    createContext: builder.mutation<ApiResponseContextResponse, CreateContextRequest>({
      query: (body) => ({
        url: "/api/contexts",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Context" as const, id: "LIST" }],
    }),
    updateContext: builder.mutation<
      ApiResponseContextResponse,
      { contextId: string; body: UpdateContextRequest }
    >({
      query: ({ contextId, body }) => ({
        url: `/api/contexts/${contextId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { contextId }) => [
        { type: "Context" as const, id: "LIST" },
        { type: "Context" as const, id: contextId },
      ],
    }),
    deleteContext: builder.mutation<ApiResponseNull, string>({
      query: (contextId) => ({
        url: `/api/contexts/${contextId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, contextId) => [
        { type: "Context" as const, id: "LIST" },
        { type: "Context" as const, id: contextId },
      ],
    }),
    uploadContextFile: builder.mutation<ApiResponseContextResponse, UploadContextFileArgs>({
      query: ({ contextId, file, metadata }) => {
        const formData = new FormData();
        formData.append("files", file);

        return {
          url: `/api/contexts/${contextId}/files`,
          method: "POST",
          body: formData,
          params:
            typeof metadata !== "undefined" ? { metadata: JSON.stringify(metadata) } : undefined,
        };
      },
      invalidatesTags: (result, error, { contextId }) => [
        { type: "Context" as const, id: "LIST" },
        { type: "Context" as const, id: contextId },
      ],
    }),
    deleteContextFile: builder.mutation<ApiResponseContextResponse, DeleteContextFileArgs>({
      query: ({ contextId, fileId }) => ({
        url: `/api/contexts/${contextId}/files/${fileId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { contextId }) => [
        { type: "Context" as const, id: "LIST" },
        { type: "Context" as const, id: contextId },
      ],
    }),
  }),
});

export const {
  useListContextsQuery,
  useGetContextQuery,
  useCreateContextMutation,
  useUpdateContextMutation,
  useDeleteContextMutation,
  useUploadContextFileMutation,
  useDeleteContextFileMutation,
} = contextApi;
