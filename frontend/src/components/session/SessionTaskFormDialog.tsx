import React from "react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDispatch } from "react-redux";
import {
  TaskPrioritySchema,
  TaskResponse,
  TaskStatusSchema,
  useCreateSessionTaskMutation,
  useUpdateSessionTaskMutation,
} from "../../store/apis/sessionApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import type { components } from "../../types/api";

const TASK_STATUSES: TaskStatusSchema[] = [
  "BACKLOG",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "ARCHIVED",
];

const TASK_PRIORITIES: TaskPrioritySchema[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const formatDateTimeLocal = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const isoString = date.toISOString();
  return isoString.substring(0, 16);
};

type DependencyOption = {
  id: string;
  title: string;
};

type RichTask = TaskResponse & {
  metadata?: components["schemas"]["InputJsonValue"] | null;
};

interface SessionTaskFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  sessionId: string;
  tasks: TaskResponse[];
  task?: TaskResponse | null;
  onClose: () => void;
  onSuccess: (task: TaskResponse) => void;
}

const SessionTaskFormDialog: React.FC<SessionTaskFormDialogProps> = ({
  open,
  mode,
  sessionId,
  tasks,
  task,
  onClose,
  onSuccess,
}) => {
  const dispatch = useDispatch();
  const [createTask, { isLoading: isCreating }] = useCreateSessionTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateSessionTaskMutation();

  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatusSchema>("BACKLOG");
  const [priority, setPriority] = React.useState<TaskPrioritySchema>("MEDIUM");
  const [dueDate, setDueDate] = React.useState("");
  const [dependencyTaskIds, setDependencyTaskIds] = React.useState<string[]>([]);
  const [metadataText, setMetadataText] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const isSubmitting = isCreating || isUpdating;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && task) {
      const richTask = task as RichTask;
      setTitle(task.title);
      setSummary(task.summary ?? "");
      setDescription(task.description ?? "");
      setAcceptanceCriteria(task.acceptanceCriteria ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(formatDateTimeLocal(task.dueDate));
      setDependencyTaskIds(task.dependencies ?? []);
      setMetadataText(richTask.metadata ? JSON.stringify(richTask.metadata, null, 2) : "");
      setFormError(null);
    } else {
      setTitle("");
      setSummary("");
      setDescription("");
      setAcceptanceCriteria("");
      setStatus("BACKLOG");
      setPriority("MEDIUM");
      setDueDate("");
      setDependencyTaskIds([]);
      setMetadataText("");
      setFormError(null);
    }
  }, [open, mode, task]);

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setFormError("Title is required");
      return;
    }

    let metadata: components["schemas"]["InputJsonValue"] | null | undefined;
    if (metadataText.trim().length > 0) {
      try {
        metadata = JSON.parse(metadataText) as components["schemas"]["InputJsonValue"];
      } catch (error) {
        console.error("Invalid metadata JSON", error);
        setFormError("Metadata must be valid JSON");
        return;
      }
    }

    setFormError(null);

    const dueDateIso = (() => {
      if (!dueDate) {
        return null;
      }
      const parsed = new Date(dueDate);
      if (Number.isNaN(parsed.getTime())) {
        setFormError("Due date must be a valid date");
        return undefined;
      }
      return parsed.toISOString();
    })();

    if (dueDateIso === undefined) {
      return;
    }

    const basePayload = {
      title: title.trim(),
      summary: summary.trim() || null,
      description: description.trim() || null,
      acceptanceCriteria: acceptanceCriteria.trim() || null,
      status,
      priority,
      dueDate: dueDateIso,
      metadata: metadata ?? null,
      dependencyTaskIds,
    };

    try {
      if (mode === "create") {
        const response = await createTask({
          sessionId,
          body: basePayload,
        }).unwrap();
        if (response.data) {
          dispatch(
            setToastMessage({
              severity: "success",
              message: "Task created successfully",
            }),
          );
          onSuccess(response.data);
        }
      } else if (mode === "edit" && task) {
        const response = await updateTask({
          path: { sessionId, taskId: task.id },
          body: basePayload,
        }).unwrap();
        if (response.data) {
          dispatch(
            setToastMessage({
              severity: "success",
              message: "Task updated successfully",
            }),
          );
          onSuccess(response.data);
        }
      }
    } catch (error) {
      console.error("Task submission failed", error);
      setFormError("Failed to save task. Please try again.");
    }
  };

  const dependencyOptions = React.useMemo<DependencyOption[]>(() => {
    return tasks
      .filter((candidate) => (mode === "edit" && task ? candidate.id !== task.id : true))
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
      }));
  }, [tasks, mode, task]);

  const selectedDependencyOptions = React.useMemo<DependencyOption[]>(() => {
    return dependencyOptions.filter((option) => dependencyTaskIds.includes(option.id));
  }, [dependencyOptions, dependencyTaskIds]);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === "create" ? "Create task" : "Edit task"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            multiline
            minRows={2}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={3}
          />
          <TextField
            label="Acceptance criteria"
            value={acceptanceCriteria}
            onChange={(event) => setAcceptanceCriteria(event.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Status"
              select
              fullWidth
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatusSchema)}
            >
              {TASK_STATUSES.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Priority"
              select
              fullWidth
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPrioritySchema)}
            >
              {TASK_PRIORITIES.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Due date"
            type="datetime-local"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Autocomplete<DependencyOption, true, false, false>
            multiple
            options={dependencyOptions}
            getOptionLabel={(option) => option.title}
            value={selectedDependencyOptions}
            onChange={(_, newValue) => {
              setDependencyTaskIds(newValue.map((item) => item.id));
            }}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField {...params} label="Dependencies" placeholder="Select prerequisite tasks" />
            )}
          />
          <TextField
            label="Metadata (JSON)"
            value={metadataText}
            onChange={(event) => setMetadataText(event.target.value)}
            multiline
            minRows={3}
            placeholder={'{\n  "key": "value"\n}'}
          />
          {formError ? (
            <Typography color="error" variant="body2">
              {formError}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create task"
              : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionTaskFormDialog;
