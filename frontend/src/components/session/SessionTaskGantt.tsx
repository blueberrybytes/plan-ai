import React, { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Stack, Typography, Alert } from "@mui/material";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
} from "recharts";
import type { TaskResponse, TaskStatusSchema } from "../../store/apis/sessionApi";

type SessionTaskGanttProps = {
  tasks: TaskResponse[];
  onTaskClick?: (task: TaskResponse) => void;
};

type ChartDatum = {
  id: string;
  label: string;
  start: number;
  duration: number;
  status: TaskStatusSchema;
  priority: string;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  task: TaskResponse;
};

const MIN_DURATION_MS = 60 * 60 * 1000; // 1 hour fallback

const formatDateTime = (value: number) => new Date(value).toLocaleString();

const SessionTaskGantt: React.FC<SessionTaskGanttProps> = ({ tasks, onTaskClick }) => {
  const theme = useTheme();

  const parseDate = (value: string | null | undefined): number | null => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  };

  const data = useMemo<ChartDatum[]>(() => {
    return tasks.map((task) => {
      const enrichedTask = task as TaskResponse & {
        startDate?: string | null;
        completedAt?: string | null;
      };

      const startTimestamp =
        parseDate(enrichedTask.startDate) ?? parseDate(task.createdAt) ?? Date.now();

      const endTimestamp =
        parseDate(task.dueDate) ??
        parseDate(enrichedTask.completedAt) ??
        parseDate(task.updatedAt) ??
        startTimestamp + MIN_DURATION_MS;

      const duration = Math.max(endTimestamp - startTimestamp, MIN_DURATION_MS);

      return {
        id: task.id,
        label: task.title,
        start: startTimestamp,
        duration,
        status: task.status,
        priority: task.priority,
        summary: task.summary,
        acceptanceCriteria: task.acceptanceCriteria,
        task,
      } satisfies ChartDatum;
    });
  }, [tasks]);

  const domain = useMemo(() => {
    if (data.length === 0) {
      const now = Date.now();
      return [now - MIN_DURATION_MS, now + MIN_DURATION_MS];
    }

    const minStart = Math.min(...data.map((datum) => datum.start));
    const maxEnd = Math.max(...data.map((datum) => datum.start + datum.duration));
    return [minStart, maxEnd + MIN_DURATION_MS];
  }, [data]);

  if (data.length === 0) {
    return <Alert severity="info">No tasks available for the Gantt view yet.</Alert>;
  }

  const handleBarClick = (payload?: { task?: TaskResponse }) => {
    if (!payload?.task || !onTaskClick) {
      return;
    }
    onTaskClick(payload.task);
  };

  return (
    <Stack spacing={2} sx={{ width: "100%", height: 420 }}>
      <Typography variant="body2" color="text.secondary">
        Visualise task timelines. Bars begin at the task start date (or creation date when missing)
        and extend to the due or completion date.
      </Typography>
      <Box sx={{ flexGrow: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            layout="vertical"
            margin={{ top: 16, right: 24, bottom: 16, left: 180 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
            <XAxis
              type="number"
              dataKey="start"
              domain={domain}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
              stroke={theme.palette.text.secondary}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={160}
              tick={{ fill: theme.palette.text.primary, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: theme.palette.action.hover }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) {
                  return null;
                }
                const datum = payload[0].payload as ChartDatum;
                const startValue = formatDateTime(datum.start);
                const endValue = formatDateTime(datum.start + datum.duration);
                return (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: theme.palette.background.paper,
                      boxShadow: theme.shadows[3],
                      minWidth: 220,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        color: theme.palette.text.primary,
                      }}
                    >
                      {datum.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {datum.status.replace("_", " ")} · Priority: {datum.priority}
                    </Typography>
                    {datum.summary ? (
                      <Typography variant="body2" sx={{ mt: 1, color: theme.palette.text.primary }}>
                        {datum.summary}
                      </Typography>
                    ) : null}
                    <Typography variant="body2" sx={{ mt: 1, color: theme.palette.text.primary }}>
                      {startValue} → {endValue}
                    </Typography>
                    {datum.acceptanceCriteria ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.5 }}
                      >
                        Acceptance: {datum.acceptanceCriteria}
                      </Typography>
                    ) : null}
                  </Box>
                );
              }}
            />
            <Bar dataKey="start" stackId="timeline" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="duration"
              stackId="timeline"
              fill={theme.palette.primary.main}
              radius={[4, 4, 4, 4]}
              onClick={({ task }) => handleBarClick({ task })}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Stack>
  );
};

export default SessionTaskGantt;
