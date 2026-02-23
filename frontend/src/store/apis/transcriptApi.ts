import { baseQueryWithReauth } from "../../utils/baseQuery";
import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";

type ApiResponseStandaloneTranscriptListResponse =
  components["schemas"]["ApiResponse_StandaloneTranscriptListResponse_"];
type ApiResponseStandaloneTranscriptResponse =
  components["schemas"]["ApiResponse_StandaloneTranscriptResponse_"];

export const transcriptApi = createApi({
  reducerPath: "transcriptApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Transcript"],
  endpoints: (builder) => ({
    listGlobalTranscripts: builder.query<
      ApiResponseStandaloneTranscriptListResponse,
      {
        page?: number;
        pageSize?: number;
        source?: "UPLOAD" | "RECORDING" | "ZOOM" | "GMEET" | "TEAMS";
      }
    >({
      query: (params: {
        page?: number;
        pageSize?: number;
        source?: "UPLOAD" | "RECORDING" | "ZOOM" | "GMEET" | "TEAMS";
      }) => ({
        url: "/api/transcripts",
        params,
      }),
      providesTags: ["Transcript"],
    }),
    getTranscript: builder.query<ApiResponseStandaloneTranscriptResponse, string>({
      query: (id: string) => `/api/transcripts/${id}`,
      providesTags: (_result, _error, id: string) => [{ type: "Transcript", id }],
    }),
    deleteTranscript: builder.mutation<{ success: boolean }, string>({
      query: (id: string) => ({
        url: `/api/transcripts/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Transcript"],
    }),
  }),
});

export const { useListGlobalTranscriptsQuery, useGetTranscriptQuery, useDeleteTranscriptMutation } =
  transcriptApi;
