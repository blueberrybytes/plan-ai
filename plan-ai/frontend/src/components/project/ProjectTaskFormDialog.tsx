import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Paper,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import { useDispatch } from "react-redux";
import {
  TaskPrioritySchema,
  TaskResponse,
  TaskStatusSchema,
  useCreateProjectTaskMutation,
  useUpdateProjectTaskMutation,
  useRefineProjectTaskMutation,
  ApiResponseRefineTaskResponse,
} from "../../store/apis/projectApi";
import { setToastMessage } from "../../store/slices/app/appSlice";

const TASK_STATUSES: TaskStatusSchema[] = [
  "BACKLOG",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "ARCHIVED",
];

const TASK_PRIORITIES: TaskPrioritySchema[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const TASK_TYPES = ["TASK", "BUG", "STORY", "EPIC"] as const;
type TaskTypeSchema = (typeof TASK_TYPES)[number];

// ── Friendly labels for non-tech users ──────────────────────────────────────
const STATUS_SIMPLE: { value: TaskStatusSchema; label: string; icon: string; color: string }[] = [
  { value: "BACKLOG", label: "Not started", icon: "⏸", color: "default" },
  { value: "IN_PROGRESS", label: "In progress", icon: "🔄", color: "warning" },
  { value: "BLOCKED", label: "Blocked", icon: "🚫", color: "error" },
  { value: "COMPLETED", label: "Done", icon: "✅", color: "success" },
];

const PRIORITY_SIMPLE: { value: TaskPrioritySchema; label: string; icon: string }[] = [
  { value: "LOW", label: "Low", icon: "🟢" },
  { value: "MEDIUM", label: "Medium", icon: "🟡" },
  { value: "HIGH", label: "High", icon: "🔴" },
  { value: "URGENT", label: "Urgent", icon: "🚨" },
];

const formatDateTimeLocal = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().substring(0, 16);
};

type DependencyOption = { id: string; title: string };
type RichTask = TaskResponse & { metadata?: Record<string, unknown> | null };

interface ProjectTaskFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  projectId: string;
  tasks: TaskResponse[];
  task?: TaskResponse | null;
  onClose: () => void;
  onSuccess: (task: TaskResponse) => void;
}

