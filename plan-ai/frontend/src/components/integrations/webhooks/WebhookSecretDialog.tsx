import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useTranslation } from "react-i18next";

interface Props {
  /** The secret to show, or null when the dialog is closed. */
  secret: string | null;
  /** True after a rotation, false after creating the endpoint. */
  rotated: boolean;
  onClose: () => void;
}

/** Shows a signing secret once. It cannot be read again after this closes. */
const WebhookSecretDialog: React.FC<Props> = ({ secret, rotated, onClose }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={!!secret} maxWidth="sm" fullWidth>
      <DialogTitle>{t("webhooks.secret.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {rotated ? t("webhooks.secret.rotatedIntro") : t("webhooks.secret.createdIntro")}
          </Typography>
          <Box sx={{ position: "relative" }}>
            <Box
              component="pre"
              sx={{
                bgcolor: "action.hover",
                borderRadius: 1.5,
                p: 2,
                pr: 6,
                m: 0,
                fontSize: 12,
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {secret}
            </Box>
            <Tooltip title={copied ? t("webhooks.secret.copied") : t("webhooks.secret.copy")}>
              <IconButton
                size="small"
                onClick={copy}
                aria-label={t("webhooks.secret.copy")}
                sx={{ position: "absolute", top: 8, right: 8 }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Alert severity="warning">{t("webhooks.secret.warning")}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>
          {t("webhooks.secret.done")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WebhookSecretDialog;
