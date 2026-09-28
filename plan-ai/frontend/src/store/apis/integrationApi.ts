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
export type ApiResponseCalendarAuthUrl =
  operations["GetGoogleCalendarAuthUrl"]["responses"]["200"]["content"]["application/json"];
export type CalendarConnectRequest = components["schemas"]["CalendarConnectRequest"];
export type ApiResponseCalendarConnect =
  components["schemas"]["ApiResponse_CalendarConnectResult_"];

const calendarAuthParams = (redirectPath?: string): string => {
  const params = new URLSearchParams({ appOrigin: window.location.origin });
  if (redirectPath) params.set("redirectPath", redirectPath);
  return params.toString();
};

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
        url: `/api/google/auth-url${redirectPath ? `?redirectPath=${encodeURIComponent(redirectPath)}` : ""}`,
        method: "GET",
      }),
    }),
    getMicrosoftAuthUrl: builder.query<{ data: { authorizationUrl: string } }, string>({
      query: (redirectPath) => ({
        url: `/api/microsoft/auth-url${redirectPath ? `?redirectPath=${encodeURIComponent(redirectPath)}` : ""}`,
        method: "GET",
      }),
    }),
    // Calendars are personal connections, separate from Google Drive and OneDrive.
    // The web runs on more than one domain. Google and Microsoft must send the
    // user back to this one, where their session is.
    getGoogleCalendarAuthUrl: builder.query<ApiResponseCalendarAuthUrl, string>({
      query: (redirectPath) => ({
        url: `/api/calendar/google/auth-url?${calendarAuthParams(redirectPath)}`,
        method: "GET",
      }),
    }),
    getOutlookCalendarAuthUrl: builder.query<ApiResponseCalendarAuthUrl, string>({
      query: (redirectPath) => ({
        url: `/api/calendar/outlook/auth-url?${calendarAuthParams(redirectPath)}`,
        method: "GET",
      }),
    }),
    // The consent screen sends the browser back to the web app with a code.
    // Posting it with the user's session ties the calendar to that user.
    connectCalendar: builder.mutation<
      ApiResponseCalendarConnect,
      { provider: "google" | "outlook" } & CalendarConnectRequest
    >({
      query: ({ provider, ...body }) => ({
        url: `/api/calendar/${provider}/connect`,
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Integration" as const, id: "LIST" }],
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
    setGoogleDefaultFolder: builder.mutation<
      { status: number; data: null },
      { folderId: string; folderName: string }
    >({
      query: (body) => ({
        url: "/api/google/default-folder",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Integration" as const, id: "LIST" },
        { type: "Integration" as const, id: "GOOGLE_DRIVE" },
      ],
    }),
    setMicrosoftDefaultFolder: builder.mutation<
      { status: number; data: null },
      { folderId: string; folderName: string }
    >({
      query: (body) => ({
        url: "/api/microsoft/default-folder",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Integration" as const, id: "LIST" },
        { type: "Integration" as const, id: "ONEDRIVE" },
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
  useLazyGetMicrosoftAuthUrlQuery,
  useLazyGetGoogleCalendarAuthUrlQuery,
  useLazyGetOutlookCalendarAuthUrlQuery,
  useConnectCalendarMutation,
  useDisconnectIntegrationMutation,
  useSetGoogleDefaultFolderMutation,
  useSetMicrosoftDefaultFolderMutation,
} = integrationApi;
