import React, { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  WorkspaceResponse,
  useUpdateWorkspaceSettingsMutation,
} from "../../../store/apis/workspaceApi";
import { setToastMessage } from "../../../store/slices/app/appSlice";
import { apiErrorMessage } from "../../../utils/apiError";
import { reportUnexpectedError } from "../../../utils/reportError";
import {
  PROVIDER_OPTIONS,
  customProviderOf,
  isValidDomain,
  normaliseDomain,
  providerChoiceOf,
  requiredProviderValue,
} from "./signInRules";

interface SignInRulesPanelProps {
  workspace: WorkspaceResponse;
  canEdit: boolean;
}

/** Allowed email domains, required second factor and required sign-in method. */
const SignInRulesPanel: React.FC<SignInRulesPanelProps> = ({ workspace, canEdit }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [updateSettings, { isLoading }] = useUpdateWorkspaceSettingsMutation();

  const [domains, setDomains] = useState<string[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [requireMfa, setRequireMfa] = useState(false);
  const [providerChoice, setProviderChoice] = useState("none");
  const [customProvider, setCustomProvider] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Start from the saved rules, and again whenever they change on the server.
  useEffect(() => {
    setDomains(workspace.allowedEmailDomains ?? []);
    setRequireMfa(workspace.requireMfa ?? false);
    setProviderChoice(providerChoiceOf(workspace.requiredSignInProvider));
    setCustomProvider(customProviderOf(workspace.requiredSignInProvider));
    setSaveError(null);
  }, [workspace.allowedEmailDomains, workspace.requireMfa, workspace.requiredSignInProvider]);

  const handleDomainsChange = (values: string[]) => {
    const normalised = values.map(normaliseDomain).filter(Boolean);
    const invalid = normalised.find((domain) => !isValidDomain(domain));
    if (invalid) {
      setDomainError(t("workspaceSecurity.signInRules.invalidDomain", { domain: invalid }));
      return;
    }
    setDomainError(null);
    setDomains(Array.from(new Set(normalised)));
  };

  const customProviderId = customProvider.trim();
  const isCustomMissing = providerChoice === "custom" && !customProviderId;

  const handleSave = async () => {
    setSaveError(null);
    try {
      await updateSettings({
        allowedEmailDomains: domains,
        requireMfa,
        requiredSignInProvider: requiredProviderValue(providerChoice, customProvider),
      }).unwrap();
      dispatch(
        setToastMessage({ severity: "success", message: t("workspaceSecurity.signInRules.saved") }),
      );
    } catch (error) {
      reportUnexpectedError("workspace.signInRules", error, { workspaceId: workspace.id });
      // The backend refuses rules that would lock the owner out, and says why.
      setSaveError(apiErrorMessage(error, t("workspaceSecurity.signInRules.saveFailed")));
    }
  };

  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Typography variant="h6">{t("workspaceSecurity.signInRules.title")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("workspaceSecurity.signInRules.description")}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 2 }}>
        {t("workspaceSecurity.signInRules.identityPlatformNote")}
      </Typography>

      {!canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("workspaceSecurity.ownerOnly")}
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 560 }}>
        <Autocomplete
          multiple
          freeSolo
          // Commits a typed domain on blur too, so it is not lost when the user clicks Save.
          autoSelect
          options={[]}
          value={domains}
          disabled={!canEdit}
          onChange={(_event, values) => handleDomainsChange(values as string[])}
          renderTags={(values, getTagProps) =>
            values.map((domain, index) => {
              const { key, ...tagProps } = getTagProps({ index });
              return <Chip key={key} label={domain} size="small" {...tagProps} />;
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label={t("workspaceSecurity.signInRules.domainsLabel")}
              placeholder="acme.com"
              error={!!domainError}
              helperText={domainError ?? t("workspaceSecurity.signInRules.domainsHelper")}
            />
          )}
        />

        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={requireMfa}
                onChange={(event) => setRequireMfa(event.target.checked)}
                disabled={!canEdit}
              />
            }
            label={t("workspaceSecurity.signInRules.requireMfa")}
          />
          <FormHelperText sx={{ mt: 0 }}>
            {t("workspaceSecurity.signInRules.requireMfaHelper")}
          </FormHelperText>
        </Box>

        <FormControl fullWidth disabled={!canEdit}>
          <InputLabel id="required-sign-in-provider">
            {t("workspaceSecurity.signInRules.providerLabel")}
          </InputLabel>
          <Select
            labelId="required-sign-in-provider"
            label={t("workspaceSecurity.signInRules.providerLabel")}
            value={providerChoice}
            onChange={(event) => setProviderChoice(event.target.value)}
          >
            {PROVIDER_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(`workspaceSecurity.signInRules.providers.${option.labelKey}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {providerChoice === "custom" ? (
          <TextField
            label={t("workspaceSecurity.signInRules.customProviderLabel")}
            placeholder="saml.acme"
            value={customProvider}
            onChange={(event) => setCustomProvider(event.target.value)}
            disabled={!canEdit}
            helperText={t("workspaceSecurity.signInRules.customProviderHelper")}
          />
        ) : null}

        {saveError ? <Alert severity="error">{saveError}</Alert> : null}

        {canEdit ? (
          <Box>
            <Button
              variant="contained"
              onClick={() => void handleSave()}
              disabled={isLoading || isCustomMissing}
            >
              {t("workspaceSecurity.signInRules.save")}
            </Button>
          </Box>
        ) : null}
      </Box>
    </Paper>
  );
};

export default SignInRulesPanel;
