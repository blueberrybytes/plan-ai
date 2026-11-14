import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Modal, Portal, Text, TextInput, useTheme } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import type { Tracker } from "../../services/planAiApi";
import { reportUnexpected } from "../../utils/reportError";
import {
  AGGREGATION_LABELS,
  GOAL_LABELS,
  KIND_HELP,
  KIND_LABELS,
  PERIOD_LABELS,
  TRACKER_PRESETS,
  formFromPreset,
  formFromTracker,
  formProblem,
  formToInput,
  setupErrorText,
  type TrackerFormState,
  type TrackerPresetId,
} from "./trackerForm";

interface Props {
  /** The tracker to edit. Left out to create one. */
  tracker?: Tracker | null;
  workspaceId: string;
  onClose: () => void;
  /** Called after a save, archive or delete, with words for the user. */
  onDone: (message: string | null) => void;
}

const KINDS = Object.keys(KIND_LABELS) as TrackerFormState["kind"][];
const AGGREGATIONS = Object.keys(AGGREGATION_LABELS) as TrackerFormState["aggregation"][];
const GOALS = Object.keys(GOAL_LABELS) as TrackerFormState["goal"][];
const PERIODS = Object.keys(PERIOD_LABELS) as TrackerFormState["goalPeriod"][];

/** Creates or edits a tracker. Mount it with a key so it starts fresh. */
export function TrackerFormModal({ tracker, workspaceId, onClose, onDone }: Props) {
  const theme = useTheme();
  const { api } = useAuth();
  const creating = !tracker;
  const [presetId, setPresetId] = useState<TrackerPresetId>("custom");
  const [form, setForm] = useState<TrackerFormState>(() =>
    tracker ? formFromTracker(tracker) : formFromPreset(TRACKER_PRESETS[TRACKER_PRESETS.length - 1]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = formProblem(form);
  const muted = { color: theme.colors.onSurfaceVariant };

  const change = (patch: Partial<TrackerFormState>) => setForm((f) => ({ ...f, ...patch }));

  const run = async (op: string, fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      // Only the operation name goes to Sentry, never the tracker fields.
      reportUnexpected(err, "trackers", { op });
      setError(setupErrorText(err));
      setBusy(false);
    }
  };

  const save = () => {
    if (problem || busy) return;
    void run(creating ? "create_tracker" : "update_tracker", async () => {
      const input = formToInput(form, creating);
      if (tracker) await api.updateTracker(tracker.id, input, workspaceId);
      else await api.createTracker(input, workspaceId);
      return null;
    });
  };

  const archive = () => {
    if (!tracker || busy) return;
    void run("archive_tracker", async () => {
      await api.updateTracker(tracker.id, { archived: !tracker.archived }, workspaceId);
      return tracker.archived ? "Tracker restored." : "Tracker archived.";
    });
  };

  const confirmDelete = () => {
    if (!tracker || busy) return;
    Alert.alert(
      "Delete tracker?",
      `${tracker.name}\n\nThis deletes the tracker and all its entries. It cannot be undone.\n\nTo keep the entries, archive the tracker instead.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void run("delete_tracker", async () => {
              await api.deleteTracker(tracker.id, workspaceId);
              return "Tracker and entries deleted.";
            }),
        },
      ],
    );
  };

  const choices = <T extends string>(
    values: T[],
    labels: Record<T, string>,
    selected: T,
    onPick: (v: T) => void,
  ) => (
    <View style={styles.chips}>
      {values.map((v) => (
        <Chip
          key={v}
          selected={selected === v}
          showSelectedCheck={false}
          mode={selected === v ? "flat" : "outlined"}
          disabled={busy}
          onPress={() => onPick(v)}
        >
          {labels[v]}
        </Chip>
      ))}
    </View>
  );

  return (
    <Portal>
      <Modal
        visible
        dismissable={!busy}
        onDismiss={onClose}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <KeyboardAvoidingView behavior="padding">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
              {creating ? "New tracker" : "Edit tracker"}
            </Text>

            {creating && (
              <>
                <Text variant="labelMedium" style={[muted, styles.label]}>
                  Start from
                </Text>
                <View style={[styles.chips, { marginBottom: 16 }]}>
                  {TRACKER_PRESETS.map((p) => (
                    <Chip
                      key={p.id}
                      selected={presetId === p.id}
                      showSelectedCheck={false}
                      mode={presetId === p.id ? "flat" : "outlined"}
                      disabled={busy}
                      onPress={() => {
                        setPresetId(p.id);
                        setForm(formFromPreset(p));
                      }}
                    >
                      {p.label}
                    </Chip>
                  ))}
                </View>
              </>
            )}

            <TextInput
              mode="outlined"
              label="Name"
              value={form.name}
              onChangeText={(name) => change({ name })}
              maxLength={60}
              disabled={busy}
              style={styles.field}
            />

            {creating && (
              <>
                <Text variant="labelMedium" style={[muted, styles.label]}>
                  Type
                </Text>
                {choices(KINDS, KIND_LABELS, form.kind, (kind) => change({ kind }))}
                <Text variant="bodySmall" style={[muted, styles.help]}>
                  {KIND_HELP[form.kind]}
                </Text>
              </>
            )}

            {form.kind === "NUMBER" && (
              <>
                <TextInput
                  mode="outlined"
                  label="Unit"
                  placeholder="steps, kg, h"
                  value={form.unit}
                  onChangeText={(unit) => change({ unit })}
                  maxLength={16}
                  disabled={busy}
                  style={styles.field}
                />
                <Text variant="labelMedium" style={[muted, styles.label]}>
                  How it adds up in a day
                </Text>
                {choices(AGGREGATIONS, AGGREGATION_LABELS, form.aggregation, (aggregation) =>
                  change({ aggregation }),
                )}
              </>
            )}

            <Text variant="labelMedium" style={[muted, styles.label, { marginTop: 12 }]}>
              Goal
            </Text>
            {choices(GOALS, GOAL_LABELS, form.goal, (goal) => change({ goal }))}
            {form.goal !== "NONE" && (
              <>
                <TextInput
                  mode="outlined"
                  label={form.kind === "CHECK" ? "Days" : "Goal value"}
                  keyboardType="decimal-pad"
                  value={form.goalValue}
                  onChangeText={(goalValue) => change({ goalValue })}
                  disabled={busy}
                  style={[styles.field, { marginTop: 8 }]}
                />
                <Text variant="labelMedium" style={[muted, styles.label]}>
                  Per
                </Text>
                {choices(PERIODS, PERIOD_LABELS, form.goalPeriod, (goalPeriod) => change({ goalPeriod }))}
              </>
            )}

            <TextInput
              mode="outlined"
              label="Notes for the AI"
              value={form.instructions}
              onChangeText={(instructions) => change({ instructions })}
              maxLength={300}
              multiline
              disabled={busy}
              style={[styles.field, { marginTop: 12, marginBottom: 4 }]}
            />
            <Text variant="bodySmall" style={[muted, styles.help]}>
              For example: count only walks outside.
            </Text>

            {problem && form.name.trim() ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                {problem}
              </Text>
            ) : null}
            {error && (
              <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 8 }}>
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              <Button mode="text" onPress={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button mode="contained" onPress={save} loading={busy} disabled={!!problem || busy}>
                {creating ? "Create" : "Save"}
              </Button>
            </View>

            {tracker && (
              <View style={[styles.actions, { marginTop: 8 }]}>
                <Button mode="text" onPress={archive} disabled={busy}>
                  {tracker.archived ? "Restore" : "Archive"}
                </Button>
                <Button mode="text" textColor={theme.colors.error} onPress={confirmDelete} disabled={busy}>
                  Delete
                </Button>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 16, borderRadius: 12, maxHeight: "90%" },
  body: { padding: 20 },
  label: { marginBottom: 6 },
  help: { marginTop: 6, marginBottom: 12 },
  field: { marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
