import { createApi } from "@reduxjs/toolkit/query/react";
import type { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type Tracker = components["schemas"]["TrackerResponse"];
export type TrackerInput = components["schemas"]["TrackerInputRequest"];
export type TrackerKind = components["schemas"]["TrackerKindValue"];
export type TrackerAggregation = components["schemas"]["TrackerAggregationValue"];
export type TrackerGoalDirection = components["schemas"]["TrackerGoalDirectionValue"];
export type TrackerPeriod = components["schemas"]["TrackerPeriodValue"];
export type TrackerStats = components["schemas"]["TrackerStatsResponse"];
export type TrackerDay = components["schemas"]["TrackerDayValue"];
export type TrackerEntry = components["schemas"]["TrackerEntryResponse"];
export type TrackerEntryStatus = components["schemas"]["TrackerEntryStatusValue"];
export type AddEntryRequest = components["schemas"]["AddEntryRequest"];
export type UpdateEntryRequest = components["schemas"]["UpdateEntryRequest"];
export type ReviewEntriesRequest = components["schemas"]["ReviewEntriesRequest"];
export type ExtractRequest = components["schemas"]["ExtractRequest"];
export type ExtractResponse = components["schemas"]["ExtractResponse"];
export type StatsParams = operations["GetTrackerStats"]["parameters"]["query"];
export type EntriesParams = NonNullable<operations["ListTrackerEntries"]["parameters"]["query"]>;

const TRACKERS = { type: "Tracker" as const, id: "LIST" };
const STATS = { type: "TrackerStats" as const, id: "LIST" };
const ENTRIES = { type: "TrackerEntry" as const, id: "LIST" };

export const trackersApi = createApi({
  reducerPath: "trackersApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Tracker", "TrackerStats", "TrackerEntry"],
  endpoints: (builder) => ({
    listTrackers: builder.query<Tracker[], { includeArchived?: boolean } | void>({
      query: (params) => ({ url: "/api/trackers", method: "GET", params: params ?? undefined }),
      providesTags: [TRACKERS],
    }),

    getTrackerStats: builder.query<TrackerStats[], StatsParams>({
      query: (params) => ({ url: "/api/trackers/stats", method: "GET", params }),
      providesTags: [STATS],
    }),

    listTrackerEntries: builder.query<TrackerEntry[], EntriesParams>({
      query: (params) => ({ url: "/api/trackers/entries", method: "GET", params }),
      providesTags: [ENTRIES],
    }),

    createTracker: builder.mutation<Tracker, TrackerInput>({
      query: (body) => ({ url: "/api/trackers", method: "POST", body }),
      invalidatesTags: [TRACKERS, STATS],
    }),

    updateTracker: builder.mutation<Tracker, { id: string; patch: TrackerInput }>({
      query: ({ id, patch }) => ({
        url: `/api/trackers/${encodeURIComponent(id)}`,
        method: "PATCH",
        body: patch,
      }),
      // Archiving hides the tracker's entries, and a new goal changes the stats.
      invalidatesTags: [TRACKERS, STATS, ENTRIES],
    }),

    /** Deletes the tracker and all its entries. */
    deleteTracker: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/api/trackers/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: [TRACKERS, STATS, ENTRIES],
    }),

    /** A value typed by the user. It counts at once. */
    addTrackerEntry: builder.mutation<TrackerEntry, { trackerId: string; body: AddEntryRequest }>({
      query: ({ trackerId, body }) => ({
        url: `/api/trackers/${encodeURIComponent(trackerId)}/entries`,
        method: "POST",
        body,
      }),
      invalidatesTags: [STATS, ENTRIES],
    }),

    /** Edits an entry. status CONFIRMED accepts a proposal, REJECTED refuses it. */
    updateTrackerEntry: builder.mutation<TrackerEntry, { id: string; patch: UpdateEntryRequest }>({
      query: ({ id, patch }) => ({
        url: `/api/trackers/entries/${encodeURIComponent(id)}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: [STATS, ENTRIES],
    }),

    deleteTrackerEntry: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/api/trackers/entries/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: [STATS, ENTRIES],
    }),

    /** Accepts or refuses several proposals at once. */
    reviewTrackerEntries: builder.mutation<{ updated: number }, ReviewEntriesRequest>({
      query: (body) => ({ url: "/api/trackers/entries/review", method: "POST", body }),
      invalidatesTags: [STATS, ENTRIES],
    }),

    /** Reads a note or a line of text with AI and proposes entries. */
    extractTrackerEntries: builder.mutation<ExtractResponse, ExtractRequest>({
      query: (body) => ({ url: "/api/trackers/extract", method: "POST", body }),
      invalidatesTags: (_result, error) => (error ? [] : [ENTRIES]),
    }),
  }),
});

export const {
  useListTrackersQuery,
  useGetTrackerStatsQuery,
  useListTrackerEntriesQuery,
  useCreateTrackerMutation,
  useUpdateTrackerMutation,
  useDeleteTrackerMutation,
  useAddTrackerEntryMutation,
  useUpdateTrackerEntryMutation,
  useDeleteTrackerEntryMutation,
  useReviewTrackerEntriesMutation,
  useExtractTrackerEntriesMutation,
} = trackersApi;
