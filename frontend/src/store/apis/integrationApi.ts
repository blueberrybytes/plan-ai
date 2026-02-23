import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type ApiResponseUserIntegrationSummaryList =
  components["schemas"]["ApiResponse_UserIntegrationSummary-Array_"];
export type ApiResponseUserIntegrationSummary =
  components["schemas"]["ApiResponse_UserIntegrationSummary-or-null_"];
export type IntegrationProviderType = components["schemas"]["IntegrationProvider"];

export const integrationApi = createApi({
  reducerPath: "integrationApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Integration"],
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
          ...integrations.map((integration) => ({
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
  }),
});

export const { useListIntegrationsQuery, useGetIntegrationQuery } = integrationApi;
