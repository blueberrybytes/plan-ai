import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type DashboardAnalytics = components["schemas"]["DashboardAnalytics"];

export const analyticsApi = createApi({
  reducerPath: "analyticsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Analytics"],
  endpoints: (builder) => ({
    getDashboardAnalytics: builder.query<DashboardAnalytics, "7d" | "30d" | "90d" | "all">({
      query: (period) => ({
        url: `/api/analytics/dashboard?period=${period}`,
        method: "GET",
      }),
      providesTags: ["Analytics"],
    }),
  }),
});

export const { useGetDashboardAnalyticsQuery } = analyticsApi;
