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
      providesTags: ["ChatThread"],
    }),
    getThread: builder.query<ChatThread & { messages: ChatMessage[] }, string>({
      query: (threadId: string) => `/api/chat/threads/${threadId}`,
      providesTags: (
        _result: (ChatThread & { messages: ChatMessage[] }) | undefined,
        _error: unknown,
        id: string,
      ) => [{ type: "ChatThread", id }],
    }),
    createThread: builder.mutation<ChatThread, { title?: string; contextIds: string[] }>({
      query: (body: { title?: string; contextIds: string[] }) => ({
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
      invalidatesTags: (
        _result: { message: ChatMessage; response: ChatMessage } | undefined,
        _error: unknown,
        { threadId }: { threadId: string },
      ) => [{ type: "ChatThread", id: threadId }],
    }),
  }),
});

export const {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
  useSendMessageMutation,
} = chatApi;
