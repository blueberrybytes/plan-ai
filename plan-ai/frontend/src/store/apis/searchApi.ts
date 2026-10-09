import { createApi } from "@reduxjs/toolkit/query/react";
import type { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type SearchHit = components["schemas"]["SearchHit"];
export type SearchHitType = components["schemas"]["SearchHitType"];
export type GlobalSearchResult = components["schemas"]["GlobalSearchResponse"];
type ApiResponseGlobalSearch = components["schemas"]["ApiResponse_GlobalSearchResponse_"];
export type SearchParams = operations["SearchWorkspace"]["parameters"]["query"];

export const searchApi = createApi({
  reducerPath: "searchApi",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    /** Meetings, tasks, documents and projects of the active workspace. */
    searchWorkspace: builder.query<ApiResponseGlobalSearch, SearchParams>({
      query: (params) => ({ url: "/api/search", method: "GET", params }),
      // Results go stale as people work. A minute is enough to page back.
      keepUnusedDataFor: 60,
    }),
  }),
});

export const { useSearchWorkspaceQuery } = searchApi;
