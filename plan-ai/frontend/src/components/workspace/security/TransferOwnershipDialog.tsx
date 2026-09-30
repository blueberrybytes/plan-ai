import React, { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  WorkspaceMemberResponse,
  useTransferWorkspaceOwnershipMutation,
} from "../../../store/apis/workspaceApi";
import { setToastMessage } from "../../../store/slices/app/appSlice";
import { apiErrorMessage } from "../../../utils/apiError";
import { reportUnexpectedError } from "../../../utils/reportError";

interface TransferOwnershipDialogProps {
  open: boolean;
  onClose: () => void;
  /** Active members who can become the owner (the current owner is not in the list). */
  candidates: WorkspaceMemberResponse[];
}

const TransferOwnershipDialog: React.FC<TransferOwnershipDialogProps> = ({
  open,
  onClose,
  candidates,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [memberId, setMemberId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transfer, { isLoading }] = useTransferWorkspaceOwnershipMutation();

  const handleClose = () => {
    if (isLoading) return;
    setMemberId("");
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setError(null);
    try {
      await transfer({ memberId }).unwrap();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("workspaceSecurity.data.transfer.done"),
        }),
      );
      setMemberId("");
      onClose();
    } catch (err) {
      reportUnexpectedError("workspace.transferOwnership", err, { memberId });
      setError(apiErrorMessage(err, t("workspaceSecurity.data.transfer.failed")));
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("workspaceSecurity.data.transfer.title")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("workspaceSecurity.data.transfer.description")}
        </Typography>
        {candidates.length === 0 ? (
          <Alert severity="info">{t("workspaceSecurity.data.transfer.noMembers")}</Alert>
        ) : (
          <FormControl fullWidth>
            <InputLabel id="transfer-owner-select">
              {t("workspaceSecurity.data.transfer.memberLabel")}
            </InputLabel>
            <Select
              labelId="transfer-owner-select"
              label={t("workspaceSecurity.data.transfer.memberLabel")}
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              {candidates.map((member) => (
                <MenuItem key={member.id} value={member.id}>
                  {member.name ? `${member.name} (${member.email})` : member.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
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
          color="warning"
          onClick={() => void handleConfirm()}
          disabled={!memberId || isLoading}
        >
          {t("workspaceSecurity.data.transfer.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TransferOwnershipDialog;
