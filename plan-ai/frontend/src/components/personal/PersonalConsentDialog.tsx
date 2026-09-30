import React, { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  useEnablePersonalModeMutation,
  useGetPersonalStatusQuery,
  type PersonalStatus,
} from "../../store/apis/personalApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { apiErrorCode, apiErrorMessage } from "../trackers/trackerUtils";
import { reportUnexpectedError } from "../../utils/reportError";

interface PersonalConsentDialogProps {
  open: boolean;
  onClose: () => void;
  onEnabled?: (status: PersonalStatus) => void;
}

const POINTS = [
  "personal.consent.what",
  "personal.consent.healthData",
  "personal.consent.private",
  "personal.consent.ai",
  "personal.consent.estimates",
  "personal.consent.withdraw",
];

/** Explains personal mode and asks for explicit consent to store health data. */
const PersonalConsentDialog: React.FC<PersonalConsentDialogProps> = ({
  open,
  onClose,
  onEnabled,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: status, refetch } = useGetPersonalStatusQuery();
  const [enable, { isLoading }] = useEnablePersonalModeMutation();
  const [agreed, setAgreed] = useState(false);
  const [textChanged, setTextChanged] = useState(false);

  const close = () => {
    if (isLoading) return;
    setAgreed(false);
    setTextChanged(false);
    onClose();
  };

  const handleAccept = async () => {
    if (!status) return;
    try {
      const next = await enable({
        consent: true,
        consentVersion: status.currentConsentVersion,
      }).unwrap();
      setAgreed(false);
      setTextChanged(false);
      onEnabled?.(next);
    } catch (error) {
      if (apiErrorCode(error) === "consent_outdated") {
        setAgreed(false);
        setTextChanged(true);
        void refetch();
        return;
      }
      reportUnexpectedError("personal.enable", error);
      dispatch(
        setToastMessage({
          severity: "error",
          message: apiErrorMessage(error) ?? t("personal.consent.failed"),
        }),
      );
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{t("personal.consent.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {status?.consentOutdated && !textChanged && (
            <Alert severity="info">{t("personal.consent.outdated")}</Alert>
          )}
          {textChanged && <Alert severity="warning">{t("personal.consent.changedNow")}</Alert>}
          {POINTS.map((key) => (
            <Typography key={key} variant="body2">
              {t(key)}
            </Typography>
          ))}
          <FormControlLabel
            control={
              <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            }
            label={<Typography variant="body2">{t("personal.consent.checkbox")}</Typography>}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={isLoading}>
          {t("personal.consent.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleAccept}
          disabled={!agreed || !status || isLoading}
        >
          {t("personal.consent.accept")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PersonalConsentDialog;
