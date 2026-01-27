import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  userId: string;
  title: string;
  contextIds: string[];
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

export const chatApi = createApi({
  reducerPath: "chatApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["ChatThread"],
  endpoints: (builder) => ({
    listThreads: builder.query<ChatThread[], void>({
      query: () => "/api/chat/threads",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "ChatThread" as const, id })),
              { type: "ChatThread", id: "LIST" },
            ]
          : [{ type: "ChatThread", id: "LIST" }],
    }),
    getThread: builder.query<ChatThread & { messages: ChatMessage[] }, string>({
      query: (threadId: string) => `/api/chat/threads/${threadId}`,
      providesTags: (result, error, id) => [{ type: "ChatThread", id }],
    }),
    createThread: builder.mutation<ChatThread, { title?: string; contextIds: string[] }>({
      query: (body) => ({
        url: "/api/chat/threads",
        method: "POST",
        body,
      }),
      invalidatesTags: ["ChatThread"],
    }),
    sendMessage: builder.mutation<
      { message: ChatMessage; response: ChatMessage },
      { threadId: string; content: string }
    >({
      query: ({ threadId, content }: { threadId: string; content: string }) => ({
        url: `/api/chat/threads/${threadId}/messages`,
        method: "POST",
        body: { content },
      }),
      invalidatesTags: (result, error, { threadId }) => [{ type: "ChatThread", id: threadId }],
    }),
    updateThread: builder.mutation<
      ChatThread,
      { threadId: string; title?: string; contextIds?: string[] }
    >({
      query: ({ threadId, ...body }) => ({
        url: `/api/chat/threads/${threadId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { threadId }) => [
        "ChatThread",
        { type: "ChatThread", id: threadId },
      ],
    }),
    deleteThread: builder.mutation<{ success: boolean }, string>({
      query: (threadId) => ({
        url: `/api/chat/threads/${threadId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, threadId) => [
        "ChatThread",
        { type: "ChatThread", id: threadId },
      ],
    }),
  }),
});

export const {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
  useSendMessageMutation,
  useUpdateThreadMutation,
  useDeleteThreadMutation,
} = chatApi;
