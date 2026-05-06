import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type BrandThemeResponse = components["schemas"]["BrandThemeResponse"];
export type CreateBrandThemeRequest = components["schemas"]["CreateBrandThemeInput"];
export type UpdateBrandThemeRequest = components["schemas"]["Partial_CreateBrandThemeInput_"];

export const brandThemeApi = createApi({
  reducerPath: "brandThemeApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["BrandTheme"],
  endpoints: (builder) => ({
    getBrandThemes: builder.query<BrandThemeResponse[], void>({
      query: () => "/api/brand-themes",
      providesTags: ["BrandTheme"],
    }),
    getBrandThemeById: builder.query<BrandThemeResponse, string>({
      query: (id) => `/api/brand-themes/${id}`,
      providesTags: (_result, _error, id) => [{ type: "BrandTheme", id }],
    }),
    createBrandTheme: builder.mutation<BrandThemeResponse, CreateBrandThemeRequest>({
      query: (body) => ({
        url: "/api/brand-themes",
        method: "POST",
        body,
      }),
      invalidatesTags: ["BrandTheme"],
    }),
    updateBrandTheme: builder.mutation<
      BrandThemeResponse,
      { id: string; body: UpdateBrandThemeRequest }
    >({
      query: ({ id, body }) => ({
        url: `/api/brand-themes/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => ["BrandTheme", { type: "BrandTheme", id }],
    }),
    deleteBrandTheme: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/api/brand-themes/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["BrandTheme"],
    }),
  }),
});

export const {
  useGetBrandThemesQuery,
  useGetBrandThemeByIdQuery,
  useCreateBrandThemeMutation,
  useUpdateBrandThemeMutation,
  useDeleteBrandThemeMutation,
} = brandThemeApi;
