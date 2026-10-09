import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { WebhookEndpoint } from "../../../store/apis/webhookApi";
import { WEBHOOK_EVENTS, webhookEventLabelKey } from "./webhookEvents";

export interface WebhookEndpointForm {
  url: string;
  description: string;
  events: string[];
}

interface Props {
  open: boolean;
  /** The endpoint being edited, or null to add one. */
  endpoint: WebhookEndpoint | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: WebhookEndpointForm) => void;
}

const WebhookEndpointDialog: React.FC<Props> = ({
  open,
  endpoint,
  saving,
  error,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setUrl(endpoint?.url ?? "");
    setDescription(endpoint?.description ?? "");
    setEvents(endpoint?.events ?? []);
  }, [open, endpoint]);

  const toggle = (event: string) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((e) => e !== event) : [...current, event],
    );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {endpoint ? t("webhooks.dialog.editTitle") : t("webhooks.dialog.addTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            fullWidth
            autoFocus
            label={t("webhooks.dialog.url")}
            helperText={t("webhooks.dialog.urlHelp")}
            placeholder="https://example.com/plan-ai-webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <TextField
            fullWidth
            label={t("webhooks.dialog.description")}
            helperText={t("webhooks.dialog.descriptionHelp")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            inputProps={{ maxLength: 200 }}
          />
          <Box>
            <Typography variant="subtitle2">{t("webhooks.dialog.events")}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("webhooks.dialog.eventsHelp")}
            </Typography>
            <Stack>
              {WEBHOOK_EVENTS.map((event) => (
                <FormControlLabel
                  key={event}
                  sx={{ alignItems: "flex-start", py: 0.25 }}
                  control={
                    <Checkbox
                      size="small"
                      sx={{ pt: 0.5 }}
                      checked={events.includes(event)}
                      onChange={() => toggle(event)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {event}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(webhookEventLabelKey(event))}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("webhooks.dialog.cancel")}</Button>
        <Button
          variant="contained"
          disabled={!url.trim() || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
          onClick={() => onSave({ url: url.trim(), description: description.trim(), events })}
        >
          {endpoint ? t("webhooks.dialog.save") : t("webhooks.dialog.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WebhookEndpointDialog;
