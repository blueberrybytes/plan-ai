import { createApi } from "@reduxjs/toolkit/query/react";
import { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type AiModelResponse = components["schemas"]["AiModelResponse"];

export const aiApi = createApi({
  reducerPath: "aiApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["AiModel"],
  endpoints: (builder) => ({
    getModels: builder.query<AiModelResponse[], void>({
      query: () => ({
        url: "/api/ai/models",
        method: "GET",
      }),
      providesTags: ["AiModel"],
    }),
  }),
});

export const { useGetModelsQuery } = aiApi;
