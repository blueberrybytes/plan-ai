import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTranslation } from "react-i18next";

export interface ConfirmDeletionDialogProps {
  open: boolean;
  title?: string;
  entityName?: string;
  description?: string;
  additionalWarning?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDeletionDialog: React.FC<ConfirmDeletionDialogProps> = ({
  open,
  title,
  entityName,
  description,
  additionalWarning,
  confirmLabel,
  cancelLabel,
  isProcessing = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  const resolvedTitle = title ?? t("confirmDeletionDialog.title");
  const resolvedDescription = description ?? t("confirmDeletionDialog.descriptionFallback");
  const resolvedConfirmLabel = confirmLabel ?? t("confirmDeletionDialog.buttons.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("confirmDeletionDialog.buttons.cancel");

  return (
    <Dialog open={open} onClose={isProcessing ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <WarningAmberIcon color="warning" />
        {resolvedTitle}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div" sx={{ color: "text.primary" }}>
          {resolvedDescription ? (
            <Typography variant="body2" sx={{ mb: entityName ? 2 : 0 }}>
              {resolvedDescription}
            </Typography>
          ) : null}
          {entityName ? (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 1,
                bgcolor: "warning.light",
                color: "warning.contrastText",
                fontWeight: 600,
              }}
            >
              {entityName}
            </Box>
          ) : null}
        </DialogContentText>
        {additionalWarning ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {additionalWarning}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={isProcessing} variant="outlined">
          {resolvedCancelLabel}
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={isProcessing}>
          {isProcessing ? t("confirmDeletionDialog.buttons.processing") : resolvedConfirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDeletionDialog;
