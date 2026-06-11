import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { components } from "../../types/api";

export type AsanaManualConnectRequest = components["schemas"]["AsanaManualConnectRequest"];
export type AsanaSummaryResponse = components["schemas"]["AsanaSummaryResponse"];
export type AsanaProjectItem = components["schemas"]["AsanaProjectItem"];

export const asanaApi = createApi({
  reducerPath: "asanaApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AsanaIntegration"],
  endpoints: (builder) => ({
    connectAsanaManually: builder.mutation<{ data: null }, AsanaManualConnectRequest>({
      query: (body: AsanaManualConnectRequest) => ({
        url: "/api/asana/manual-connect",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AsanaIntegration"],
    }),
    getAsanaSummary: builder.query<{ data: AsanaSummaryResponse }, void>({
      query: () => ({
        url: "/api/asana/summary",
        method: "GET",
      }),
      providesTags: ["AsanaIntegration"],
    }),
    getAsanaProjects: builder.query<{ data: AsanaProjectItem[] }, void>({
      query: () => ({
        url: "/api/asana/projects",
        method: "GET",
      }),
      providesTags: ["AsanaIntegration"],
    }),
    setAsanaDefaultProject: builder.mutation<{ data: null }, { projectGid: string }>({
      query: (body) => ({
        url: "/api/asana/default-project",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AsanaIntegration"],
    }),
    getAsanaAuthUrl: builder.query<{ data: { authorizationUrl: string } }, void>({
      query: () => ({
        url: "/api/asana/auth",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useConnectAsanaManuallyMutation,
  useGetAsanaSummaryQuery,
  useGetAsanaProjectsQuery,
  useSetAsanaDefaultProjectMutation,
  useLazyGetAsanaAuthUrlQuery,
} = asanaApi;
