import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { apiErrorMessage } from "./trackerUtils";

/**
 * Shows an error toast. The API explains errors in English, so other
 * languages get the translated fallback text instead.
 */
export const useTrackerToast = () => {
  const dispatch = useDispatch();
  const { t, i18n } = useTranslation();

  const error = useCallback(
    (cause: unknown, fallbackKey = "trackers.errors.generic") => {
      const apiMessage = i18n.language?.startsWith("en") ? apiErrorMessage(cause) : null;
      dispatch(setToastMessage({ severity: "error", message: apiMessage ?? t(fallbackKey) }));
    },
    [dispatch, t, i18n],
  );

  const info = useCallback(
    (key: string) => dispatch(setToastMessage({ severity: "info", message: t(key) })),
    [dispatch, t],
  );

  const success = useCallback(
    (key: string) => dispatch(setToastMessage({ severity: "success", message: t(key) })),
    [dispatch, t],
  );

  return { error, info, success };
};
