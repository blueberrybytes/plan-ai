import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type DiagramResponse = components["schemas"]["DiagramResponse"];
export type CreateDiagramRequest = components["schemas"]["CreateDiagramRequest"];
export type UpdateDiagramRequest = components["schemas"]["UpdateDiagramRequest"];
export type DiagramListResponse = components["schemas"]["DiagramListResponse"];

export const diagramApi = createApi({
  reducerPath: "diagramApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Diagrams"],
  endpoints: (builder) => ({
    getUserDiagrams: builder.query<DiagramListResponse, void>({
      query: () => `/api/diagrams`,
      providesTags: (result) =>
        result?.diagrams
          ? [
              ...result.diagrams.map(({ id }) => ({ type: "Diagrams" as const, id })),
              { type: "Diagrams", id: "LIST" },
            ]
          : [{ type: "Diagrams", id: "LIST" }],
    }),
    getDiagram: builder.query<DiagramResponse, string>({
      query: (diagramId) => `/api/diagrams/${diagramId}`,
      providesTags: (_result, _error, id) => [{ type: "Diagrams", id }],
    }),
    createDiagram: builder.mutation<DiagramResponse, CreateDiagramRequest>({
      query: (body) => ({
        url: "/api/diagrams",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Diagrams", id: "LIST" }],
    }),
    updateDiagram: builder.mutation<DiagramResponse, { id: string; body: UpdateDiagramRequest }>({
      query: ({ id, body }) => ({
        url: `/api/diagrams/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Diagrams", id }],
    }),
    deleteDiagram: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({
        url: `/api/diagrams/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Diagrams", id },
        { type: "Diagrams", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetUserDiagramsQuery,
  useGetDiagramQuery,
  useCreateDiagramMutation,
  useUpdateDiagramMutation,
  useDeleteDiagramMutation,
} = diagramApi;
