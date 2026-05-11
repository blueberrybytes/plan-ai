/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useUploadContextFileMutation } from "../../store/apis/contextApi";
import { setToastMessage } from "../../store/slices/app/appSlice";

interface CreateTextContextDialogProps {
  open: boolean;
  onClose: () => void;
  contextId: string;
}

const CreateTextContextDialog: React.FC<CreateTextContextDialogProps> = ({
  open,
  onClose,
  contextId,
}) => {
  const dispatch = useDispatch();
  const [uploadContextFile, { isLoading }] = useUploadContextFileMutation();

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setContent("");
      setError(null);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Please provide a title for this snippet.");
      return;
    }
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }

    try {
      setError(null);

      const safeTitle = title
        .trim()
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const fileName = `${safeTitle || "scratch_context"}.txt`;

      const file = new File([content], fileName, { type: "text/plain" });

      await uploadContextFile({
        contextId,
        file,
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: "Text context added successfully",
        }),
      );
      onClose();
    } catch (err: any) {
      console.error("Failed to add text context", err);
      setError(err?.data?.message || "Failed to add context. Please try again.");
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Write Context Manually</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" paragraph>
          Type or paste any text below to instantly convert it into AI context.
        </Typography>

        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 1 }}>
          <TextField
            label="Snippet Title"
            variant="outlined"
            fullWidth
            disabled={isLoading}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Onboarding Policies, Code References, etc."
            required
            autoFocus
          />

          <TextField
            label="Raw Text Context"
            variant="outlined"
            fullWidth
            multiline
            minRows={6}
            maxRows={15}
            disabled={isLoading}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your raw text or code here..."
            required
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={isLoading || !title.trim() || !content.trim()}
          startIcon={isLoading ? <CircularProgress size={16} /> : null}
        >
          Add to Context
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateTextContextDialog;
