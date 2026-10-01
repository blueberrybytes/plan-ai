import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type AiUsageMetricsResponse = components["schemas"]["AiUsageMetricsResponse"];
export type ApiResponseAiUsageMetricsResponse =
  components["schemas"]["ApiResponse_AiUsageMetricsResponse_"];

export type ApiResponseAiPricingResponse =
  components["schemas"]["ApiResponse__models_58__id-string--promptPrice-number--completionPrice-number--maxTokens-number-or-null_-Array__"];
export type AiPricingResponse = ApiResponseAiPricingResponse["data"];

export type WorkspaceUserUsageSummary = components["schemas"]["WorkspaceUserUsageSummary"];
export type ApiResponseWorkspaceUserUsageSummary =
  components["schemas"]["ApiResponse_WorkspaceUserUsageSummary-Array_"];

export type AdminUserUsageSummary = components["schemas"]["AdminUserUsageSummary"];
export type ApiResponseAdminUserUsageSummary =
  components["schemas"]["ApiResponse_AdminUserUsageSummary-Array_"];

export const aiUsageApi = createApi({
  reducerPath: "aiUsageApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AiUsage"],
  endpoints: (builder) => ({
    getUsageMetrics: builder.query<
      AiUsageMetricsResponse,
      {
        page?: number;
        limit?: number;
        feature?: string;
        provider?: string;
        model?: string;
        targetUserId?: string;
        currentMonthOnly?: boolean;
        /** "YYYY-MM" for one month, "30d" for the last 30 days. Omit for all time. */
        period?: string;
        workspaceId?: string; // Client-side cache busting
      }
    >({
      query: (params) => {
        // Strip workspaceId from the actual URL params since backend uses the header
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { workspaceId, ...restParams } = params;
        return {
          url: "/api/ai-usage",
          method: "GET",
          params: restParams,
        };
      },
      providesTags: ["AiUsage"],
      transformResponse: (response: ApiResponseAiUsageMetricsResponse) =>
        response.data as AiUsageMetricsResponse,
    }),
    getAiPricing: builder.query<AiPricingResponse, void>({
      query: () => ({
        url: "/api/ai-usage/pricing",
        method: "GET",
      }),
      providesTags: ["AiUsage"],
      transformResponse: (response: ApiResponseAiPricingResponse) => response.data,
    }),
    getWorkspaceSummary: builder.query<WorkspaceUserUsageSummary[], { period?: string } | void>({
      query: (params) => ({
        url: "/api/ai-usage/workspace-summary",
        method: "GET",
        params: params?.period ? { period: params.period } : undefined,
      }),
      providesTags: ["AiUsage"],
      transformResponse: (response: ApiResponseWorkspaceUserUsageSummary) => response.data || [],
    }),
    getAdminRecentUsage: builder.query<AdminUserUsageSummary[], { period?: string }>({
      query: ({ period }) => ({
        url: "/api/ai-usage/admin/recent",
        method: "GET",
        params: period ? { period } : undefined,
      }),
      providesTags: ["AiUsage"],
      transformResponse: (response: ApiResponseAdminUserUsageSummary) => response.data || [],
    }),
  }),
});

export const {
  useGetUsageMetricsQuery,
  useGetAiPricingQuery,
  useGetWorkspaceSummaryQuery,
  useGetAdminRecentUsageQuery,
} = aiUsageApi;
