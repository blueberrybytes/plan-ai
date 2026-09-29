import { createApi } from "@reduxjs/toolkit/query/react";
import { components, operations } from "../../types/api";
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
export type WorkspaceMemberResponse = components["schemas"]["WorkspaceMemberResponse"];
export type AuditLogResponse = components["schemas"]["AuditLogResponse"];
export type AuditLogEntryResponse = components["schemas"]["AuditLogEntryResponse"];
export type AuditLogQuery = NonNullable<operations["GetAuditLog"]["parameters"]["query"]>;
export type WorkspaceExport = components["schemas"]["TsoaJsonObject"];
export type TransferOwnershipRequest =
  operations["TransferOwnership"]["requestBody"]["content"]["application/json"];
export type DeleteWorkspaceRequest =
  operations["DeleteWorkspace"]["requestBody"]["content"]["application/json"];
type WorkspaceActionResponse =
  operations["DeleteWorkspace"]["responses"][200]["content"]["application/json"];

export const workspaceApi = createApi({
  reducerPath: "workspaceApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Workspace", "AuditLog"],
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
      invalidatesTags: ["Workspace", "AuditLog"],
    }),
    getWorkspaceAuditLog: builder.query<AuditLogResponse, AuditLogQuery>({
      query: (params) => ({ url: "/api/workspaces/audit-log", params }),
      providesTags: ["AuditLog"],
    }),
    // The export holds every meeting of the workspace, so it is never kept in the cache.
    exportWorkspaceData: builder.query<WorkspaceExport, void>({
      query: () => "/api/workspaces/export",
      keepUnusedDataFor: 0,
    }),
    transferWorkspaceOwnership: builder.mutation<WorkspaceActionResponse, TransferOwnershipRequest>(
      {
        query: (body) => ({
          url: "/api/workspaces/transfer-ownership",
          method: "POST",
          body,
        }),
        invalidatesTags: ["Workspace", "AuditLog"],
      },
    ),
    deleteWorkspace: builder.mutation<WorkspaceActionResponse, DeleteWorkspaceRequest>({
      query: (body) => ({
        url: "/api/workspaces/delete",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Workspace", "AuditLog"],
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
  useLazyGetWorkspaceAuditLogQuery,
  useTransferWorkspaceOwnershipMutation,
  useDeleteWorkspaceMutation,
} = workspaceApi;
