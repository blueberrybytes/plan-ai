import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useDeleteWorkspaceMutation, workspaceApi } from "../../../store/apis/workspaceApi";
import { setActiveWorkspaceId, setToastMessage } from "../../../store/slices/app/appSlice";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { apiErrorMessage } from "../../../utils/apiError";

interface DeleteWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
}

/** The owner types the workspace name to confirm. Backend messages (409, 400) are shown as is. */
const DeleteWorkspaceDialog: React.FC<DeleteWorkspaceDialogProps> = ({
  open,
  onClose,
  workspaceId,
  workspaceName,
}) => {
  const { t } = useTranslation();
  // Thunk-aware dispatch, to run an RTK Query endpoint once without subscribing to it.
  const dispatch = useDispatch<ThunkDispatch<unknown, unknown, UnknownAction>>();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteWorkspace, { isLoading }] = useDeleteWorkspaceMutation();

  const handleClose = () => {
    if (isLoading) return;
    setConfirmName("");
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setError(null);
    try {
      await deleteWorkspace({ confirmName: confirmName.trim() }).unwrap();
    } catch (err) {
      setError(apiErrorMessage(err, t("workspaceSecurity.data.delete.failed")));
      return;
    }

    // Pick another workspace from a fresh list. The cached list still holds the deleted one.
    let nextWorkspaceId: string | null = null;
    try {
      const workspaces = await dispatch(
        workspaceApi.endpoints.getMyWorkspaces.initiate(undefined, {
          forceRefetch: true,
          subscribe: false,
        }),
      ).unwrap();
      nextWorkspaceId = workspaces.find((w) => w.id !== workspaceId)?.id ?? null;
    } catch {
      // The switcher picks a workspace once the list loads again.
    }
    dispatch(setActiveWorkspaceId(nextWorkspaceId));
    dispatch(
      setToastMessage({ severity: "success", message: t("workspaceSecurity.data.delete.done") }),
    );
    setConfirmName("");
    onClose();
    navigate("/home");
  };

  const nameMatches = confirmName.trim() === workspaceName.trim();

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberIcon color="error" />
        {t("workspaceSecurity.data.delete.title")}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("workspaceSecurity.data.delete.description")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t("workspaceSecurity.data.delete.dialogWarning")}
        </Typography>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            mb: 2,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontWeight: 600,
            wordBreak: "break-word",
          }}
        >
          {workspaceName}
        </Box>
        <TextField
          autoFocus
          fullWidth
          label={t("workspaceSecurity.data.delete.confirmLabel")}
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          disabled={isLoading}
        />
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void handleConfirm()}
          disabled={!nameMatches || isLoading}
        >
          {t("workspaceSecurity.data.delete.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteWorkspaceDialog;
