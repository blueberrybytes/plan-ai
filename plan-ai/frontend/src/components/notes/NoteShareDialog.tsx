import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useTranslation } from "react-i18next";

interface NoteShareDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before a private note becomes visible to every workspace member. */
const NoteShareDialog: React.FC<NoteShareDialogProps> = ({ open, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{t("notes.shareDialog.title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("notes.shareDialog.body")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("notes.shareDialog.cancel")}</Button>
        <Button variant="contained" onClick={onConfirm} autoFocus>
          {t("notes.shareDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NoteShareDialog;
