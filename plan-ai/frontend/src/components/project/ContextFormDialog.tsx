import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export interface ContextFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  name: string;
  description: string;
  color: string;
  error: string | null;
  isSubmitting: boolean;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeColor: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ContextFormDialog: React.FC<ContextFormDialogProps> = ({
  open,
  mode,
  name,
  description,
  color,
  error,
  isSubmitting,
  onChangeName,
  onChangeDescription,
  onChangeColor,
  onSubmit,
  onClose,
}) => {
  const { t } = useTranslation();

  const title =
    mode === "create" ? t("contexts.dialog.title.create") : t("contexts.dialog.title.edit");
  const submitLabel = isSubmitting
    ? mode === "create"
      ? t("contexts.dialog.primary.creating")
      : t("contexts.dialog.primary.saving")
    : mode === "create"
      ? t("contexts.dialog.primary.create")
      : t("contexts.dialog.primary.save");

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label={t("contexts.dialog.fields.name")}
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            required
            autoFocus
            disabled={isSubmitting}
          />
          <TextField
            label={t("contexts.dialog.fields.description")}
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            multiline
            minRows={2}
            disabled={isSubmitting}
          />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              label={t("contexts.dialog.fields.color")}
              type="color"
              value={color}
              onChange={(e) => onChangeColor(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 120 }}
              disabled={isSubmitting}
            />
            <Typography variant="body2" color="text.secondary">
              {color.toUpperCase()}
            </Typography>
          </Stack>
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t("contexts.buttons.cancel")}
        </Button>
        <Button onClick={onSubmit} variant="contained" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContextFormDialog;
