import React, { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { Tracker, TrackerDay } from "../../store/apis/trackersApi";
import { parseDateKey } from "../notes/noteUtils";
import { useTrackerFormat } from "./useTrackerFormat";

interface TrackerChartProps {
  tracker: Tracker;
  days: TrackerDay[];
  /** Bars show only logged days and met goals, with no numbers. */
  hideNumbers: boolean;
}

interface ChartPoint {
  date: string;
  dayOfMonth: string;
  value: number;
  raw: number | null;
  goalMet: boolean | null;
}

/** The last 30 days as bars. Green when the day met the goal. */
const TrackerChart: React.FC<TrackerChartProps> = ({ tracker, days, hideNumbers }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { amount, day } = useTrackerFormat();

  const data = useMemo<ChartPoint[]>(
    () =>
      days.map((d) => ({
        date: d.date,
        dayOfMonth: String(parseDateKey(d.date)?.getDate() ?? ""),
        // Without numbers every logged day has the same height.
        value: d.value === null ? 0 : hideNumbers ? 1 : d.value,
        raw: d.value,
        goalMet: d.goalMet,
      })),
    [days, hideNumbers],
  );

  const colorOf = (point: ChartPoint) => {
    if (point.goalMet === true) return theme.palette.success.main;
    if (point.goalMet === false) return theme.palette.error.light;
    return theme.palette.primary.main;
  };

  const dailyGoal =
    !hideNumbers && tracker.goalPeriod === "DAY" && tracker.kind !== "CHECK"
      ? tracker.goalValue
      : null;

  const tooltipText = (point: ChartPoint) => {
    if (point.raw === null) return t("trackers.chart.nothing");
    if (hideNumbers) {
      if (point.goalMet === null) return t("trackers.chart.logged");
      return t(point.goalMet ? "trackers.chart.met" : "trackers.chart.notMet");
    }
    return amount(point.raw, tracker);
  };

  return (
    <Box sx={{ width: "100%", height: 110 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="dayOfMonth"
            tickLine={false}
            axisLine={false}
            interval={6}
            tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!active || !point) return null;
              return (
                <Box
                  sx={{
                    bgcolor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    px: 1,
                    py: 0.5,
                    fontSize: "0.75rem",
                  }}
                >
                  <strong>{day(point.date)}</strong>
                  <br />
                  {tooltipText(point)}
                </Box>
              );
            }}
          />
          {dailyGoal !== null && (
            <ReferenceLine
              y={dailyGoal}
              stroke={theme.palette.text.secondary}
              strokeDasharray="4 4"
            />
          )}
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell key={point.date} fill={colorOf(point)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default TrackerChart;
