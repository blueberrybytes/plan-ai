import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import type { components } from "../../types/api";

type TrelloManualConnectRequest = components["schemas"]["TrelloManualConnectRequest"];
type TrelloSummaryResponse = components["schemas"]["TrelloSummaryResponse"];
type TrelloBoardItem = components["schemas"]["TrelloBoardItem"];
type TrelloListItem = components["schemas"]["TrelloListItem"];

export const trelloApi = createApi({
  reducerPath: "trelloApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["TrelloSummary", "TrelloBoards", "TrelloLists"],
  endpoints: (builder) => ({
    connectTrelloManually: builder.mutation<{ data: null }, TrelloManualConnectRequest>({
      query: (body: TrelloManualConnectRequest) => ({
        url: "/api/trello/manual-connect",
        method: "POST",
        body,
      }),
      invalidatesTags: ["TrelloSummary", "TrelloBoards"],
    }),
    getTrelloSummary: builder.query<{ data: TrelloSummaryResponse }, void>({
      query: () => ({
        url: "/api/trello/summary",
        method: "GET",
      }),
      providesTags: ["TrelloSummary"],
    }),
    getTrelloBoards: builder.query<{ data: TrelloBoardItem[] }, void>({
      query: () => ({
        url: "/api/trello/boards",
        method: "GET",
      }),
      providesTags: ["TrelloBoards"],
    }),
    getTrelloLists: builder.query<{ data: TrelloListItem[] }, string>({
      query: (boardId: string) => ({
        url: `/api/trello/boards/${boardId}/lists`,
        method: "GET",
      }),
      providesTags: ["TrelloLists"],
    }),
    setTrelloDefaultBoardList: builder.mutation<
      { data: null },
      { boardId: string; listId: string }
    >({
      query: (body: { boardId: string; listId: string }) => ({
        url: "/api/trello/default-board-list",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useConnectTrelloManuallyMutation,
  useGetTrelloSummaryQuery,
  useGetTrelloBoardsQuery,
  useGetTrelloListsQuery,
  useSetTrelloDefaultBoardListMutation,
} = trelloApi;
