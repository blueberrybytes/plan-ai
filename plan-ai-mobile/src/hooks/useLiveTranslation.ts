import { useCallback, useSyncExternalStore } from "react";
import { recordingService } from "@/services/recordingService";
import {
  liveTranslationStore,
  type LiveTranslationState,
} from "@/services/liveTranslationStore";

export interface LiveTranslation extends LiveTranslationState {
  /** Picks a target language, "" for off. Saved for the next meetings. */
  setTarget: (code: string) => void;
  clearError: () => void;
}

/** Live translation of the meeting on the record screen. */
export function useLiveTranslation(): LiveTranslation {
  const state = useSyncExternalStore(
    liveTranslationStore.subscribe,
    liveTranslationStore.getState,
  );
  // Through the recording service, so an open socket hears about it too.
  const setTarget = useCallback((code: string) => recordingService.setTranslation(code), []);
  return { ...state, setTarget, clearError: liveTranslationStore.clearError };
}
