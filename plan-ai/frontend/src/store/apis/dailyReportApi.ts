import { createApi } from "@reduxjs/toolkit/query/react";
import type { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { taskApi } from "./taskApi";

export type DailyReportStatus = components["schemas"]["DailyReportStatusResponse"];
export type DailyReportSettingsRequest = components["schemas"]["DailyReportSettingsRequest"];
export type TaskUpdateProposal = components["schemas"]["TaskUpdateProposalResponse"];
export type TaskUpdateKind = components["schemas"]["TaskUpdateKindValue"];
export type DailyReportExtractResponse = components["schemas"]["DailyReportExtractResponse"];
export type ReviewProposalItem = components["schemas"]["ReviewProposalItem"];
export type ReviewProposalsResponse = components["schemas"]["ReviewProposalsResponse"];
export type TeamReport = components["schemas"]["TeamReportResponse"];
export type TeamReportMember = components["schemas"]["TeamReportMemberResponse"];
export type TeamReportTask = components["schemas"]["TeamReportTaskResponse"];
export type ProposalsParams = NonNullable<
  operations["ListDailyReportProposals"]["parameters"]["query"]
>;
export type TeamReportParams = NonNullable<operations["GetTeamReport"]["parameters"]["query"]>;

const STATUS = { type: "DailyReportStatus" as const, id: "CURRENT" };
const PROPOSALS = { type: "TaskUpdateProposal" as const, id: "LIST" };
const TEAM = { type: "TeamReport" as const, id: "LIST" };

export const dailyReportApi = createApi({
  reducerPath: "dailyReportApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["DailyReportStatus", "TaskUpdateProposal", "TeamReport"],
  endpoints: (builder) => ({
    getDailyReportStatus: builder.query<DailyReportStatus, void>({
      query: () => "/api/daily-report/status",
      providesTags: [STATUS],
    }),

    /** Owners and admins turn it on or off and set the reminder time. */
    updateDailyReportSettings: builder.mutation<DailyReportStatus, DailyReportSettingsRequest>({
      query: (body) => ({ url: "/api/daily-report/settings", method: "PATCH", body }),
      invalidatesTags: [STATUS, TEAM],
    }),

    /** true accepts the text, false withdraws the consent. */
    setDailyReportConsent: builder.mutation<DailyReportStatus, boolean>({
      query: (accept) => ({ url: "/api/daily-report/consent", method: "POST", body: { accept } }),
      invalidatesTags: [STATUS, PROPOSALS],
    }),

    /** Reads the day note with AI. The proposals wait for the member. */
    extractDailyReport: builder.mutation<DailyReportExtractResponse, string>({
      query: (noteId) => ({ url: "/api/daily-report/extract", method: "POST", body: { noteId } }),
      invalidatesTags: [PROPOSALS],
    }),

    listDailyReportProposals: builder.query<TaskUpdateProposal[], ProposalsParams>({
      query: (params) => ({ url: "/api/daily-report/proposals", method: "GET", params }),
      providesTags: [PROPOSALS],
    }),

    reviewDailyReportProposals: builder.mutation<ReviewProposalsResponse, ReviewProposalItem[]>({
      query: (items) => ({
        url: "/api/daily-report/proposals/review",
        method: "POST",
        body: { items },
      }),
      invalidatesTags: [PROPOSALS, TEAM],
      // Accepting changes or creates tasks, so the boards must refetch.
      async onQueryStarted(_items, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(taskApi.util.invalidateTags(["Task"]));
        } catch {
          // The caller shows the error.
        }
      },
    }),

    getTeamReport: builder.query<TeamReport, TeamReportParams>({
      query: (params) => ({ url: "/api/daily-report/team", method: "GET", params }),
      providesTags: [TEAM],
    }),
  }),
});

export const {
  useGetDailyReportStatusQuery,
  useUpdateDailyReportSettingsMutation,
  useSetDailyReportConsentMutation,
  useExtractDailyReportMutation,
  useListDailyReportProposalsQuery,
  useReviewDailyReportProposalsMutation,
  useGetTeamReportQuery,
  useLazyGetTeamReportQuery,
} = dailyReportApi;
