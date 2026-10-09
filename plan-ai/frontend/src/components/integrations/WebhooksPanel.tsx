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
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useTranslation } from "react-i18next";
import {
  useCreateWebhookEndpointMutation,
  useDeleteWebhookEndpointMutation,
  useListWebhookEndpointsQuery,
  useRotateWebhookSecretMutation,
  useSendWebhookTestEventMutation,
  useUpdateWebhookEndpointMutation,
  type WebhookEndpoint,
} from "../../store/apis/webhookApi";
import WebhookEndpointDialog, { type WebhookEndpointForm } from "./webhooks/WebhookEndpointDialog";
import WebhookSecretDialog from "./webhooks/WebhookSecretDialog";
import WebhookDeliveriesDialog from "./webhooks/WebhookDeliveriesDialog";
import WebhookEndpointRow from "./webhooks/WebhookEndpointRow";
import { apiErrorMessage } from "./webhooks/webhookEvents";

interface Props {
  workspaceId: string;
  /** Owners and admins manage webhooks. Everyone else only reads who can. */
  canManage: boolean;
}

type Confirm = { kind: "delete" | "rotate"; endpoint: WebhookEndpoint };
type Notice = { severity: "success" | "error"; text: string };

const WebhooksPanel: React.FC<Props> = ({ workspaceId, canManage }) => {
  const { t } = useTranslation();
  const skip = !workspaceId || !canManage;
  const { data, isLoading, isError, refetch } = useListWebhookEndpointsQuery(workspaceId, { skip });
  const [createEndpoint, { isLoading: isCreating }] = useCreateWebhookEndpointMutation();
  const [updateEndpoint, { isLoading: isUpdating }] = useUpdateWebhookEndpointMutation();
  const [rotateSecret, { isLoading: isRotating }] = useRotateWebhookSecretMutation();
  const [deleteEndpoint, { isLoading: isDeleting }] = useDeleteWebhookEndpointMutation();
  const [sendTest, { isLoading: isTesting }] = useSendWebhookTestEventMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ value: string; rotated: boolean } | null>(null);
  const [deliveriesOf, setDeliveriesOf] = useState<WebhookEndpoint | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const endpoints = data?.endpoints ?? [];
  const busy = isUpdating || isRotating || isDeleting || isTesting;
  const failed = (err: unknown) =>
    setNotice({ severity: "error", text: apiErrorMessage(err) ?? t("webhooks.actionFailed") });

  const openForm = (endpoint: WebhookEndpoint | null) => {
    setEditing(endpoint);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (form: WebhookEndpointForm) => {
    setFormError(null);
    const body = { url: form.url, description: form.description || null, events: form.events };
    try {
      if (editing) {
        await updateEndpoint({ endpointId: editing.id, body }).unwrap();
      } else {
        const created = await createEndpoint(body).unwrap();
        setSecret({ value: created.secret, rotated: false });
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(apiErrorMessage(err) ?? t("webhooks.actionFailed"));
    }
  };

  const handleToggle = async (endpoint: WebhookEndpoint, enabled: boolean) => {
    setNotice(null);
    try {
      await updateEndpoint({ endpointId: endpoint.id, body: { enabled } }).unwrap();
    } catch (err) {
      failed(err);
    }
  };

  const handleTest = async (endpoint: WebhookEndpoint) => {
    setNotice(null);
    try {
      await sendTest(endpoint.id).unwrap();
      setNotice({ severity: "success", text: t("webhooks.testQueued") });
    } catch (err) {
      failed(err);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    const { kind, endpoint } = confirm;
    setConfirm(null);
    setNotice(null);
    try {
      if (kind === "delete") {
        await deleteEndpoint(endpoint.id).unwrap();
      } else {
        const rotated = await rotateSecret(endpoint.id).unwrap();
        setSecret({ value: rotated.secret, rotated: true });
      }
    } catch (err) {
      failed(err);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {t("webhooks.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("webhooks.intro")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("webhooks.restrictedNote")}
          </Typography>
        </Box>

        {!workspaceId ? (
          <Alert severity="warning">{t("webhooks.noWorkspace")}</Alert>
        ) : !canManage ? (
          <Alert severity="info">{t("webhooks.onlyAdmins")}</Alert>
        ) : (
          <>
            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => openForm(null)}
              >
                {t("webhooks.add")}
              </Button>
            </Stack>

            {notice && (
              <Alert severity={notice.severity} onClose={() => setNotice(null)}>
                {notice.text}
              </Alert>
            )}

            {isLoading ? (
              <CircularProgress size={24} sx={{ display: "block", my: 2 }} />
            ) : isError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => void refetch()}>
                    {t("webhooks.retry")}
                  </Button>
                }
              >
                {t("webhooks.loadError")}
              </Alert>
            ) : endpoints.length === 0 ? (
              <Alert severity="info">{t("webhooks.empty")}</Alert>
            ) : (
              <Stack spacing={2}>
                {endpoints.map((endpoint) => (
                  <WebhookEndpointRow
                    key={endpoint.id}
                    endpoint={endpoint}
                    busy={busy}
                    onToggle={(enabled) => void handleToggle(endpoint, enabled)}
                    onTest={() => void handleTest(endpoint)}
                    onDeliveries={() => setDeliveriesOf(endpoint)}
                    onEdit={() => openForm(endpoint)}
                    onRotate={() => setConfirm({ kind: "rotate", endpoint })}
                    onDelete={() => setConfirm({ kind: "delete", endpoint })}
                  />
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>

      <WebhookEndpointDialog
        open={formOpen}
        endpoint={editing}
        saving={isCreating || isUpdating}
        error={formError}
        onClose={() => setFormOpen(false)}
        onSave={(form) => void handleSave(form)}
      />
      <WebhookSecretDialog
        secret={secret?.value ?? null}
        rotated={secret?.rotated ?? false}
        onClose={() => setSecret(null)}
      />
      <WebhookDeliveriesDialog endpoint={deliveriesOf} onClose={() => setDeliveriesOf(null)} />

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirm?.kind === "delete"
            ? t("webhooks.confirm.deleteTitle")
            : t("webhooks.confirm.rotateTitle")}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirm?.kind === "delete"
              ? t("webhooks.confirm.deleteBody")
              : t("webhooks.confirm.rotateBody")}
          </Typography>
          <Typography
            variant="body2"
            sx={{ mt: 1, fontFamily: "monospace", wordBreak: "break-all" }}
          >
            {confirm?.endpoint.url}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)}>{t("webhooks.dialog.cancel")}</Button>
          <Button
            variant="contained"
            color={confirm?.kind === "delete" ? "error" : "primary"}
            onClick={() => void handleConfirm()}
          >
            {confirm?.kind === "delete"
              ? t("webhooks.confirm.confirmDelete")
              : t("webhooks.confirm.confirmRotate")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default WebhooksPanel;
