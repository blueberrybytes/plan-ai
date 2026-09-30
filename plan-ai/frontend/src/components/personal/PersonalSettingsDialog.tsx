import React, { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useGetPersonalStatusQuery,
  useUpdatePersonalSettingsMutation,
  type PersonalSettingsRequest,
} from "../../store/apis/personalApi";
import { useTrackerToast } from "../trackers/useTrackerToast";
import WithdrawConsentDialog from "./WithdrawConsentDialog";

interface PersonalSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Hide calories, read notes automatically, and withdraw consent. */
const PersonalSettingsDialog: React.FC<PersonalSettingsDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const { data: status } = useGetPersonalStatusQuery();
  const [updateSettings] = useUpdatePersonalSettingsMutation();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const change = async (patch: PersonalSettingsRequest) => {
    try {
      await updateSettings(patch).unwrap();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t("personal.settings.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <SettingSwitch
              checked={status?.hideCalories ?? false}
              label={t("personal.settings.hideCalories")}
              help={t("personal.settings.hideCaloriesHelp")}
              onChange={(hideCalories) => void change({ hideCalories })}
            />
            <SettingSwitch
              checked={status?.autoExtract ?? false}
              label={t("personal.settings.autoExtract")}
              help={t("personal.settings.autoExtractHelp")}
              onChange={(autoExtract) => void change({ autoExtract })}
            />
            <Divider />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t("personal.settings.withdrawHelp")}
              </Typography>
              <Button color="error" variant="outlined" onClick={() => setWithdrawOpen(true)}>
                {t("personal.settings.withdraw")}
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("personal.settings.close")}</Button>
        </DialogActions>
      </Dialog>
      <WithdrawConsentDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onWithdrawn={onClose}
      />
    </>
  );
};

interface SettingSwitchProps {
  checked: boolean;
  label: string;
  help: string;
  onChange: (checked: boolean) => void;
}

const SettingSwitch: React.FC<SettingSwitchProps> = ({ checked, label, help, onChange }) => (
  <Box>
    <FormControlLabel
      control={<Switch checked={checked} onChange={(event) => onChange(event.target.checked)} />}
      label={label}
    />
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 6 }}>
      {help}
    </Typography>
  </Box>
);

export default PersonalSettingsDialog;
