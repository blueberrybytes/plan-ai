import React from "react";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Chip,
  Divider,
  IconButton,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import type { TaskUpdateKind, TaskUpdateProposal } from "../services/planAiApi";

const KIND_LABEL: Record<TaskUpdateKind, string> = {
  COMPLETED: "Done",
  PROGRESS: "Moved forward",
  BLOCKED: "Stuck",
  NEW: "New task",
  DONE: "Done, new task",
};

const KIND_ICON: Record<TaskUpdateKind, string> = {
  COMPLETED: "check-circle-outline",
  PROGRESS: "progress-clock",
  BLOCKED: "alert-octagon-outline",
  NEW: "plus-circle-outline",
  DONE: "check-circle-outline",
};

interface Props {
  proposals: TaskUpdateProposal[];
  busyIds: string[];
  onReview: (items: { id: string; status: "ACCEPTED" | "REJECTED" }[]) => void;
}

/** Task changes the AI read in the report. Nothing changes until accepted. */
export function DailyReportProposals({ proposals, busyIds, onReview }: Props) {
  const theme = useTheme();
  if (proposals.length === 0) return null;
  const anyBusy = busyIds.length > 0;

  return (
    <Surface
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      elevation={0}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text
            variant="titleMedium"
            style={{ fontWeight: "700", color: theme.colors.onSurface }}
          >
            Proposed changes ({proposals.length})
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Accept what is right. Nothing changes until you do.
          </Text>
        </View>
        {proposals.length > 1 && (
          <Button
            mode="contained"
            compact
            disabled={anyBusy}
            onPress={() =>
              onReview(proposals.map((p) => ({ id: p.id, status: "ACCEPTED" })))
            }
          >
            Accept all
          </Button>
        )}
      </View>
      {proposals.map((p, index) => {
        const busy = busyIds.includes(p.id);
        const isNew = p.kind === "NEW" || p.kind === "DONE";
        const where = p.projectTitle ?? "Daily report project";
        return (
          <View key={p.id}>
            {index > 0 && <Divider />}
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Chip
                  compact
                  icon={KIND_ICON[p.kind]}
                  style={{ alignSelf: "flex-start" }}
                  textStyle={{ fontSize: 12 }}
                >
                  {KIND_LABEL[p.kind]}
                </Chip>
                <Text
                  variant="bodyLarge"
                  style={{ fontWeight: "600", color: theme.colors.onSurface }}
                >
                  {p.title}
                </Text>
                {p.detail ? (
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {p.detail}
                  </Text>
                ) : null}
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {isNew ? `Goes to: ${where}` : where}
                </Text>
              </View>
              <View style={styles.actions}>
                <IconButton
                  icon="check"
                  mode="contained"
                  iconColor={theme.colors.onPrimary}
                  containerColor={theme.colors.primary}
                  disabled={busy || anyBusy}
                  accessibilityLabel="Accept"
                  onPress={() => onReview([{ id: p.id, status: "ACCEPTED" }])}
                />
                <IconButton
                  icon="close"
                  disabled={busy || anyBusy}
                  accessibilityLabel="Reject"
                  onPress={() => onReview([{ id: p.id, status: "REJECTED" }])}
                />
              </View>
            </View>
          </View>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginTop: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  actions: { flexDirection: "row", alignItems: "center" },
});
