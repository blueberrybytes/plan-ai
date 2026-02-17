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
import { useListContextsQuery } from "../../store/apis/contextApi";

interface ChatContextDialogProps {
  open: boolean;
  onClose: () => void;
  onStartChat: (selectedContextIds: string[], title?: string, englishLevel?: string) => void;
  isLoading?: boolean;
  mode?: "create" | "edit";
  initialTitle?: string;
  initialSelectedContextIds?: string[];
}

const ChatContextDialog: React.FC<ChatContextDialogProps> = ({
  open,
  onClose,
  onStartChat,
  isLoading = false,
  mode = "create",
  initialTitle = "",
  initialSelectedContextIds = [],
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>(initialSelectedContextIds);
  const [englishLevel, setEnglishLevel] = useState<string>("");
  const { data: contextResponse } = useListContextsQuery();
  const contexts = contextResponse?.data?.contexts ?? [];

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSelectedContextIds(initialSelectedContextIds);
      setEnglishLevel("");
    }
  }, [open, initialTitle, initialSelectedContextIds]);

  const handleToggleContext = (id: string) => {
    const newSelection = selectedContextIds.includes(id)
      ? selectedContextIds.filter((cid) => cid !== id)
      : [...selectedContextIds, id];
    setSelectedContextIds(newSelection);
  };

  const handleStart = () => {
    onStartChat(selectedContextIds, title, englishLevel);
  };

  const isStartDisabled = isLoading || selectedContextIds.length === 0;

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
            label={t("chatContextDialog.englishLevelLabel")}
            value={englishLevel}
            onChange={(e) => setEnglishLevel(e.target.value)}
            variant="outlined"
            SelectProps={{
              native: true,
            }}
          >
            <option value=""></option>
            <option value="Beginner">{t("chatContextDialog.englishLevels.Beginner")}</option>
            <option value="Intermediate">
              {t("chatContextDialog.englishLevels.Intermediate")}
            </option>
            <option value="Advanced">{t("chatContextDialog.englishLevels.Advanced")}</option>
            <option value="Native">{t("chatContextDialog.englishLevels.Native")}</option>
          </TextField>
        </Box>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t("chat.dialog.description")}
        </Typography>

        {contexts.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 3 }}>
            <Typography variant="body1" color="text.secondary" paragraph>
              {t("chat.dialog.noContexts")}
            </Typography>
            <Button
              component={RouterLink}
              to="/contexts"
              variant="contained"
              color="primary"
              onClick={onClose}
            >
              {t("chat.dialog.createContext")}
            </Button>
          </Box>
        ) : (
          <List sx={{ maxHeight: 300, overflowY: "auto" }}>
            {contexts.map((ctx) => (
              <ListItemButton key={ctx.id} onClick={() => handleToggleContext(ctx.id)}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedContextIds.includes(ctx.id)}
                      onChange={() => handleToggleContext(ctx.id)}
                      onClick={(e) => e.stopPropagation()} // Prevent double toggle
                    />
                  }
                  label={ctx.name}
                  sx={{ width: "100%", mr: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("chat.buttons.cancel")}</Button>
        {contexts.length > 0 && (
          <Button onClick={handleStart} variant="contained" disabled={isStartDisabled}>
            {mode === "create" ? t("chat.buttons.start") : t("common.buttons.save") || "Save"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ChatContextDialog;
