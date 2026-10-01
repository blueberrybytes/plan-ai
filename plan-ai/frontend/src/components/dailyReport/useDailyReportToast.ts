import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { reportUnexpectedError } from "../../utils/reportError";

/** The error code the API sends in the body, if any. */
export const apiErrorCode = (error: unknown): string | null => {
  const code = (error as { data?: { code?: unknown } } | undefined)?.data?.code;
  return typeof code === "string" ? code : null;
};

/** Toasts for the daily report pages. Unexpected errors also go to Sentry. */
export const useDailyReportToast = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const error = useCallback(
    (cause: unknown, key: string, feature = "dailyReport") => {
      reportUnexpectedError(feature, cause, { messageKey: key });
      // A 429 already shows a toast from the base query.
      if ((cause as { status?: unknown })?.status === 429) return;
      dispatch(setToastMessage({ severity: "error", message: t(key) }));
    },
    [dispatch, t],
  );

  const show = useCallback(
    (severity: "info" | "success", message: string) =>
      dispatch(setToastMessage({ severity, message })),
    [dispatch],
  );

  return { error, show };
};
