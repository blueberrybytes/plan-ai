import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../utils/baseQuery";

import { components } from "../../types/api";

export type CustomThemePayload = components["schemas"]["CustomThemePayload"];
export type BrandThemePayload = components["schemas"]["BrandThemePayload"];
export interface OnboardingCompleteRequest {
  uiTheme: CustomThemePayload;
  workspaceName?: string;
  brandTheme?: BrandThemePayload;
  openRouterKey?: string;
  deepgramKey?: string;
}

export interface OnboardingApiResponse {
  status: number;
  data: {
    success: boolean;
    role: string;
  };
}

export const onboardingApi = createApi({
  reducerPath: "onboardingApi",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    completeOnboarding: builder.mutation<OnboardingApiResponse, OnboardingCompleteRequest>({
      query: (body) => ({
        url: "api/onboarding/complete",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useCompleteOnboardingMutation } = onboardingApi;
