import React from "react";
import { useTranslation } from "react-i18next";
import { useWithdrawPersonalConsentMutation } from "../../store/apis/personalApi";
import ConfirmDeletionDialog from "../dialogs/ConfirmDeletionDialog";
import { useTrackerToast } from "../trackers/useTrackerToast";

interface WithdrawConsentDialogProps {
  open: boolean;
  onClose: () => void;
  onWithdrawn?: () => void;
}

/** Says what is deleted (trackers and entries) and what stays (notes). */
const WithdrawConsentDialog: React.FC<WithdrawConsentDialogProps> = ({
  open,
  onClose,
  onWithdrawn,
}) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const [withdraw, { isLoading }] = useWithdrawPersonalConsentMutation();

  const confirm = async () => {
    try {
      await withdraw().unwrap();
      toast.success("personal.withdraw.done");
      onClose();
      onWithdrawn?.();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <ConfirmDeletionDialog
      open={open}
      title={t("personal.withdraw.title")}
      description={t("personal.withdraw.body")}
      additionalWarning={t("personal.withdraw.notesStay")}
      confirmLabel={t("personal.withdraw.confirm")}
      cancelLabel={t("personal.withdraw.cancel")}
      isProcessing={isLoading}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
};

export default WithdrawConsentDialog;
