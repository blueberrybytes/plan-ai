import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type Comment = components["schemas"]["CommentResponse"];
export type CommentList = components["schemas"]["CommentListResponse"];
export type CommentMention = components["schemas"]["CommentMentionResponse"];
export type CreateCommentRequest = components["schemas"]["CreateCommentRequest"];

/** The task or the meeting a thread hangs from. Exactly one of the two. */
export type CommentThreadTarget = { taskId: string } | { transcriptId: string };

const threadId = (target: CommentThreadTarget): string =>
  "taskId" in target ? `task:${target.taskId}` : `meeting:${target.transcriptId}`;

const threadTag = (target: CommentThreadTarget) => [
  { type: "CommentThread" as const, id: threadId(target) },
];

export const commentApi = createApi({
  reducerPath: "commentApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["CommentThread"],
  endpoints: (builder) => ({
    listComments: builder.query<CommentList, CommentThreadTarget>({
      query: (target) => ({ url: "/api/comments", method: "GET", params: target }),
      providesTags: (_result, _error, target) => threadTag(target),
    }),

    createComment: builder.mutation<
      Comment,
      { target: CommentThreadTarget; body: string; atSeconds?: number | null }
    >({
      query: ({ target, body, atSeconds }) => ({
        url: "/api/comments",
        method: "POST",
        body: { ...target, body, atSeconds } satisfies CreateCommentRequest,
      }),
      invalidatesTags: (_result, _error, { target }) => threadTag(target),
    }),

    updateComment: builder.mutation<
      Comment,
      { target: CommentThreadTarget; id: string; body: string }
    >({
      query: ({ id, body }) => ({
        url: `/api/comments/${encodeURIComponent(id)}`,
        method: "PATCH",
        body: { body },
      }),
      invalidatesTags: (_result, _error, { target }) => threadTag(target),
    }),

    deleteComment: builder.mutation<
      { success: boolean },
      { target: CommentThreadTarget; id: string }
    >({
      query: ({ id }) => ({ url: `/api/comments/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, { target }) => threadTag(target),
    }),
  }),
});

export const {
  useListCommentsQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
} = commentApi;
