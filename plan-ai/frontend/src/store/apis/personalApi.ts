import { createApi } from "@reduxjs/toolkit/query/react";
import type { components } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";
import { workspaceApi } from "./workspaceApi";
import { trackersApi } from "./trackersApi";

export type PersonalStatus = components["schemas"]["PersonalStatusResponse"];
export type EnablePersonalRequest = components["schemas"]["EnablePersonalRequest"];
export type PersonalSettingsRequest = components["schemas"]["PersonalSettingsRequest"];

/** Consent changes what the tracker routes answer, so every tracker query loads again. */
const TRACKER_TAGS = ["Tracker", "TrackerStats", "TrackerEntry"] as const;

/**
 * Personal mode is user level: it does not change with the active workspace,
 * so this cache is not flushed on a workspace switch.
 */
export const personalApi = createApi({
  reducerPath: "personalApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Personal"],
  endpoints: (builder) => ({
    getPersonalStatus: builder.query<PersonalStatus, void>({
      query: () => "/api/personal",
      providesTags: ["Personal"],
    }),

    /** Records consent and creates the personal workspace the first time. */
    enablePersonalMode: builder.mutation<PersonalStatus, EnablePersonalRequest>({
      query: (body) => ({ url: "/api/personal/enable", method: "POST", body }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(personalApi.util.upsertQueryData("getPersonalStatus", undefined, data));
          dispatch(workspaceApi.util.invalidateTags(["Workspace"]));
          dispatch(trackersApi.util.invalidateTags([...TRACKER_TAGS]));
        } catch {
          // The caller shows the error.
        }
      },
    }),

    updatePersonalSettings: builder.mutation<PersonalStatus, PersonalSettingsRequest>({
      query: (body) => ({ url: "/api/personal/settings", method: "PATCH", body }),
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          personalApi.util.updateQueryData("getPersonalStatus", undefined, (draft) => {
            Object.assign(draft, body);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(personalApi.util.upsertQueryData("getPersonalStatus", undefined, data));
        } catch {
          patch.undo();
        }
      },
    }),

    /** Deletes every tracker and entry of the user. Notes stay. */
    withdrawPersonalConsent: builder.mutation<PersonalStatus, void>({
      query: () => ({ url: "/api/personal/withdraw-consent", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(personalApi.util.upsertQueryData("getPersonalStatus", undefined, data));
          dispatch(trackersApi.util.invalidateTags([...TRACKER_TAGS]));
        } catch {
          // The caller shows the error.
        }
      },
    }),
  }),
});

export const {
  useGetPersonalStatusQuery,
  useEnablePersonalModeMutation,
  useUpdatePersonalSettingsMutation,
  useWithdrawPersonalConsentMutation,
} = personalApi;
