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
    getWorkspaceSummary: builder.query<WorkspaceUserUsageSummary[], void>({
      query: () => ({
        url: "/api/ai-usage/workspace-summary",
        method: "GET",
      }),
      providesTags: ["AiUsage"],
      transformResponse: (response: ApiResponseWorkspaceUserUsageSummary) => response.data || [],
    }),
  }),
});

export const { useGetUsageMetricsQuery, useGetAiPricingQuery, useGetWorkspaceSummaryQuery } =
  aiUsageApi;
