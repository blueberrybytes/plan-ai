import React, { useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  Button,
  TextField,
  IconButton,
  Stack,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import {
  Tag as TagIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../../store/slices/app/appSlice";
import {
  useGetContextQuery,
  useUpdateContextKeywordsMutation,
} from "../../store/apis/contextApi";

interface ProjectKeywordsTabProps {
  contextId: string;
}

const ProjectKeywordsTab: React.FC<ProjectKeywordsTabProps> = ({ contextId }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const { data, isLoading, error, refetch } = useGetContextQuery(contextId, {
    skip: !contextId,
  });
  const [updateKeywords, { isLoading: isSaving }] = useUpdateContextKeywordsMutation();

  const context = data?.data;
  const keywords = context?.keywords || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editableKeywords, setEditableKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  const startEditing = () => {
    setEditableKeywords([...keywords]);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditableKeywords([]);
    setNewKeyword("");
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (editableKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      dispatch(
        setToastMessage({
          severity: "warning",
          message: "This keyword already exists.",
        }),
      );
      return;
    }
    setEditableKeywords([...editableKeywords, trimmed]);
    setNewKeyword("");
  };

  const handleRemoveKeyword = (index: number) => {
    setEditableKeywords(editableKeywords.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      await updateKeywords({ contextId, keywords: editableKeywords }).unwrap();
      dispatch(
        setToastMessage({
          severity: "success",
          message: "Keywords updated successfully.",
        }),
      );
      setIsEditing(false);
      setNewKeyword("");
      refetch();
    } catch (err) {
      console.error("Failed to update keywords", err);
      dispatch(
        setToastMessage({
          severity: "error",
          message: "Failed to update keywords.",
        }),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {t("contexts.messages.contextError", "Failed to load context data.")}
      </Alert>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography
          variant="h6"
          fontWeight={600}
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <TagIcon color="primary" />
          {t("projectDetails.tabs.keywords", "Project Keywords")}
        </Typography>

        {!isEditing ? (
          <Button startIcon={<EditIcon />} onClick={startEditing} size="small">
            Edit Keywords
          </Button>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<CloseIcon />}
              onClick={cancelEditing}
              size="small"
              color="inherit"
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              size="small"
              disabled={isSaving}
            >
              Save
            </Button>
          </Stack>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These keywords are automatically extracted from your uploaded files and used as a custom
        vocabulary to improve the accuracy of your audio and video transcriptions. They help the
        speech recognition engine correctly identify names, acronyms, technical terms, and
        domain-specific jargon that it wouldn't otherwise recognize. You can also add, edit, or
        remove keywords manually.
      </Typography>

      {isEditing ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          {/* Add new keyword input */}
          <TextField
            fullWidth
            size="small"
            placeholder="Type a keyword and press Enter..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Add keyword">
                    <IconButton
                      onClick={handleAddKeyword}
                      disabled={!newKeyword.trim()}
                      size="small"
                      color="primary"
                    >
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />

          {/* Editable keyword chips */}
          {editableKeywords.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: "center" }}>
              No keywords yet. Type above to add some.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {editableKeywords.map((keyword, index) => (
                <Chip
                  key={index}
                  label={keyword}
                  onDelete={() => handleRemoveKeyword(index)}
                  color="primary"
                  variant="outlined"
                  sx={{ fontSize: "0.9rem" }}
                />
              ))}
            </Box>
          )}
        </Paper>
      ) : keywords.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            py: 8,
            textAlign: "center",
            borderRadius: 2,
            bgcolor: "background.paper",
          }}
        >
          <TagIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No keywords have been extracted for this project yet.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Upload files to automatically generate keywords, or add them manually.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={startEditing}>
            Add Keywords Manually
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            {keywords.map((keyword, index) => (
              <Chip
                key={index}
                label={keyword}
                color="primary"
                variant="outlined"
                sx={{ fontSize: "0.9rem", py: 2, px: 1 }}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default ProjectKeywordsTab;
