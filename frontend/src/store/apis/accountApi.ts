import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

// Define API response types
type ApiResponseBoolean = components["schemas"]["ApiResponse_boolean_"];
type ApiResponseCustomThemeNullable = components["schemas"]["ApiResponse_CustomTheme-or-null_"];
type ApiResponseCustomTheme = components["schemas"]["ApiResponse_CustomTheme_"];
type UpdateCustomThemeRequest = components["schemas"]["UpdateCustomThemeRequest"];

export const accountApi = createApi({
  reducerPath: "accountApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User", "CustomTheme"],
  endpoints: (builder) => ({
    deleteUser: builder.mutation<ApiResponseBoolean, string>({
      query: (userId) => ({
        url: `/account/user/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["User"],
    }),
    deleteMyAccount: builder.mutation<ApiResponseBoolean, void>({
      query: () => ({
        url: `/account/self`,
        method: "DELETE",
      }),
      invalidatesTags: ["User"],
    }),
    getCustomTheme: builder.query<ApiResponseCustomThemeNullable, void>({
      query: () => ({
        url: "/account/theme",
        method: "GET",
      }),
      providesTags: ["CustomTheme"],
    }),
    upsertCustomTheme: builder.mutation<ApiResponseCustomTheme, UpdateCustomThemeRequest>({
      query: (body) => ({
        url: "/account/theme",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["CustomTheme"],
    }),
  }),
});

export const {
  useDeleteUserMutation,
  useDeleteMyAccountMutation,
  useGetCustomThemeQuery,
  useUpsertCustomThemeMutation,
} = accountApi;
