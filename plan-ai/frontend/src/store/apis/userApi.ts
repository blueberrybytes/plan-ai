import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type UserDetailResponse = components["schemas"]["UserDetailResponse"];
export type UpdateUserRoleRequest = components["schemas"]["UpdateUserRoleRequest"];
export type ApiResponseUserDetailArray =
  components["schemas"]["ApiResponse_UserDetailResponse-Array_"];
export type ApiResponseUserDetail = components["schemas"]["ApiResponse_UserDetailResponse_"];
export type UserOrphanResponse = components["schemas"]["UserOrphanResponse"];
export type SyncOrphanRequest = components["schemas"]["SyncOrphanRequest"];
export type ApiResponseUserOrphanArray =
  components["schemas"]["ApiResponse_UserOrphanResponse-Array_"];

export const userApi = createApi({
  reducerPath: "userApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User"],
  endpoints: (builder) => ({
    getUsers: builder.query<ApiResponseUserDetailArray, void>({
      query: () => "/api/users",
      providesTags: ["User"],
    }),
    updateUserRole: builder.mutation<
      ApiResponseUserDetail,
      { userId: string; body: UpdateUserRoleRequest }
    >({
      query: ({ userId, body }) => ({
        url: `/api/users/${userId}/role`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["User"],
    }),
    getOrphans: builder.query<ApiResponseUserOrphanArray, void>({
      query: () => "/api/users/orphans",
      providesTags: ["User"],
    }),
    syncOrphan: builder.mutation<ApiResponseUserDetail, SyncOrphanRequest>({
      query: (body) => ({
        url: `/api/users/sync-orphan`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["User"],
    }),
    forceVerifyEmail: builder.mutation<ApiResponseUserDetail, { userId: string }>({
      query: ({ userId }) => ({
        url: `/api/users/${userId}/verify-email`,
        method: "POST",
      }),
      invalidatesTags: ["User"],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useGetOrphansQuery,
  useSyncOrphanMutation,
  useForceVerifyEmailMutation,
} = userApi;