const ProjectTaskFormDialog: React.FC<ProjectTaskFormDialogProps> = ({
  open,
  mode,
  projectId,
  tasks,
  task,
  onClose,
  onSuccess,
}) => {
  const dispatch = useDispatch();
  const [createTask, { isLoading: isCreating }] = useCreateProjectTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateProjectTaskMutation();

  // Form state
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatusSchema>("BACKLOG");
  const [priority, setPriority] = React.useState<TaskPrioritySchema>("MEDIUM");
  const [type, setType] = React.useState<TaskTypeSchema>("TASK");
  const [dueDate, setDueDate] = React.useState("");
  const [dependencyTaskIds, setDependencyTaskIds] = React.useState<string[]>([]);
  const [metadataText, setMetadataText] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  // AI Task Coach State
  const [refineTask, { isLoading: isRefining }] = useRefineProjectTaskMutation();
  const [aiSuggestion, setAiSuggestion] = React.useState<
    ApiResponseRefineTaskResponse["data"] | null
  >(null);

  // Simple vs Advanced mode (default: simple, but edit always shows advanced)
  const [advancedMode, setAdvancedMode] = React.useState(false);

  const isSubmitting = isCreating || isUpdating;

  React.useEffect(() => {
    if (!open) return;

    if (mode === "edit" && task) {
      const richTask = task as RichTask;
      setTitle(task.title);
      setSummary(task.summary ?? "");
      setDescription(task.description ?? "");
      setAcceptanceCriteria(task.acceptanceCriteria ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setType((task as unknown as { type?: TaskTypeSchema }).type ?? "TASK");
      setDueDate(formatDateTimeLocal(task.dueDate));
      setDependencyTaskIds(task.dependencies ?? []);
      setMetadataText(richTask.metadata ? JSON.stringify(richTask.metadata, null, 2) : "");
      setFormError(null);
      setAiSuggestion(null);
      setAdvancedMode(true); // Always open in advanced mode when editing
    } else {
      setTitle("");
      setSummary("");
      setDescription("");
      setAcceptanceCriteria("");
      setStatus("BACKLOG");
      setPriority("MEDIUM");
      setType("TASK");
      setDueDate("");
      setDependencyTaskIds([]);
      setMetadataText("");
      setFormError(null);
      setAiSuggestion(null);
      setAdvancedMode(false);
    }
  }, [open, mode, task]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setFormError("Please enter a task name.");
      return;
    }

    let metadata: Record<string, unknown> | null | undefined;
    if (metadataText.trim().length > 0) {
      try {
        metadata = JSON.parse(metadataText);
      } catch {
        setFormError("Metadata must be valid JSON.");
        return;
      }
    }

    setFormError(null);

    const dueDateIso = (() => {
      if (!dueDate) return null;
      const parsed = new Date(dueDate);
      if (Number.isNaN(parsed.getTime())) {
        setFormError("Due date must be a valid date.");
        return undefined;
      }
      return parsed.toISOString();
    })();

    if (dueDateIso === undefined) return;

    const basePayload = {
      title: title.trim(),
      summary: summary.trim() || null,
      description: description.trim() || null,
      acceptanceCriteria: acceptanceCriteria.trim() || null,
      status,
      priority,
      type,
      dueDate: dueDateIso,
      metadata: metadata ?? null,
      dependencyTaskIds,
    };

    try {
      if (mode === "create") {
        const response = await createTask({ projectId, body: basePayload }).unwrap();
        if (response) {
          dispatch(setToastMessage({ severity: "success", message: "Task created successfully" }));
          onSuccess(response);
        }
      } else if (mode === "edit" && task) {
        const response = await updateTask({
          path: { projectId, taskId: task.id },
          body: basePayload,
        }).unwrap();
        if (response.data) {
          dispatch(setToastMessage({ severity: "success", message: "Task updated successfully" }));
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
      .map((candidate) => ({ id: candidate.id, title: candidate.title }));
  }, [tasks, mode, task]);

  const selectedDependencyOptions = React.useMemo<DependencyOption[]>(() => {
    return dependencyOptions.filter((option) => dependencyTaskIds.includes(option.id));
  }, [dependencyOptions, dependencyTaskIds]);

  const handleRefine = async () => {
    if (!title.trim()) {
      setFormError("Please enter a task name to refine.");
      return;
    }

    try {
      setFormError(null);
      const response = await refineTask({
        projectId,
        body: {
          title: title.trim(),
          summary: summary.trim() || null,
          description: description.trim() || null,
          acceptanceCriteria: acceptanceCriteria.trim() || null,
          type,
          priority,
        },
      }).unwrap();

      if (response.data) {
        setAiSuggestion(response.data);
      }
    } catch (error) {
      console.error("Failed to refine task", error);
      setFormError("AI Refinement failed. Please try again.");
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    setTitle(aiSuggestion.refinedTitle);
    setDescription(aiSuggestion.structuredDescription);
    if (aiSuggestion.acceptanceCriteria) {
      setAcceptanceCriteria(aiSuggestion.acceptanceCriteria);
    }

    // Auto-update metadata for points/minutes
    let currentMetadata = metadataText ? JSON.parse(metadataText) : {};
    if (aiSuggestion.storyPoints) {
      currentMetadata.storyPoints = aiSuggestion.storyPoints;
    }
    if (aiSuggestion.estimatedMinutes) {
      currentMetadata.estimatedMinutes = aiSuggestion.estimatedMinutes;
    }
    if (Object.keys(currentMetadata).length > 0) {
      setMetadataText(JSON.stringify(currentMetadata, null, 2));
    }

    setAiSuggestion(null);
    setAdvancedMode(true); // Open advanced mode to see the applied changes
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight={700}>
            {mode === "create" ? "New Task" : "Edit Task"}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={advancedMode}
                onChange={(e) => setAdvancedMode(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Advanced
              </Typography>
            }
            labelPlacement="start"
            sx={{ mr: 0 }}
          />
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {/* ── Always visible: Name ── */}
          <TextField
            label={advancedMode ? "Title" : "What needs to be done?"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            placeholder="e.g. Design the login page"
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label="Task Type"
              select
              size="small"
              value={type}
              onChange={(e) => setType(e.target.value as TaskTypeSchema)}
              sx={{ minWidth: 120 }}
            >
              {TASK_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* ── AI Task Coach Button ── */}
          <Button
            variant="outlined"
            size="small"
            color="primary"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleRefine}
            disabled={isRefining || !title.trim()}
            sx={{ alignSelf: "flex-start", borderRadius: 4, textTransform: "none" }}
          >
            {isRefining ? "Refining..." : "✨ Refine with AI"}
          </Button>

          {/* ── AI Suggestion Panel ── */}
          <Collapse in={!!aiSuggestion}>
            {aiSuggestion && (
              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: "primary.50", borderColor: "primary.200", borderRadius: 2 }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2" color="primary.800" fontWeight={600}>
                      <AutoAwesomeIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }} />
                      AI Suggestion
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      disableElevation
                      startIcon={<CheckIcon />}
                      onClick={applyAiSuggestion}
                    >
                      Apply Suggestion
                    </Button>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {aiSuggestion.refinedTitle}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: "pre-wrap", color: "text.secondary", fontSize: "0.85rem" }}
                  >
                    {aiSuggestion.structuredDescription}
                  </Typography>
                  {aiSuggestion.acceptanceCriteria && (
                    <>
                      <Typography variant="caption" fontWeight={600} sx={{ mt: 1 }}>
                        Acceptance Criteria
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: "pre-wrap",
                          color: "text.secondary",
                          fontSize: "0.85rem",
                        }}
                      >
                        {aiSuggestion.acceptanceCriteria}
                      </Typography>
                    </>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    {aiSuggestion.storyPoints ? (
                      <Chip
                        size="small"
                        label={`${aiSuggestion.storyPoints} Story Points`}
                        color="secondary"
                      />
                    ) : null}
                    {aiSuggestion.estimatedMinutes ? (
                      <Chip
                        size="small"
                        label={`${aiSuggestion.estimatedMinutes} mins`}
                        color="secondary"
                      />
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Collapse>

          {/* ── Simple: Status toggles ── */}
          {!advancedMode && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Status
              </Typography>
              <ToggleButtonGroup
                value={status}
                exclusive
                onChange={(_, val) => {
                  if (val) setStatus(val);
                }}
                size="small"
                sx={{ flexWrap: "wrap", gap: 1 }}
              >
                {STATUS_SIMPLE.map(({ value, label, icon }) => (
                  <ToggleButton
                    key={value}
                    value={value}
                    sx={{
                      borderRadius: "8px !important",
                      border: "1px solid !important",
                      px: 1.5,
                      py: 0.5,
                      fontSize: "0.8rem",
                      textTransform: "none",
                      "&.Mui-selected": {
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        "&:hover": { bgcolor: "primary.dark" },
                      },
                    }}
                  >
                    {icon} {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          )}

          {/* ── Simple: Priority toggles ── */}
          {!advancedMode && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                How urgent is this?
              </Typography>
              <ToggleButtonGroup
                value={priority}
                exclusive
                onChange={(_, val) => {
                  if (val) setPriority(val);
                }}
                size="small"
                sx={{ flexWrap: "wrap", gap: 1 }}
              >
                {PRIORITY_SIMPLE.map(({ value, label, icon }) => (
                  <ToggleButton
                    key={value}
                    value={value}
                    sx={{
                      borderRadius: "8px !important",
                      border: "1px solid !important",
                      px: 1.5,
                      py: 0.5,
                      fontSize: "0.8rem",
                      textTransform: "none",
                      "&.Mui-selected": {
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        "&:hover": { bgcolor: "primary.dark" },
                      },
                    }}
                  >
                    {icon} {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          )}

          {/* ── Due date (simple) ── */}
          <TextField
            label={advancedMode ? "Due date" : "When is this due? (optional)"}
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          {/* ── Simple: optional note ── */}
          {!advancedMode && (
            <TextField
              label="Add a note (optional)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              multiline
              minRows={2}
              placeholder="Any extra context for your team..."
            />
          )}

          {/* ── ADVANCED FIELDS ── */}
          <Collapse in={advancedMode}>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Divider>
                <Chip label="Advanced settings" size="small" />
              </Divider>

              <TextField
                label="Summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                multiline
                minRows={2}
              />

              <TextField
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={3}
              />

              <TextField
                label="Acceptance criteria"
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                multiline
                minRows={2}
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Status"
                  select
                  fullWidth
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatusSchema)}
                >
                  {TASK_STATUSES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option.replace("_", " ")}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Priority"
                  select
                  fullWidth
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPrioritySchema)}
                >
                  {TASK_PRIORITIES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Autocomplete<DependencyOption, true, false, false>
                multiple
                options={dependencyOptions}
                getOptionLabel={(option) => option.title}
                value={selectedDependencyOptions}
                onChange={(_, newValue) => setDependencyTaskIds(newValue.map((item) => item.id))}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Dependencies"
                    placeholder="Select prerequisite tasks"
                  />
                )}
              />

              <TextField
                label="Metadata (JSON)"
                value={metadataText}
                onChange={(e) => setMetadataText(e.target.value)}
                multiline
                minRows={3}
                placeholder={'{\n  "key": "value"\n}'}
              />
            </Stack>
          </Collapse>

          {/* ── Error ── */}
          {formError && (
            <Box sx={{ p: 1.5, bgcolor: "error.main", borderRadius: 1 }}>
              <Typography color="error.contrastText" variant="body2">
                {formError}
              </Typography>
            </Box>
          )}
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

export default ProjectTaskFormDialog;
