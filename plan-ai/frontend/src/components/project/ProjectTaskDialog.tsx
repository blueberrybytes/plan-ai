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
  Box,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { TaskResponse, TaskPrioritySchema } from "../../store/apis/projectApi";
import type { components } from "../../types/api";
import { AiGraphTrace, ContextGraph } from "./ContextGraph";
import MarkdownRenderer from "../common/MarkdownRenderer";

type TaskMetadata = components["schemas"]["TaskMetadata"];

interface ProjectTaskDialogProps {
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
  metadata?: TaskMetadata | null;
  startDate?: string | null;
  completedAt?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
};

const ProjectTaskDialog: React.FC<ProjectTaskDialogProps> = ({
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
              <MarkdownRenderer content={task.summary} />
            </Stack>
          ) : null}

          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Description
            </Typography>
            {task.description ? (
              <MarkdownRenderer content={task.description} />
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
                <MarkdownRenderer content={task.acceptanceCriteria} />
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
                Integrations
              </Typography>
              <Stack direction="row" spacing={1}>
                {extendedTask.metadata?.jira ? (
                  <Chip
                    label={extendedTask.metadata.jira.issueKey}
                    size="small"
                    color="primary"
                    variant="filled"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (extendedTask.metadata?.jira?.url) {
                        window.open(
                          extendedTask.metadata.jira.url,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                    sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
                  />
                ) : null}
                {extendedTask.metadata?.linear ? (
                  <Chip
                    label={extendedTask.metadata.linear.identifier}
                    size="small"
                    style={{ backgroundColor: "#5E6AD2", color: "white" }}
                    variant="filled"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (extendedTask.metadata?.linear?.url) {
                        window.open(
                          extendedTask.metadata.linear.url,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                    sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
                  />
                ) : null}
                {extendedTask.metadata?.trello ? (
                  <Chip
                    label={extendedTask.metadata.trello.shortLink}
                    size="small"
                    style={{ backgroundColor: "#0079BF", color: "white" }}
                    variant="filled"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (extendedTask.metadata?.trello?.url) {
                        window.open(
                          extendedTask.metadata.trello.url,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                    sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
                  />
                ) : null}
                {!extendedTask.metadata?.jira &&
                !extendedTask.metadata?.linear &&
                !extendedTask.metadata?.trello ? (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                ) : null}
              </Stack>
            </Stack>

            {(extendedTask.metadata?.publicDocUrl || extendedTask.metadata?.publicSlidesUrl) ? (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Generated Assets
                </Typography>
                <Stack direction="row" spacing={1}>
                  {extendedTask.metadata?.publicDocUrl ? (
                    <Chip
                      label="Public Document"
                      size="small"
                      color="secondary"
                      variant="filled"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (extendedTask.metadata?.publicDocUrl) {
                          window.open(
                            extendedTask.metadata.publicDocUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                      sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
                    />
                  ) : null}
                  {extendedTask.metadata?.publicSlidesUrl ? (
                    <Chip
                      label="Public Slides"
                      size="small"
                      color="secondary"
                      variant="filled"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (extendedTask.metadata?.publicSlidesUrl) {
                          window.open(
                            extendedTask.metadata.publicSlidesUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                      sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
                    />
                  ) : null}
                </Stack>
              </Stack>
            ) : null}

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

            {(() => {
              const trace = (extendedTask.metadata as Record<string, unknown>)?.aiGraphTrace as
                | AiGraphTrace
                | undefined;
              if (!trace || !Array.isArray(trace.nodes) || trace.nodes.length === 0) return null;
              return (
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="primary">
                    ✨ AI Architecture Path (Proof of Work)
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <ContextGraph height={250} nodes={trace.nodes} links={trace.links} />
                  </Box>
                </Stack>
              );
            })()}
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

export default ProjectTaskDialog;
