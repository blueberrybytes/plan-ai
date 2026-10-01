import React, { useMemo } from "react";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Value sent to the API for "all time". The Select needs a non-empty value. */
const ALL_TIME = "all";
const MONTHS_BACK = 12;

type UsagePeriodSelectProps = {
  /** "" for all time, "30d" for the last 30 days, or a month as "YYYY-MM". */
  value: string;
  onChange: (period: string) => void;
};

/** The last 12 months as "YYYY-MM", newest first. The API reads them in UTC. */
const recentMonths = (): { value: string; date: Date }[] => {
  const now = new Date();
  return Array.from({ length: MONTHS_BACK }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return { value: `${date.getFullYear()}-${month}`, date };
  });
};

const UsagePeriodSelect: React.FC<UsagePeriodSelectProps> = ({ value, onChange }) => {
  const { t, i18n } = useTranslation();

  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" });
    return recentMonths().map((m) => ({ value: m.value, label: formatter.format(m.date) }));
  }, [i18n.language]);

  return (
    <FormControl size="small" sx={{ minWidth: 190 }}>
      <InputLabel id="usage-period-label">{t("usagePeriod.label")}</InputLabel>
      <Select
        labelId="usage-period-label"
        label={t("usagePeriod.label")}
        value={value || ALL_TIME}
        onChange={(e) => onChange(e.target.value === ALL_TIME ? "" : e.target.value)}
      >
        <MenuItem value={ALL_TIME}>{t("usagePeriod.allTime")}</MenuItem>
        <MenuItem value="30d">{t("usagePeriod.last30Days")}</MenuItem>
        {months.map((m) => (
          <MenuItem key={m.value} value={m.value} sx={{ textTransform: "capitalize" }}>
            {m.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default UsagePeriodSelect;
