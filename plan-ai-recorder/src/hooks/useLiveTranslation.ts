import { useCallback, useState, type RefObject } from "react";
import type { AudioRecorder } from "../services/audioRecorder";
import {
  loadConfig,
  saveConfig,
  saveTranslationPreference,
} from "../utils/recorderConfig";
import {
  TRANSLATION_OFF,
  normalizeTranslateTo,
  translationErrorMessage,
  type TranslationErrorCode,
  type TranslationMap,
} from "../utils/liveTranslation";

// Session config for this recording, read by the recorder on reconnect.
const saveToSession = (code: string) => {
  const config = loadConfig();
  if (config) saveConfig({ ...config, translateTo: code || undefined });
};

/**
 * Live translation state of the Recording screen: the chosen target, the
 * translations received so far (by phrase id) and the notice shown when the
 * backend turns translation off.
 *
 * Nothing here reaches the saved recording or the crash recovery copy.
 */
export const useLiveTranslation = (
  recorderRef: RefObject<AudioRecorder | null>,
) => {
  // Starts with what the recorder puts in the socket URL: the target chosen
  // on Home, carried in the session config.
  const [translateTo, setTranslateTo] = useState<string>(() =>
    normalizeTranslateTo(loadConfig()?.translateTo),
  );
  const [translations, setTranslations] = useState<TranslationMap>({});
  const [translationNotice, setTranslationNotice] = useState<string | null>(
    null,
  );

  const changeTranslateTo = useCallback(
    (code: string) => {
      const next = normalizeTranslateTo(code);
      setTranslateTo(next);
      setTranslationNotice(null);
      // Takes effect for the next phrases. Translations already shown stay.
      recorderRef.current?.setTranslation(next || null);
      saveToSession(next);
      // The default for the next meeting, so Home does not go back to Off.
      saveTranslationPreference(next);
    },
    [recorderRef],
  );

  const handleTranslation = useCallback((id: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranslations((prev) => ({ ...prev, [id]: clean }));
  }, []);

  const handleTranslationError = useCallback((code: TranslationErrorCode) => {
    setTranslateTo(TRANSLATION_OFF);
    setTranslationNotice(translationErrorMessage(code));
    saveToSession(TRANSLATION_OFF);
    // Without an AI key every meeting would fail the same way, so the default
    // goes back to Off too. A passing failure keeps the user's choice for the
    // next meeting.
    if (code === "MISSING_API_KEY") saveTranslationPreference(TRANSLATION_OFF);
  }, []);

  return {
    translateTo,
    changeTranslateTo,
    translations,
    translationNotice,
    clearTranslationNotice: useCallback(() => setTranslationNotice(null), []),
    handleTranslation,
    handleTranslationError,
  };
};
