import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItemButton,
  FormControlLabel,
  Checkbox,
  Box,
  TextField,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useListProjectsQuery } from "../../store/apis/projectApi";
import AiModelSelector from "../common/AiModelSelector";

interface ChatContextDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Receives projectIds (1:1 with the Context that each Project owns
   * internally). Backend translates projectIds → contextIds before storing.
   */
  onStartChat: (
    selectedProjectIds: string[],
    title?: string,
    complexityLevel?: string,
    modelKey?: string | null,
  ) => void;
  isLoading?: boolean;
  mode?: "create" | "edit";
  initialTitle?: string;
  initialSelectedProjectIds?: string[];
}

const ChatContextDialog: React.FC<ChatContextDialogProps> = ({
  open,
  onClose,
  onStartChat,
  isLoading = false,
  mode = "create",
  initialTitle = "",
  initialSelectedProjectIds = [],
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(initialSelectedProjectIds);
  const [complexityLevel, setEnglishLevel] = useState<string>("");
  // Hydrate from localStorage synchronously to avoid the "Auto Model" flash.
  const [modelKey, setModelKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("preferred_ai_model");
  });
  const { data: projectsResponse } = useListProjectsQuery(undefined);
  const projects = projectsResponse?.data?.projects ?? [];

  // Reset selection when dialog opens. modelKey is re-read from localStorage so
  // it reflects any change made in another chat surface since the last open.
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSelectedProjectIds(initialSelectedProjectIds);
      setEnglishLevel("");
      if (typeof window !== "undefined") {
        setModelKey(localStorage.getItem("preferred_ai_model"));
      }
    }
  }, [open, initialTitle, initialSelectedProjectIds]);

  const handleToggleProject = (id: string) => {
    const newSelection = selectedProjectIds.includes(id)
      ? selectedProjectIds.filter((pid) => pid !== id)
      : [...selectedProjectIds, id];
    setSelectedProjectIds(newSelection);
  };

  const handleStart = () => {
    onStartChat(selectedProjectIds, title, complexityLevel, modelKey);
  };

  const isStartDisabled = isLoading || selectedProjectIds.length === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === "create" ? t("chat.dialog.title") : t("chat.sidebar.edit")}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, mb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            fullWidth
            label={t("chat.fields.title") || "Title"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("chat.sidebar.newChat") || "New Chat"}
            variant="outlined"
          />
          <TextField
            select
            fullWidth
            label={t("chatContextDialog.complexityLevelLabel")}
            value={complexityLevel}
            onChange={(e) => setEnglishLevel(e.target.value)}
            variant="outlined"
            SelectProps={{
              native: true,
            }}
          >
            <option value=""></option>
            <option value="Beginner">{t("chatContextDialog.complexityLevels.Beginner")}</option>
            <option value="Intermediate">
              {t("chatContextDialog.complexityLevels.Intermediate")}
            </option>
            <option value="Advanced">{t("chatContextDialog.complexityLevels.Advanced")}</option>
            <option value="Native">{t("chatContextDialog.complexityLevels.Native")}</option>
          </TextField>

          <AiModelSelector value={modelKey} onChange={setModelKey} disabled={isLoading} />
        </Box>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t("chat.dialog.description")}
        </Typography>

        {projects.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 3 }}>
            <Typography variant="body1" color="text.secondary" paragraph>
              {t("chat.dialog.noProjects") || "You don't have any projects yet."}
            </Typography>
            <Button
              component={RouterLink}
              to="/projects"
              variant="contained"
              color="primary"
              onClick={onClose}
            >
              {t("chat.dialog.createProject") || "Create your first Project"}
            </Button>
          </Box>
        ) : (
          <List sx={{ maxHeight: 300, overflowY: "auto" }}>
            {projects.map((proj) => (
              <ListItemButton key={proj.id} onClick={() => handleToggleProject(proj.id)}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedProjectIds.includes(proj.id)}
                      onChange={() => handleToggleProject(proj.id)}
                      onClick={(e) => e.stopPropagation()} // Prevent double toggle
                    />
                  }
                  label={proj.title}
                  sx={{ width: "100%", mr: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("chat.buttons.cancel")}</Button>
        {projects.length > 0 && (
          <Button onClick={handleStart} variant="contained" disabled={isStartDisabled}>
            {mode === "create" ? t("chat.buttons.start") : t("common.buttons.save") || "Save"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ChatContextDialog;
