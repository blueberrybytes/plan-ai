import { baseQueryWithReauth } from "../../utils/baseQuery";
import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";

type ApiResponseStandaloneTranscriptListResponse =
  components["schemas"]["ApiResponse_StandaloneTranscriptListResponse_"];
type ApiResponseStandaloneTranscriptResponse =
  components["schemas"]["ApiResponse_StandaloneTranscriptResponse_"];
type UpdateSpeakerNamesBody = components["schemas"]["UpdateSpeakerNamesBody"];
type ApiResponseTranscriptAudio = components["schemas"]["ApiResponse_TranscriptAudioResponse_"];
export type SendMeetingNotesRequest = components["schemas"]["SendMeetingNotesRequest"];
export type ApiResponseSendMeetingNotes =
  components["schemas"]["ApiResponse_SendMeetingNotesResponse_"];
export type TranscriptTranslation = components["schemas"]["TranscriptTranslationResult"];
type ApiResponseTranscriptTranslation =
  components["schemas"]["ApiResponse_TranscriptTranslationResponse_"];
type TranslateTranscriptRequest = components["schemas"]["TranslateTranscriptRequest"];
export type TranscriptPersonalData = components["schemas"]["TranscriptPersonalData"];
type ApiResponseTranscriptPersonalData =
  components["schemas"]["ApiResponse_TranscriptPersonalDataResponse_"];

export const transcriptApi = createApi({
  reducerPath: "transcriptApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Transcript", "TranscriptAudio"],
  endpoints: (builder) => ({
    listGlobalTranscripts: builder.query<
      ApiResponseStandaloneTranscriptListResponse,
      {
        page?: number;
        pageSize?: number;
        source?: "UPLOAD" | "RECORDING" | "ZOOM" | "GMEET" | "TEAMS";
        q?: string;
        /** Scope to one project. Server-side, so it spans every page. */
        projectId?: string;
        sentiment?: string;
        /** "all_dates" | "today" | "week" — applied server-side. */
        dateFilter?: string;
        /** List view: rows carry a 300-character preview instead of the full text. */
        lite?: boolean;
      }
    >({
      query: (params) => ({
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
    retryPostMeetingTask: builder.mutation<
      { success: boolean },
      {
        transcriptId: string;
        kind: components["schemas"]["PostMeetingTaskKind"];
      }
    >({
      query: ({ transcriptId, kind }) => ({
        url: `/api/transcripts/${transcriptId}/post-meeting-tasks/${kind}/retry`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { transcriptId }) => [
        { type: "Transcript", id: transcriptId },
      ],
    }),
    // Corrects AI-inferred speaker names. Maps the stable diarization label
    // ("Speaker 0") to the corrected human name; blank clears it. Invalidates
    // the detail tag so open views refetch the patched metadata.speakers.
    updateTranscriptSpeakers: builder.mutation<
      ApiResponseStandaloneTranscriptResponse,
      { id: string; overrides: UpdateSpeakerNamesBody["overrides"] }
    >({
      query: ({ id, overrides }) => ({
        url: `/api/transcripts/${id}/speakers`,
        method: "PUT",
        body: { overrides } satisfies UpdateSpeakerNamesBody,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Transcript", id }],
    }),
    // Short-lived links to the meeting audio, signed for 12 h. The player asks
    // again after an hour and when a link stops working.
    getTranscriptAudio: builder.query<ApiResponseTranscriptAudio, string>({
      query: (id: string) => `/api/transcripts/${id}/audio`,
      providesTags: (_result, _error, id: string) => [{ type: "TranscriptAudio", id }],
      keepUnusedDataFor: 60 * 60,
    }),
    // Emails the notes to the people the user picked. Replies go to the user.
    sendMeetingNotes: builder.mutation<
      ApiResponseSendMeetingNotes,
      { id: string } & SendMeetingNotesRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/api/transcripts/${id}/send-notes`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Transcript", id }],
    }),
    deleteTranscriptAudio: builder.mutation<{ success: boolean }, string>({
      query: (id: string) => ({
        url: `/api/transcripts/${id}/audio`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: "TranscriptAudio", id },
        { type: "Transcript", id },
      ],
    }),
    reprocessTranscript: builder.mutation<ApiResponseStandaloneTranscriptResponse, string>({
      query: (id: string) => ({
        url: `/api/transcripts/${id}/reprocess`,
        method: "POST",
      }),
      // Invalidate so the detail view refetches and reflects the re-queued
      // PENDING status (and any active polling picks it up).
      invalidatesTags: (_result, _error, id: string) => [{ type: "Transcript", id }, "Transcript"],
    }),
    // Found with rules on the server each time; follows the transcript's cache.
    getTranscriptPersonalData: builder.query<ApiResponseTranscriptPersonalData, string>({
      query: (id) => `/api/transcripts/${id}/personal-data`,
      providesTags: (_result, _error, id) => [{ type: "Transcript", id }],
    }),
    // The first call for a language runs the model; later ones return the
    // stored copy. Changes nothing on the transcript, so no tags.
    translateTranscript: builder.mutation<
      ApiResponseTranscriptTranslation,
      { id: string; body: TranslateTranscriptRequest }
    >({
      query: ({ id, body }) => ({
        url: `/api/transcripts/${id}/translate`,
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useListGlobalTranscriptsQuery,
  useGetTranscriptQuery,
  useDeleteTranscriptMutation,
  useUpdateTranscriptSpeakersMutation,
  useRetryPostMeetingTaskMutation,
  useReprocessTranscriptMutation,
  useTranslateTranscriptMutation,
  useGetTranscriptPersonalDataQuery,
  useGetTranscriptAudioQuery,
  useDeleteTranscriptAudioMutation,
  useSendMeetingNotesMutation,
} = transcriptApi;
