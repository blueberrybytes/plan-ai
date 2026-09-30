import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { trackersApi } from "../../store/apis/trackersApi";
import { localToday } from "./trackerUtils";

/**
 * Reads a note with AI without waiting for the answer. Used when the user
 * leaves a note they edited; errors are ignored, the user can still press
 * "Log to trackers" later.
 */
export const extractInBackground = (
  dispatch: ThunkDispatch<unknown, unknown, UnknownAction>,
  noteId: string,
): void => {
  const request = dispatch(
    trackersApi.endpoints.extractTrackerEntries.initiate({ noteId, today: localToday() }),
  );
  request
    .unwrap()
    .catch(() => undefined)
    .finally(() => request.reset());
};
