import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export interface WorkspaceResponse extends Omit<components["schemas"]["WorkspaceResponse"], ""> {
  monthlyTokenLimit?: number;
  openRouterKey?: string;
  deepgramKey?: string;
  isCourtesy?: boolean;
}
export type InviteMemberRequest = components["schemas"]["InviteMemberRequest"];
export type UpdateMemberRequest = components["schemas"]["UpdateMemberRequest"];
export type CreateWorkspaceRequest = components["schemas"]["CreateWorkspaceRequest"];
export type WorkspaceTeamResponse = components["schemas"]["WorkspaceTeamResponse"];
export type UpdateWorkspaceSettingsRequest =
  components["schemas"]["UpdateWorkspaceSettingsRequest"];

export const workspaceApi = createApi({
  reducerPath: "workspaceApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Workspace"],
  endpoints: (builder) => ({
    getMyWorkspaces: builder.query<WorkspaceResponse[], void>({
      query: () => "/api/workspaces",
      providesTags: ["Workspace"],
    }),
    getWorkspaceMembers: builder.query<WorkspaceTeamResponse, void>({
      query: () => "/api/workspaces/members",
      providesTags: ["Workspace"],
    }),
    inviteWorkspaceMember: builder.mutation<
      { success: boolean; message: string },
      InviteMemberRequest
    >({
      query: (body) => ({
        url: "/api/workspaces/members/invite",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Workspace"],
    }),
    updateWorkspaceMember: builder.mutation<
      { success: boolean; message: string },
      { memberId: string; body: UpdateMemberRequest }
    >({
      query: ({ memberId, body }) => ({
        url: `/api/workspaces/members/${memberId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Workspace"],
    }),
    removeWorkspaceMember: builder.mutation<{ success: boolean; message: string }, string>({
      query: (memberId) => ({
        url: `/api/workspaces/members/${memberId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Workspace"],
    }),
    cancelWorkspaceInvitation: builder.mutation<{ success: boolean; message: string }, string>({
      query: (invitationId) => ({
        url: `/api/workspaces/invitations/${invitationId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Workspace"],
    }),
    createWorkspace: builder.mutation<WorkspaceResponse, CreateWorkspaceRequest>({
      query: (body) => ({
        url: "/api/workspaces",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Workspace"],
    }),
    updateWorkspaceSettings: builder.mutation<
      { success: boolean; message: string },
      UpdateWorkspaceSettingsRequest
    >({
      query: (body) => ({
        url: "/api/workspaces/settings",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Workspace"],
    }),
  }),
});

export const {
  useGetMyWorkspacesQuery,
  useGetWorkspaceMembersQuery,
  useInviteWorkspaceMemberMutation,
  useUpdateWorkspaceMemberMutation,
  useRemoveWorkspaceMemberMutation,
  useCancelWorkspaceInvitationMutation,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceSettingsMutation,
} = workspaceApi;
