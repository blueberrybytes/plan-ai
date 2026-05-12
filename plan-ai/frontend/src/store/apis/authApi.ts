import { createApi } from "@reduxjs/toolkit/query/react";
import { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type ApiResponseUserResponse = components["schemas"]["ApiResponse_UserResponse_"];
export type ApiResponseCustomToken = components["schemas"]["ApiResponse__code-string__"];
export type LoginRequest = operations["Login"]["requestBody"]["content"]["application/json"];

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User"],
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponseUserResponse, LoginRequest>({
      query: (credentials) => ({
        url: "/api/session/login",
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["User"],
    }),
    getCurrentUser: builder.query<ApiResponseUserResponse, void>({
      query: () => "/api/session/me",
      providesTags: ["User"],
    }),
    getDesktopToken: builder.mutation<ApiResponseCustomToken, void>({
      query: () => ({
        url: "/api/session/desktop-token",
        method: "POST",
      }),
    }),
    completeHomeTour: builder.mutation<ApiResponseUserResponse, void>({
      query: () => ({
        url: "/api/session/me/home-tour",
        method: "POST",
      }),
      invalidatesTags: ["User"],
    }),
  }),
});

export const { useLoginMutation, useGetCurrentUserQuery, useGetDesktopTokenMutation, useCompleteHomeTourMutation } = authApi;
