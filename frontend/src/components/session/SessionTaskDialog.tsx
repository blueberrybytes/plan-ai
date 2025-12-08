import React from "react";
import {
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { TaskResponse, TaskPrioritySchema } from "../../store/apis/sessionApi";
import type { components } from "../../types/api";

interface SessionTaskDialogProps {
  open: boolean;
  task: TaskResponse | null;
  onClose: () => void;
  onEdit?: (task: TaskResponse) => void;
  onDelete?: (task: TaskResponse) => void;
  isDeleting?: boolean;
}

const priorityColorMap: Record<TaskPrioritySchema, "default" | "primary" | "warning" | "error"> = {
  LOW: "default",
  MEDIUM: "primary",
  HIGH: "warning",
  URGENT: "error",
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

type ExtendedTask = TaskResponse & {
  metadata?: components["schemas"]["InputJsonValue"] | null;
  startDate?: string | null;
  completedAt?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
};

const SessionTaskDialog: React.FC<SessionTaskDialogProps> = ({
  open,
  task,
  onClose,
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  if (!task) {
    return null;
  }

  const extendedTask = task as ExtendedTask;
  let metadataJson: string | null = null;
  if (extendedTask.metadata !== undefined && extendedTask.metadata !== null) {
    try {
      metadataJson = JSON.stringify(extendedTask.metadata, null, 2);
    } catch (error) {
      console.error("Failed to stringify task metadata", error);
    }
  }

  const handleEdit = () => {
    if (task && onEdit) {
      onEdit(task);
    }
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="session-task-dialog-title"
    >
      <DialogTitle
        id="session-task-dialog-title"
        sx={{ display: "flex", alignItems: "center", pr: 6 }}
      >
        <Stack spacing={1} sx={{ flexGrow: 1 }}>
          <Typography variant="overline" color="text.secondary">
            Task
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {task.title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip label={task.status} size="small" color="default" variant="filled" />
            <Chip label={task.priority} size="small" color={priorityColorMap[task.priority]} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Task ID: {task.id}
          </Typography>
        </Stack>
        <IconButton
          onClick={onClose}
          aria-label="Close task details"
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {task.summary ? (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Summary
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                {task.summary}
              </Typography>
            </Stack>
          ) : null}

          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Description
            </Typography>
            {task.description ? (
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                {task.description}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No description provided.
              </Typography>
            )}
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Due date
                </Typography>
                <Typography variant="body2">{formatDateTime(task.dueDate)}</Typography>
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">{formatDateTime(task.createdAt)}</Typography>
              </Stack>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Last updated
              </Typography>
              <Typography variant="body2">{formatDateTime(task.updatedAt)}</Typography>
            </Stack>
            {task.acceptanceCriteria ? (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Acceptance criteria
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {task.acceptanceCriteria}
                </Typography>
              </Stack>
            ) : null}
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Start date
              </Typography>
              <Typography variant="body2">
                {formatDateTime(extendedTask.startDate ?? null)}
              </Typography>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Completed
              </Typography>
              <Typography variant="body2">
                {formatDateTime(extendedTask.completedAt ?? null)}
              </Typography>
            </Stack>
            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Estimated minutes
                </Typography>
                <Typography variant="body2">
                  {typeof extendedTask.estimatedMinutes === "number"
                    ? extendedTask.estimatedMinutes
                    : "—"}
                </Typography>
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Actual minutes
                </Typography>
                <Typography variant="body2">
                  {typeof extendedTask.actualMinutes === "number"
                    ? extendedTask.actualMinutes
                    : "—"}
                </Typography>
              </Stack>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Dependencies
              </Typography>
              {task.dependencies && task.dependencies.length > 0 ? (
                <Stack spacing={0.5}>
                  {task.dependencies.map((dependencyId) => (
                    <Typography key={dependencyId} variant="body2" color="text.secondary">
                      • {dependencyId}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              )}
            </Stack>
            {metadataJson ? (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Metadata
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}
                >
                  {metadataJson}
                </Typography>
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1}>
          {onDelete ? (
            <Button color="error" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          ) : null}
          {onEdit ? (
            <Button onClick={handleEdit} disabled={isDeleting} variant="outlined">
              Edit
            </Button>
          ) : null}
        </Stack>
        <Button onClick={onClose} disabled={isDeleting}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionTaskDialog;
