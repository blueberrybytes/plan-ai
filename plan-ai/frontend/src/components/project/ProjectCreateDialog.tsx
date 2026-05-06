import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";

export interface ProjectCreateDialogProps {
  open: boolean;
  title: string;
  description: string;
  isCreating: boolean;
  showValidation: boolean;
  errorMessage: string | null;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ProjectCreateDialog: React.FC<ProjectCreateDialogProps> = ({
  open,
  title,
  description,
  isCreating,
  showValidation,
  errorMessage,
  onChangeTitle,
  onChangeDescription,
  onSubmit,
  onClose,
}) => {
  const isTitleValid = title.trim().length > 0;

  return (
    <Dialog open={open} onClose={isCreating ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New project</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            required
            autoFocus
            disabled={isCreating}
            error={showValidation && !isTitleValid}
            helperText={showValidation && !isTitleValid ? "Title is required" : " "}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            multiline
            minRows={3}
            disabled={isCreating}
            placeholder="Outline the goals or context for this project"
          />
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={isCreating} variant="outlined">
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={isCreating} variant="contained">
          {isCreating ? "Creating..." : "Create project"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectCreateDialog;
