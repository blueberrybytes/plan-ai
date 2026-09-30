import { useCallback } from "react";
import { useExtract } from "./useExtract";
import { useTrackerToast } from "./useTrackerToast";

interface UseLogNoteToTrackersOptions {
  noteId: string;
  /** Sends unsaved text first, so the AI reads what the user sees. */
  flush: () => Promise<void>;
  /** False while the note is a draft that is not on the server. */
  isCreated: () => boolean;
  /** True when the save failed: the AI would read an older copy. */
  hasUnsavedWork: () => boolean;
}

/** "Log to trackers" in the note editor: save, then ask the AI to read the note. */
export const useLogNoteToTrackers = ({
  noteId,
  flush,
  isCreated,
  hasUnsavedWork,
}: UseLogNoteToTrackersOptions) => {
  const { run, isLoading, missingKey } = useExtract();
  const toast = useTrackerToast();

  const log = useCallback(async () => {
    await flush();
    if (!isCreated()) {
      toast.info("trackers.note.writeFirst");
      return;
    }
    if (hasUnsavedWork()) {
      toast.info("trackers.note.saveFirst");
      return;
    }
    await run({ noteId });
  }, [flush, isCreated, hasUnsavedWork, noteId, run, toast]);

  return { log, logging: isLoading, missingKey };
};
