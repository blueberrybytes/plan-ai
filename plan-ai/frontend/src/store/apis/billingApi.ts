import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";

/**
 * Note: We don't import these from `components["schemas"]` because the swagger
 * regeneration runs in `yarn update`. Once that lands, you can swap these
 * `interface` declarations for `components["schemas"]["SubscriptionStatusResponse"]`
 * imports — the field shapes are intentionally identical.
 */
export interface SubscriptionStatusResponse {
  active: boolean;
  configured: boolean;
  tier: string;
  status: string | null;
  track: string | null;
  priceId: string | null;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  reason?: "no_subscription" | "expired" | "canceled" | "incomplete" | "over_quota";
}

export interface CatalogEntry {
  priceId: string;
  tier: string;
  track: string;
  key: string;
}

export interface CheckoutResponse {
  url: string;
  sessionId: string;
}

export interface PortalResponse {
  url: string;
}

export interface UsageLimitBucket {
  used: number;
  allowed: number;
  percentage: number;
}

export interface UsageLimitsResponse {
  llm: UsageLimitBucket | null;
  recording: UsageLimitBucket | null;
  generations: UsageLimitBucket | null;
}

export const billingApi = createApi({
  reducerPath: "billingApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Subscription", "Catalog", "UsageLimits"],
  endpoints: (builder) => ({
    getSubscription: builder.query<SubscriptionStatusResponse, void>({
      query: () => ({ url: "/api/billing/subscription" }),
      providesTags: ["Subscription"],
    }),
    getUsageLimits: builder.query<UsageLimitsResponse, void>({
      query: () => ({ url: "/api/billing/usage-limits" }),
      providesTags: ["UsageLimits"],
    }),
    getCatalog: builder.query<{ prices: CatalogEntry[] }, void>({
      query: () => ({ url: "/api/billing/catalog" }),
      providesTags: ["Catalog"],
    }),
    createCheckout: builder.mutation<
      CheckoutResponse,
      { priceId: string; seats?: number }
    >({
      query: (body) => ({
        url: "/api/billing/checkout",
        method: "POST",
        body,
      }),
    }),
    createPortal: builder.mutation<PortalResponse, void>({
      query: () => ({
        url: "/api/billing/portal",
        method: "POST",
      }),
    }),
    syncSession: builder.mutation<{ synced: boolean }, { sessionId: string }>({
      query: (body) => ({
        url: "/api/billing/sync-session",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Subscription"],
    }),
    syncPortal: builder.mutation<{ synced: boolean }, void>({
      query: () => ({
        url: "/api/billing/sync-portal",
        method: "POST",
      }),
      invalidatesTags: ["Subscription"],
    }),
  }),
});

export const {
  useGetSubscriptionQuery,
  useGetUsageLimitsQuery,
  useGetCatalogQuery,
  useCreateCheckoutMutation,
  useCreatePortalMutation,
  useSyncSessionMutation,
  useSyncPortalMutation,
} = billingApi;
