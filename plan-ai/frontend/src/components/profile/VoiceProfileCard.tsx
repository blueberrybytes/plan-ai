import React, { useState } from "react";
import { Button, Paper, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useDeleteVoiceProfileMutation } from "../../store/apis/authApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import ConfirmDeletionDialog from "../dialogs/ConfirmDeletionDialog";

/** Lets the user delete their voice print (biometric data). Shown only when one exists. */
const VoiceProfileCard: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteVoiceProfile, { isLoading }] = useDeleteVoiceProfileMutation();

  const handleDelete = async () => {
    try {
      const response = await deleteVoiceProfile().unwrap();
      if (response.data?.deleted === false) throw new Error("Voice profile not deleted");
      dispatch(setToastMessage({ severity: "success", message: t("voiceProfile.deleted") }));
    } catch {
      dispatch(setToastMessage({ severity: "error", message: t("voiceProfile.deleteFailed") }));
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        {t("voiceProfile.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("voiceProfile.description")}
      </Typography>
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteOutlineIcon />}
        onClick={() => setConfirmOpen(true)}
        disabled={isLoading}
      >
        {t("voiceProfile.delete")}
      </Button>

      <ConfirmDeletionDialog
        open={confirmOpen}
        title={t("voiceProfile.confirmTitle")}
        description={t("voiceProfile.confirmDescription")}
        isProcessing={isLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Paper>
  );
};

export default VoiceProfileCard;
