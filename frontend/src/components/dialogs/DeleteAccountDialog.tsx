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
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTranslation } from "react-i18next";

export type DeleteAccountDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  userEmail: string;
};

const DeleteAccountDialog: React.FC<DeleteAccountDialogProps> = ({
  open,
  onClose,
  onConfirm,
  isLoading = false,
  errorMessage,
  userEmail,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberIcon color="warning" />
        {t("deleteAccountDialog.title")}
      </DialogTitle>

      <DialogContent>
        <DialogContentText component="div" sx={{ color: "text.primary" }}>
          <Box component="p" sx={{ mb: 1.5 }}>
            {t("deleteAccountDialog.description")}
          </Box>
          <Box component="p" sx={{ mb: 1.5 }}>
            {t("deleteAccountDialog.confirmPrompt")}
          </Box>
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
            {userEmail || t("deleteAccountDialog.emailFallback")}
          </Box>
        </DialogContentText>

        {errorMessage ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={isLoading} variant="outlined">
          {t("deleteAccountDialog.buttons.cancel")}
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={isLoading}>
          {isLoading
            ? t("deleteAccountDialog.buttons.deleting")
            : t("deleteAccountDialog.buttons.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteAccountDialog;
