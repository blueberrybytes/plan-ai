import React from "react";
import { Box, Button, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { WebhookEndpoint } from "../../../store/apis/webhookApi";
import { WEBHOOK_DISABLE_AFTER_FAILURES } from "./webhookEvents";

interface Props {
  endpoint: WebhookEndpoint;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onDeliveries: () => void;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
}

const WebhookEndpointRow: React.FC<Props> = ({
  endpoint,
  busy,
  onToggle,
  onTest,
  onDeliveries,
  onEdit,
  onRotate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString() : t("webhooks.never");
  const turnedOffByFailures =
    !endpoint.enabled && endpoint.failureCount >= WEBHOOK_DISABLE_AFTER_FAILURES;

  return (
    <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
            {endpoint.url}
          </Typography>
          {endpoint.description && (
            <Typography variant="body2" color="text.secondary">
              {endpoint.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" alignItems="center" spacing={0.5} flexShrink={0}>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ color: endpoint.enabled ? "success.main" : "text.secondary" }}
          >
            {endpoint.enabled ? t("webhooks.status.on") : t("webhooks.status.off")}
          </Typography>
          <Tooltip
            title={endpoint.enabled ? t("webhooks.actions.disable") : t("webhooks.actions.enable")}
          >
            <Switch
              size="small"
              checked={endpoint.enabled}
              disabled={busy}
              onChange={(e) => onToggle(e.target.checked)}
              inputProps={{
                "aria-label": endpoint.enabled
                  ? t("webhooks.actions.disable")
                  : t("webhooks.actions.enable"),
              }}
            />
          </Tooltip>
        </Stack>
      </Stack>

      {turnedOffByFailures && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {t("webhooks.status.autoOff", { count: WEBHOOK_DISABLE_AFTER_FAILURES })}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        {t("webhooks.eventsLabel")}{" "}
        {endpoint.events.length === 0 ? t("webhooks.allEvents") : endpoint.events.join(", ")}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {t("webhooks.lastSuccess", { date: date(endpoint.lastSuccessAt) })}
        {", "}
        {t("webhooks.lastFailure", { date: date(endpoint.lastFailureAt) })}
        {endpoint.enabled && endpoint.failureCount > 0
          ? `, ${t("webhooks.failuresInRow", { count: endpoint.failureCount })}`
          : ""}
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
        <Button size="small" variant="outlined" disabled={busy} onClick={onTest}>
          {t("webhooks.actions.test")}
        </Button>
        <Button size="small" onClick={onDeliveries}>
          {t("webhooks.actions.deliveries")}
        </Button>
        <Button size="small" onClick={onEdit}>
          {t("webhooks.actions.edit")}
        </Button>
        <Button size="small" disabled={busy} onClick={onRotate}>
          {t("webhooks.actions.rotate")}
        </Button>
        <Button size="small" color="error" disabled={busy} onClick={onDelete}>
          {t("webhooks.actions.delete")}
        </Button>
      </Stack>
    </Box>
  );
};

export default WebhookEndpointRow;
