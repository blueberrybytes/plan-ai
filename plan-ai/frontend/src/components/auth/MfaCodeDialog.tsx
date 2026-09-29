import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { MfaCodePrompt, setMfaPromptListener } from "../../services/mfaService";

const CODE_PATTERN = /^\d{6}$/;

/**
 * Asks for the authenticator code when a sign-in needs two-step verification.
 * Mounted once in App. The sign-in saga opens it through mfaService.
 */
const MfaCodeDialog: React.FC = () => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<MfaCodePrompt | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setMfaPromptListener((next) => {
      setPrompt(next);
      setCode("");
    });
    return () => setMfaPromptListener(null);
  }, []);

  if (!prompt) return null;

  const isValid = CODE_PATTERN.test(code);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isValid) prompt.submit(code);
  };

  return (
    <Dialog open onClose={prompt.cancel} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t("mfa.prompt.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("mfa.prompt.description")}
          </Typography>
          {prompt.errorKey ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {t(prompt.errorKey)}
            </Alert>
          ) : null}
          <TextField
            autoFocus
            fullWidth
            label={t("mfa.prompt.codeLabel")}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputProps={{ inputMode: "numeric", autoComplete: "one-time-code" }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={prompt.cancel}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={!isValid}>
            {t("mfa.prompt.verify")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default MfaCodeDialog;
