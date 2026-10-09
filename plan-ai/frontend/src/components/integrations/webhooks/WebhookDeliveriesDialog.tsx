import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useListWebhookDeliveriesQuery,
  useRedeliverWebhookMutation,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "../../../store/apis/webhookApi";
import { apiErrorMessage } from "./webhookEvents";

interface Props {
  /** The endpoint whose deliveries are shown, or null when closed. */
  endpoint: WebhookEndpoint | null;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "success.main",
  FAILED: "error.main",
  PENDING: "text.secondary",
};

interface RowProps {
  delivery: WebhookDelivery;
  busy: boolean;
  onRedeliver: () => void;
}

const DeliveryRow: React.FC<RowProps> = ({ delivery, busy, onRedeliver }) => {
  const { t } = useTranslation();
  const [showPayload, setShowPayload] = useState(false);
  const hidden = delivery.payload === null;

  return (
    <Box sx={{ py: 1.5 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap">
            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
              {delivery.event}
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ color: STATUS_COLOR[delivery.status] ?? "text.secondary" }}
            >
              {t(`webhooks.deliveries.status.${delivery.status}`, delivery.status)}
            </Typography>
            {delivery.responseStatus !== null && (
              <Typography variant="body2" color="text.secondary">
                HTTP {delivery.responseStatus}
              </Typography>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {new Date(delivery.createdAt).toLocaleString()}
            {", "}
            {t("webhooks.deliveries.attempts", { count: delivery.attempts })}
          </Typography>
          {delivery.error && (
            <Typography
              variant="caption"
              color="error"
              display="block"
              sx={{ wordBreak: "break-word" }}
            >
              {delivery.error}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} flexShrink={0}>
          <Button size="small" disabled={hidden} onClick={() => setShowPayload((v) => !v)}>
            {showPayload
              ? t("webhooks.deliveries.hidePayload")
              : t("webhooks.deliveries.showPayload")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={busy || hidden || delivery.status === "PENDING"}
            onClick={onRedeliver}
          >
            {t("webhooks.deliveries.redeliver")}
          </Button>
        </Stack>
      </Stack>
      {hidden && (
        <Typography variant="caption" color="text.secondary">
          {t("webhooks.deliveries.payloadHidden")}
        </Typography>
      )}
      {showPayload && !hidden && (
        <Box
          component="pre"
          sx={{
            bgcolor: "action.hover",
            borderRadius: 1.5,
            p: 2,
            mt: 1,
            mb: 0,
            fontSize: 12,
            fontFamily: "monospace",
            overflowX: "auto",
            maxHeight: 280,
          }}
        >
          {JSON.stringify(delivery.payload, null, 2)}
        </Box>
      )}
    </Box>
  );
};

/** The last deliveries of one endpoint, with what was sent and a way to send it again. */
const WebhookDeliveriesDialog: React.FC<Props> = ({ endpoint, onClose }) => {
  const { t } = useTranslation();
  const endpointId = endpoint?.id ?? "";
  const { data, isLoading, isFetching, isError, refetch } = useListWebhookDeliveriesQuery(
    endpointId,
    // A delivery is sent in the background: keep the list fresh while it is open.
    { skip: !endpoint, pollingInterval: 5000 },
  );
  const [redeliver, { isLoading: isRedelivering }] = useRedeliverWebhookMutation();
  const [error, setError] = useState<string | null>(null);
  const deliveries = data?.deliveries ?? [];

  const handleRedeliver = async (deliveryId: string) => {
    setError(null);
    try {
      await redeliver({ endpointId, deliveryId }).unwrap();
    } catch (err) {
      setError(apiErrorMessage(err) ?? t("webhooks.actionFailed"));
    }
  };

  return (
    <Dialog open={!!endpoint} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("webhooks.deliveries.title")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>
          {endpoint?.url}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("webhooks.deliveries.lastFifty")}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Box sx={{ mt: 2 }}>
          {isLoading ? (
            <CircularProgress size={24} sx={{ display: "block", my: 2 }} />
          ) : isError ? (
            <Alert severity="error">{t("webhooks.loadError")}</Alert>
          ) : deliveries.length === 0 ? (
            <Alert severity="info">{t("webhooks.deliveries.empty")}</Alert>
          ) : (
            <Stack divider={<Divider />}>
              {deliveries.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  busy={isRedelivering}
                  onRedeliver={() => void handleRedeliver(delivery.id)}
                />
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => void refetch()} disabled={isFetching}>
          {t("webhooks.deliveries.refresh")}
        </Button>
        <Button variant="contained" onClick={onClose}>
          {t("webhooks.deliveries.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WebhookDeliveriesDialog;
