import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type LinearManualConnectRequest = components["schemas"]["LinearManualConnectRequest"];
export type LinearSummaryResponse = components["schemas"]["LinearSummaryResponse"];

export const linearApi = createApi({
  reducerPath: "linearApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["LinearIntegration"],
  endpoints: (builder) => ({
    connectLinearManually: builder.mutation<{ data: null }, LinearManualConnectRequest>({
      query: (body: LinearManualConnectRequest) => ({
        url: "/api/linear/manual-connect",
        method: "POST",
        body,
      }),
      invalidatesTags: ["LinearIntegration"],
    }),
    getLinearSummary: builder.query<{ data: LinearSummaryResponse }, void>({
      query: () => ({
        url: "/api/linear/summary",
        method: "GET",
      }),
      providesTags: ["LinearIntegration"],
    }),
    getLinearTeams: builder.query<{ data: { id: string; name: string }[] }, void>({
      query: () => ({
        url: "/api/linear/teams",
        method: "GET",
      }),
      providesTags: ["LinearIntegration"],
    }),
    setLinearDefaultTeam: builder.mutation<{ data: null }, { teamId: string }>({
      query: (body) => ({
        url: "/api/linear/default-team",
        method: "POST",
        body,
      }),
      invalidatesTags: ["LinearIntegration"],
    }),
    getLinearAuthUrl: builder.query<{ data: { authorizationUrl: string } }, void>({
      query: () => ({
        url: "/api/linear/auth-url",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useConnectLinearManuallyMutation,
  useGetLinearSummaryQuery,
  useGetLinearTeamsQuery,
  useSetLinearDefaultTeamMutation,
  useLazyGetLinearAuthUrlQuery,
} = linearApi;
