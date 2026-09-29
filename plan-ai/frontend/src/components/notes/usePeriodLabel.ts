import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import type { Note } from "../../store/apis/notesApi";
import { noteHeading, parseDateKey } from "./noteUtils";

const dateLocale = (language: string) => (language.startsWith("es") ? es : enUS);

/** "Daily note, Tuesday 29 September" for a period note, else null. */
export const usePeriodLabel = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (note: Pick<Note, "periodType" | "periodStart">): string | null => {
      if (!note.periodType || !note.periodStart) return null;
      const date = parseDateKey(note.periodStart);
      if (!date) return null;
      const locale = dateLocale(i18n.language);
      return note.periodType === "DAY"
        ? t("notes.dailyTitle", { date: format(date, "EEEE d MMMM yyyy", { locale }) })
        : t("notes.weeklyTitle", { date: format(date, "d MMMM yyyy", { locale }) });
    },
    [t, i18n.language],
  );
};

/** Heading for list rows: title, first line, period label or "Untitled". */
export const useNoteLabels = () => {
  const { t, i18n } = useTranslation();
  const periodLabel = usePeriodLabel();
  const heading = useCallback(
    (note: Note) => noteHeading(note) ?? periodLabel(note) ?? t("notes.untitled"),
    [periodLabel, t],
  );
  const updatedAgo = useCallback(
    (note: Note) =>
      formatDistanceToNow(new Date(note.updatedAt), {
        addSuffix: true,
        locale: dateLocale(i18n.language),
      }),
    [i18n.language],
  );
  return { heading, updatedAgo, periodLabel };
};
