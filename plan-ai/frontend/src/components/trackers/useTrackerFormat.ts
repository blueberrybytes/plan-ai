import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Tracker } from "../../store/apis/trackersApi";
import { parseDateKey } from "../notes/noteUtils";
import { formatNumber, localToday, relativeDay } from "./trackerUtils";

/** Formats tracker values and days in the user's language. */
export const useTrackerFormat = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const number = useCallback(
    (value: number, digits = 1) => formatNumber(value, locale, digits),
    [locale],
  );

  /** "7,500 steps", "72.4 kg", or "Done" for a CHECK tracker. */
  const amount = useCallback(
    (value: number, tracker: Pick<Tracker, "kind" | "unit">) => {
      if (tracker.kind === "CHECK") return t("trackers.value.done");
      const unit = tracker.unit?.trim();
      return unit ? `${number(value)} ${unit}` : number(value);
    },
    [number, t],
  );

  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }),
    [locale],
  );

  /** "Today", "Yesterday" or "Mon 29 Sep". */
  const day = useCallback(
    (key: string) => {
      const relative = relativeDay(key, localToday());
      if (relative) return t(`trackers.day.${relative}`);
      const date = parseDateKey(key);
      return date ? dayFormat.format(date) : key;
    },
    [dayFormat, t],
  );

  return { number, amount, day };
};
