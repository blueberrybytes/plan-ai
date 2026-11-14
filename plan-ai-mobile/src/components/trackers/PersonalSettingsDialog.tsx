import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Switch, Text, useTheme } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import type { PersonalStatus } from "../../services/planAiApi";
import { setPersonalStatus } from "../../services/trackersStore";
import { reportUnexpected } from "../../utils/reportError";
import { setupErrorText } from "./trackerForm";

interface Props {
  visible: boolean;
  status: PersonalStatus;
  onClose: () => void;
}

/**
 * Hide calories, read notes automatically, and withdraw consent. Withdrawing
 * here matters: consent can be given on the phone, so it must be possible to
 * take it back on the phone too.
 */
export function PersonalSettingsDialog({ visible, status, onClose }: Props) {
  const theme = useTheme();
  const { api } = useAuth();
  const [busy, setBusy] = useState<"hideCalories" | "autoExtract" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const muted = { color: theme.colors.onSurfaceVariant };

  const toggle = async (key: "hideCalories" | "autoExtract") => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const value = !status[key];
      const body = key === "hideCalories" ? { hideCalories: value } : { autoExtract: value };
      setPersonalStatus(await api.updatePersonalSettings(body));
    } catch (err) {
      reportUnexpected(err, "trackers", { op: "personal_settings" });
      setError(setupErrorText(err));
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    setBusy("withdraw");
    setError(null);
    try {
      setPersonalStatus(await api.withdrawPersonalConsent());
      onClose();
      Alert.alert("Consent withdrawn", "Your trackers and entries were deleted.");
    } catch (err) {
      reportUnexpected(err, "trackers", { op: "personal_withdraw" });
      setError(setupErrorText(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmWithdraw = () =>
    Alert.alert(
      "Withdraw consent?",
      "This deletes every tracker and every entry in them, including proposals waiting for review. It cannot be undone.\n\nYour notes stay in your personal space. Delete them from Notes if you want them gone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Withdraw and delete", style: "destructive", onPress: () => void withdraw() },
      ],
    );

  const row = (key: "hideCalories" | "autoExtract", title: string, help: string) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
          {title}
        </Text>
        <Text variant="bodySmall" style={muted}>
          {help}
        </Text>
      </View>
      <Switch
        value={status[key]}
        disabled={busy !== null}
        onValueChange={() => void toggle(key)}
        accessibilityLabel={title}
      />
    </View>
  );

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onClose}>
        <Dialog.Title>Personal space settings</Dialog.Title>
        <Dialog.Content>
          {row(
            "hideCalories",
            "Hide calories",
            "Calorie trackers show foods and grams, and whether you met the goal, without numbers.",
          )}
          {row(
            "autoExtract",
            "Read notes automatically when I leave them",
            "When you leave a note you edited, the AI reads it and proposes entries. Nothing counts until you accept it.",
          )}
          <Text variant="bodySmall" style={[muted, { marginTop: 8 }]}>
            Withdrawing consent deletes all your trackers and entries. Your notes stay.
          </Text>
          <Button
            mode="outlined"
            textColor={theme.colors.error}
            onPress={confirmWithdraw}
            loading={busy === "withdraw"}
            disabled={busy !== null}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
          >
            Withdraw consent and delete tracker data
          </Button>
          {error && (
            <Text variant="bodyMedium" style={{ color: theme.colors.error, marginTop: 8 }}>
              {error}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
});
