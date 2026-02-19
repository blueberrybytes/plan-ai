import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

// Types from generated API
export type SlideTemplateResponse = components["schemas"]["SlideTemplateResponse"];
export type SlideTypeConfigResponse = components["schemas"]["SlideTypeConfigResponse"];
export type SlideTypeConfigInput = components["schemas"]["SlideTypeConfigInput"];
export type CreateTemplateRequest = components["schemas"]["CreateTemplateRequest"];
export type UpdateTemplateRequest = components["schemas"]["UpdateTemplateRequest"];
export type PresentationResponse = components["schemas"]["PresentationResponse"];
export type GeneratePresentationRequest = components["schemas"]["GeneratePresentationRequest"];
export interface UpdatePresentationRequest {
  title?: string;
  status?: string;
}

export const slideApi = createApi({
  reducerPath: "slideApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["SlideTemplate", "Presentation"],
  endpoints: (builder) => ({
    // --- Templates ---
    getTemplates: builder.query<SlideTemplateResponse[], void>({
      query: () => "/api/slide-templates",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "SlideTemplate" as const, id })),
              { type: "SlideTemplate", id: "LIST" },
            ]
          : [{ type: "SlideTemplate", id: "LIST" }],
    }),

    getTemplate: builder.query<SlideTemplateResponse, string>({
      query: (id) => `/api/slide-templates/${id}`,
      providesTags: (_result, _error, id) => [{ type: "SlideTemplate", id }],
    }),

    createTemplate: builder.mutation<SlideTemplateResponse, CreateTemplateRequest>({
      query: (body) => ({
        url: "/api/slide-templates",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "SlideTemplate", id: "LIST" }],
    }),

    updateTemplate: builder.mutation<
      SlideTemplateResponse,
      { id: string; data: UpdateTemplateRequest }
    >({
      query: ({ id, data }) => ({
        url: `/api/slide-templates/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "SlideTemplate", id },
        { type: "SlideTemplate", id: "LIST" },
      ],
    }),

    deleteTemplate: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/api/slide-templates/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "SlideTemplate", id: "LIST" }],
    }),

    // --- Presentations ---
    getPresentations: builder.query<PresentationResponse[], void>({
      query: () => "/api/presentations",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Presentation" as const, id })),
              { type: "Presentation", id: "LIST" },
            ]
          : [{ type: "Presentation", id: "LIST" }],
    }),

    getPresentation: builder.query<PresentationResponse, string>({
      query: (id) => `/api/presentations/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Presentation", id }],
    }),

    generatePresentation: builder.mutation<PresentationResponse, GeneratePresentationRequest>({
      query: (body) => ({
        url: "/api/presentations/generate",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Presentation", id: "LIST" }],
    }),

    deletePresentation: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/api/presentations/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Presentation", id: "LIST" }],
    }),

    updatePresentationStatus: builder.mutation<
      PresentationResponse,
      { id: string; status: string }
    >({
      query: ({ id, status }) => ({
        url: `/api/presentations/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Presentation", id },
        { type: "Presentation", id: "LIST" },
      ],
    }),

    updatePresentation: builder.mutation<
      PresentationResponse,
      { id: string; data: UpdatePresentationRequest }
    >({
      query: ({ id, data }) => ({
        url: `/api/presentations/${id}`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Presentation", id },
        { type: "Presentation", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetTemplatesQuery,
  useGetTemplateQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useDeleteTemplateMutation,
  useGetPresentationsQuery,
  useGetPresentationQuery,
  useGeneratePresentationMutation,
  useDeletePresentationMutation,
  useUpdatePresentationStatusMutation,
  useUpdatePresentationMutation,
} = slideApi;
