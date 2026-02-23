import { createApi } from "@reduxjs/toolkit/query/react";
import { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type ApiResponseUserResponse = components["schemas"]["ApiResponse_UserResponse_"];
export type ApiResponseCustomToken = components["schemas"]["ApiResponse__customToken-string__"];
export type LoginRequest = operations["Login"]["requestBody"]["content"]["application/json"];

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponseUserResponse, LoginRequest>({
      query: (credentials) => ({
        url: "/api/session/login",
        method: "POST",
        body: credentials,
      }),
    }),
    getCurrentUser: builder.query<ApiResponseUserResponse, void>({
      query: () => "/api/session/me",
    }),
    getDesktopToken: builder.query<ApiResponseCustomToken, void>({
      query: () => "/api/session/desktop-token",
    }),
  }),
});

export const { useLoginMutation, useGetCurrentUserQuery, useLazyGetDesktopTokenQuery } = authApi;
