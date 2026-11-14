import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, HelperText, Text, useTheme } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { HttpError, type Task } from "../../services/planAiApi";

type Provider = "jira" | "linear" | "trello" | "asana" | "notion";

const PROVIDERS: { key: Provider; integration: string; label: string; icon: string }[] = [
  { key: "jira", integration: "JIRA", label: "Jira", icon: "jira" },
  { key: "linear", integration: "LINEAR", label: "Linear", icon: "ray-start-arrow" },
  { key: "trello", integration: "TRELLO", label: "Trello", icon: "trello" },
  { key: "asana", integration: "ASANA", label: "Asana", icon: "checkbox-marked-circle-outline" },
  { key: "notion", integration: "NOTION", label: "Notion", icon: "notebook-outline" },
];

/**
 * Sends one task to a connected tool, in its default project or team. Each
 * tool shows only while the task is not there yet: sending twice would make
 * a second issue. Connecting a tool stays in the web app.
 */
export function TaskSyncCard({ task, onSynced }: { task: Task; onSynced: () => void }) {
  const theme = useTheme();
  const { api } = useAuth();
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listIntegrations()
      .then((list) => {
        if (cancelled) return;
        setConnected(
          new Set(list.filter((i) => i.status === "CONNECTED").map((i) => String(i.provider))),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  const available = PROVIDERS.filter((p) => connected.has(p.integration) && !metadata[p.key]);
  if (available.length === 0) return null;

  const send = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      await api.syncTaskToProvider(task.id, provider);
      onSynced();
    } catch (err) {
      const status = err instanceof HttpError ? err.status : undefined;
      setError(
        status === undefined
          ? "No connection. The task was not sent."
          : status < 500 && err instanceof Error && err.message
            ? err.message
            : "The task could not be sent. Check the integration in the web app.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ marginBottom: 16, borderRadius: 16, backgroundColor: theme.colors.surface }} mode="elevated" elevation={1}>
      <Card.Content>
        <Text variant="titleMedium" style={{ fontWeight: "bold", color: theme.colors.primary, marginBottom: 4 }}>
          Send to
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          Creates the task in the default project of each tool.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {available.map((p) => (
            <Button
              key={p.key}
              mode="outlined"
              compact
              icon={p.icon}
              loading={busy === p.key}
              disabled={busy !== null}
              onPress={() => void send(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </View>
        {error && <HelperText type="error">{error}</HelperText>}
      </Card.Content>
    </Card>
  );
}
