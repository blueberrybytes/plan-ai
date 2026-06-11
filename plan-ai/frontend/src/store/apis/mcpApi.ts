import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export interface McpTokenItem {
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateMcpTokenResponse {
  rawToken: string;
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  createdAt: string;
}

export const mcpApi = createApi({
  reducerPath: "mcpApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["McpToken"],
  endpoints: (builder) => ({
    listMcpTokens: builder.query<{ tokens: McpTokenItem[] }, void>({
      query: () => ({ url: "/api/mcp-tokens", method: "GET" }),
      providesTags: [{ type: "McpToken" as const, id: "LIST" }],
    }),
    createMcpToken: builder.mutation<CreateMcpTokenResponse, { name: string; workspaceId: string }>(
      {
        query: (body) => ({ url: "/api/mcp-tokens", method: "POST", body }),
        invalidatesTags: [{ type: "McpToken" as const, id: "LIST" }],
      },
    ),
    revokeMcpToken: builder.mutation<void, string>({
      query: (tokenId) => ({ url: `/api/mcp-tokens/${tokenId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "McpToken" as const, id: "LIST" }],
    }),
  }),
});

export const { useListMcpTokensQuery, useCreateMcpTokenMutation, useRevokeMcpTokenMutation } =
  mcpApi;
