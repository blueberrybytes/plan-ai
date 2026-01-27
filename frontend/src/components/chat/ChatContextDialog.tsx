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
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useListContextsQuery } from "../../store/apis/contextApi";

interface ChatContextDialogProps {
  open: boolean;
  onClose: () => void;
  onStartChat: (selectedContextIds: string[]) => void;
  isLoading?: boolean;
}

const ChatContextDialog: React.FC<ChatContextDialogProps> = ({
  open,
  onClose,
  onStartChat,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const { data: contextResponse } = useListContextsQuery();
  const contexts = contextResponse?.data?.contexts ?? [];

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedContextIds([]);
    }
  }, [open]);

  const handleToggleContext = (id: string) => {
    const newSelection = selectedContextIds.includes(id)
      ? selectedContextIds.filter((cid) => cid !== id)
      : [...selectedContextIds, id];
    setSelectedContextIds(newSelection);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("chat.dialog.title")}</DialogTitle>
      <DialogContent>
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
          <Button
            onClick={() => onStartChat(selectedContextIds)}
            variant="contained"
            disabled={isLoading}
          >
            {t("chat.buttons.start")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ChatContextDialog;
