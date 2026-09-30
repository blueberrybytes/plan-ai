import { useCallback, useState } from "react";
import {
  useExtractTrackerEntriesMutation,
  type ExtractResponse,
} from "../../store/apis/trackersApi";
import { apiErrorCode, localToday } from "./trackerUtils";
import { useTrackerToast } from "./useTrackerToast";

/**
 * Asks the AI to read a note or a line of text. The proposals land in the
 * entries cache; this returns the answer, or null on an error.
 */
export const useExtract = () => {
  const [extract, { isLoading }] = useExtractTrackerEntriesMutation();
  const [missingKey, setMissingKey] = useState(false);
  const toast = useTrackerToast();

  const run = useCallback(
    async (input: { noteId: string } | { text: string }): Promise<ExtractResponse | null> => {
      setMissingKey(false);
      try {
        const result = await extract({ ...input, today: localToday() }).unwrap();
        if (result.skipped === "no_trackers") toast.info("trackers.extract.noTrackers");
        else if (result.skipped === "empty") toast.info("trackers.extract.empty");
        else if (result.entries.length === 0) {
          toast.info(
            result.skipped === "unchanged"
              ? "trackers.extract.unchanged"
              : "trackers.extract.nothingFound",
          );
        }
        return result;
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === "missing_api_key") setMissingKey(true);
        else if (code === "consent_outdated") toast.info("trackers.extract.consentOutdated");
        // A 429 already shows a toast from the base query.
        else if ((error as { status?: unknown })?.status !== 429) {
          toast.error(error, "trackers.extract.failed");
        }
        return null;
      }
    },
    [extract, toast],
  );

  return { run, isLoading, missingKey };
};
