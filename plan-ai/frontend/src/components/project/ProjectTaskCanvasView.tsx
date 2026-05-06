import React, { useMemo } from "react";
import { Box, Chip, Stack, Typography, Paper, Tooltip } from "@mui/material";
import {
  CheckCircle as DoneIcon,
  RadioButtonUnchecked as TodoIcon,
  Autorenew as InProgressIcon,
  Block as BlockedIcon,
} from "@mui/icons-material";
import { TaskResponse } from "../../store/apis/projectApi";

interface ProjectTaskCanvasViewProps {
  tasks: TaskResponse[];
  onTaskClick: (task: TaskResponse) => void;
}

// Friendly labels for non-technical users
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactElement; bg: string }
> = {
  BACKLOG: {
    label: "Not started",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.08)",
    icon: <TodoIcon sx={{ fontSize: 14, color: "#94a3b8" }} />,
  },
  IN_PROGRESS: {
    label: "In progress",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    icon: <InProgressIcon sx={{ fontSize: 14, color: "#f59e0b" }} />,
  },
  BLOCKED: {
    label: "Blocked",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    icon: <BlockedIcon sx={{ fontSize: 14, color: "#ef4444" }} />,
  },
  COMPLETED: {
    label: "Done ✓",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    icon: <DoneIcon sx={{ fontSize: 14, color: "#22c55e" }} />,
  },
  ARCHIVED: {
    label: "Archived",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.08)",
    icon: <TodoIcon sx={{ fontSize: 14, color: "#6b7280" }} />,
  },
};

const PRIORITY_BORDER: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  URGENT: "#a855f7",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

function getGroup(task: TaskResponse): "this_week" | "next_week" | "later" | "no_date" {
  if (!task.dueDate) return "no_date";
  const due = new Date(task.dueDate);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfThisWeek = new Date(startOfToday);
  endOfThisWeek.setDate(startOfToday.getDate() + (6 - startOfToday.getDay() + 1));
  const endOfNextWeek = new Date(endOfThisWeek);
  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);

  if (due < endOfThisWeek) return "this_week";
  if (due < endOfNextWeek) return "next_week";
  return "later";
}

const GROUP_CONFIG = [
  {
    key: "this_week" as const,
    label: "📅 This Week",
    description: "Due in the next 7 days",
    headerColor: "#f59e0b",
  },
  {
    key: "next_week" as const,
    label: "🗓️ Next Week",
    description: "Due in 7–14 days",
    headerColor: "#3b82f6",
  },
  {
    key: "later" as const,
    label: "🔮 Later",
    description: "Due in more than 2 weeks",
    headerColor: "#8b5cf6",
  },
  {
    key: "no_date" as const,
    label: "📌 No Due Date",
    description: "Tasks without a deadline",
    headerColor: "#6b7280",
  },
];

const TaskCard: React.FC<{ task: TaskResponse; onClick: (t: TaskResponse) => void }> = ({
  task,
  onClick,
}) => {
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG["BACKLOG"];
  const borderColor = PRIORITY_BORDER[task.priority] ?? "#94a3b8";
  const priorityLabel = PRIORITY_LABEL[task.priority] ?? task.priority;

  const dueDateStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <Tooltip
      title={task.summary ?? task.description ?? ""}
      placement="top"
      arrow
      disableHoverListener={!task.summary && !task.description}
    >
      <Paper
        onClick={() => onClick(task)}
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          cursor: "pointer",
          borderLeft: `4px solid ${borderColor}`,
          bgcolor: "background.paper",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          "&:hover": {
            transform: "translateY(-3px)",
            boxShadow: 6,
          },
          width: "100%",
        }}
        elevation={1}
      >
        <Stack spacing={1}>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.4,
            }}
          >
            {task.title}
          </Typography>

          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              icon={statusCfg.icon}
              label={statusCfg.label}
              sx={{
                fontSize: "0.68rem",
                height: 22,
                bgcolor: statusCfg.bg,
                color: statusCfg.color,
                fontWeight: 600,
                border: "none",
              }}
            />
            <Chip
              size="small"
              label={priorityLabel}
              sx={{
                fontSize: "0.68rem",
                height: 22,
                bgcolor: `${borderColor}18`,
                color: borderColor,
                fontWeight: 600,
              }}
            />
          </Stack>

          {dueDateStr && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
              📅 {dueDateStr}
            </Typography>
          )}
        </Stack>
      </Paper>
    </Tooltip>
  );
};

const ProjectTaskCanvasView: React.FC<ProjectTaskCanvasViewProps> = ({ tasks, onTaskClick }) => {
  const grouped = useMemo(() => {
    const buckets: Record<(typeof GROUP_CONFIG)[number]["key"], TaskResponse[]> = {
      this_week: [],
      next_week: [],
      later: [],
      no_date: [],
    };
    for (const task of tasks) {
      buckets[getGroup(task)].push(task);
    }
    return buckets;
  }, [tasks]);

  return (
    <Box sx={{ overflowX: "auto", pb: 2 }}>
      <Stack direction="row" spacing={4} sx={{ minWidth: "max-content" }}>
        {GROUP_CONFIG.map(({ key, label, description, headerColor }) => {
          const bucket = grouped[key];
          return (
            <Box key={key} sx={{ width: 340, flexShrink: 0 }}>
              {/* Column header */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: headerColor,
                    flexShrink: 0,
                  }}
                />
                <Stack spacing={0}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ color: headerColor, lineHeight: 1.2 }}
                  >
                    {label}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {description}
                  </Typography>
                </Stack>
                <Chip
                  size="small"
                  label={bucket.length}
                  sx={{ ml: "auto !important", height: 20, fontSize: "0.7rem", fontWeight: 700 }}
                />
              </Stack>

              {/* Cards */}
              <Stack spacing={1.5}>
                {bucket.length === 0 ? (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: 2,
                      minHeight: 100,
                      border: "1.5px dashed",
                      borderColor: "divider",
                      textAlign: "center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="caption" color="text.disabled">
                      No tasks here
                    </Typography>
                  </Paper>
                ) : (
                  bucket.map((task) => <TaskCard key={task.id} task={task} onClick={onTaskClick} />)
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default ProjectTaskCanvasView;
