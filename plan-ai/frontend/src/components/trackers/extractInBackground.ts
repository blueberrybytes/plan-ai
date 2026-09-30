import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { trackersApi } from "../../store/apis/trackersApi";
import { reportUnexpectedError } from "../../utils/reportError";
import { localToday } from "./trackerUtils";

/**
 * Reads a note with AI without waiting for the answer. Used when the user
 * leaves a note they edited. The user is not told about errors, they can
 * still press "Log to trackers" later. Unexpected ones go to Sentry.
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
    .catch((error: unknown) => {
      reportUnexpectedError("trackers.extractInBackground", error, { noteId });
    })
    .finally(() => request.reset());
};
