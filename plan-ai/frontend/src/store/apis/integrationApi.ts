import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components, operations } from "../../types/api";

export type IntegrationSummaryResponse = components["schemas"]["IntegrationSummaryResponse"];

export type ApiResponseUserIntegrationSummaryList =
  components["schemas"]["ApiResponse_IntegrationSummaryResponse-Array_"];
export type ApiResponseUserIntegrationSummary =
  components["schemas"]["ApiResponse_IntegrationSummaryResponse-or-null_"];
export type IntegrationProviderType = components["schemas"]["IntegrationProvider"];
export type GithubRepository = components["schemas"]["GithubRepository"];
export type GithubInstallationNode = components["schemas"]["GithubInstallationNode"];
export type ApiResponseGithubRepositories =
  operations["GetConnectedRepositories"]["responses"]["200"]["content"]["application/json"];
export type ApiResponseGithubBranches =
  operations["GetRepositoryBranches"]["responses"]["200"]["content"]["application/json"];

export const integrationApi = createApi({
  reducerPath: "integrationApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Integration", "GithubRepos"],
  endpoints: (builder) => ({
    listIntegrations: builder.query<ApiResponseUserIntegrationSummaryList, void>({
      query: () => ({
        url: "/api/integrations",
        method: "GET",
      }),
      providesTags: (result) => {
        const integrations = result?.data ?? [];
        return [
          { type: "Integration" as const, id: "LIST" },
          ...integrations.map((integration: IntegrationSummaryResponse) => ({
            type: "Integration" as const,
            id: integration?.provider ?? integration?.id,
          })),
        ];
      },
    }),
    getIntegration: builder.query<ApiResponseUserIntegrationSummary, IntegrationProviderType>({
      query: (provider) => ({
        url: `/api/integrations/${provider}`,
        method: "GET",
      }),
      providesTags: (result, error, provider) => [{ type: "Integration" as const, id: provider }],
    }),
    bindGithubInstallation: builder.mutation<{ success: boolean; message?: string }, string>({
      query: (installationId) => ({
        url: `/api/integrations/github/bind`,
        method: "POST",
        body: { installationId },
      }),
      invalidatesTags: [
        { type: "Integration" as const, id: "LIST" },
        { type: "Integration" as const, id: "GITHUB" },
        { type: "GithubRepos" as const, id: "LIST" },
      ],
    }),
    getGithubRepositories: builder.query<ApiResponseGithubRepositories, void>({
      query: () => ({
        url: `/api/integrations/github/repositories`,
        method: "GET",
      }),
      providesTags: [{ type: "GithubRepos" as const, id: "LIST" }],
    }),
    getGithubRepositoryBranches: builder.query<
      ApiResponseGithubBranches,
      { installationId: string; owner: string; repo: string }
    >({
      query: ({ installationId, owner, repo }) => ({
        url: `/api/integrations/github/installations/${installationId}/repositories/${owner}/${repo}/branches`,
        method: "GET",
      }),
    }),
    getGoogleAuthUrl: builder.query<{ data: { authorizationUrl: string } }, string>({
      query: (redirectPath) => ({
        url: `/api/integrations/google/auth-url${redirectPath ? `?redirectPath=${encodeURIComponent(redirectPath)}` : ""}`,
        method: "GET",
      }),
    }),
    bindGoogleAccount: builder.mutation<{ success: boolean; message?: string }, string>({
      query: (code) => ({
        url: `/api/integrations/google/bind`,
        method: "POST",
        body: { code },
      }),
      invalidatesTags: [
        { type: "Integration" as const, id: "LIST" },
        { type: "Integration" as const, id: "GOOGLE_DRIVE" },
      ],
    }),
    disconnectIntegration: builder.mutation<{ success: boolean; message?: string }, string>({
      query: (provider) => ({
        url: `/api/integrations/${provider}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, provider) => [
        { type: "Integration" as const, id: "LIST" },
        { type: "Integration" as const, id: provider },
      ],
    }),
  }),
});

export const {
  useListIntegrationsQuery,
  useGetIntegrationQuery,
  useBindGithubInstallationMutation,
  useGetGithubRepositoriesQuery,
  useGetGithubRepositoryBranchesQuery,
  useLazyGetGoogleAuthUrlQuery,
  useBindGoogleAccountMutation,
  useDisconnectIntegrationMutation,
} = integrationApi;
