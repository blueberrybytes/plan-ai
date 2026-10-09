import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type WebhookEndpoint = components["schemas"]["WebhookEndpointResponse"];
export type WebhookEndpointSecret = components["schemas"]["WebhookEndpointSecretResponse"];
export type WebhookDelivery = components["schemas"]["WebhookDeliveryResponse"];
export type CreateWebhookEndpointRequest = components["schemas"]["CreateWebhookEndpointRequest"];
export type UpdateWebhookEndpointRequest = components["schemas"]["UpdateWebhookEndpointRequest"];
type EndpointList = components["schemas"]["WebhookEndpointListResponse"];
type DeliveryList = components["schemas"]["WebhookDeliveryListResponse"];
type Queued = components["schemas"]["WebhookQueuedResponse"];

const LIST = { type: "WebhookEndpoint" as const, id: "LIST" };
const deliveriesOf = (endpointId: string) => ({
  type: "WebhookDelivery" as const,
  id: endpointId,
});

export const webhookApi = createApi({
  reducerPath: "webhookApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["WebhookEndpoint", "WebhookDelivery"],
  endpoints: (builder) => ({
    // The workspace id is not sent (the request header carries it). It keeps
    // the cached list of one workspace apart from another's.
    listWebhookEndpoints: builder.query<EndpointList, string>({
      query: () => ({ url: "/api/webhooks", method: "GET" }),
      providesTags: [LIST],
    }),
    createWebhookEndpoint: builder.mutation<WebhookEndpointSecret, CreateWebhookEndpointRequest>({
      query: (body) => ({ url: "/api/webhooks", method: "POST", body }),
      invalidatesTags: [LIST],
    }),
    updateWebhookEndpoint: builder.mutation<
      WebhookEndpoint,
      { endpointId: string; body: UpdateWebhookEndpointRequest }
    >({
      query: ({ endpointId, body }) => ({
        url: `/api/webhooks/${endpointId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [LIST],
    }),
    rotateWebhookSecret: builder.mutation<WebhookEndpointSecret, string>({
      query: (endpointId) => ({ url: `/api/webhooks/${endpointId}/rotate-secret`, method: "POST" }),
    }),
    deleteWebhookEndpoint: builder.mutation<void, string>({
      query: (endpointId) => ({ url: `/api/webhooks/${endpointId}`, method: "DELETE" }),
      invalidatesTags: [LIST],
    }),
    listWebhookDeliveries: builder.query<DeliveryList, string>({
      query: (endpointId) => ({ url: `/api/webhooks/${endpointId}/deliveries`, method: "GET" }),
      providesTags: (_result, _error, endpointId) => [deliveriesOf(endpointId)],
    }),
    sendWebhookTestEvent: builder.mutation<Queued, string>({
      query: (endpointId) => ({ url: `/api/webhooks/${endpointId}/test`, method: "POST" }),
      invalidatesTags: (_result, _error, endpointId) => [deliveriesOf(endpointId)],
    }),
    redeliverWebhook: builder.mutation<Queued, { endpointId: string; deliveryId: string }>({
      query: ({ deliveryId }) => ({
        url: `/api/webhooks/deliveries/${deliveryId}/redeliver`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { endpointId }) => [deliveriesOf(endpointId)],
    }),
  }),
});

export const {
  useListWebhookEndpointsQuery,
  useCreateWebhookEndpointMutation,
  useUpdateWebhookEndpointMutation,
  useRotateWebhookSecretMutation,
  useDeleteWebhookEndpointMutation,
  useListWebhookDeliveriesQuery,
  useSendWebhookTestEventMutation,
  useRedeliverWebhookMutation,
} = webhookApi;
