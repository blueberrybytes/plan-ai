import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Checkbox, Dialog, Portal, Text, useTheme } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { TrackerApiError, type PersonalStatus } from "../../services/planAiApi";
import { loadPersonalStatus, setPersonalStatus } from "../../services/trackersStore";
import { reportUnexpected } from "../../utils/reportError";
import { setupErrorText } from "./trackerForm";

// The consent text of the web app, word for word. It is a health data
// consent, so it must not be shortened or reworded.
const POINTS = [
  "Your personal space keeps private notes and trackers for things like food, weight, steps and habits.",
  "In the EU, food, weight and steps count as health data. To store them we need your explicit consent.",
  "This data is private to you. No owner or admin of any workspace can see it, and the assistant does not read it.",
  "When a note is read with AI, the request uses your own OpenRouter key and asks for providers that keep no data.",
  "Calories are AI estimates, not medical or nutrition advice.",
  "You can withdraw your consent at any time in the trackers settings. That deletes all your trackers and entries.",
];
const CHECKBOX = "I have read this and I agree to store my health data in my personal space.";

interface Props {
  visible: boolean;
  status: PersonalStatus;
  onClose: () => void;
  onEnabled: (status: PersonalStatus) => void;
}

/** Explains personal mode and asks for explicit consent to store health data. */
export function PersonalConsentDialog({ visible, status, onClose, onEnabled }: Props) {
  const theme = useTheme();
  const { api, refreshWorkspaces, setActiveWorkspaceId } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [textChanged, setTextChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setAgreed(false);
    setTextChanged(false);
    setError(null);
    onClose();
  };

  const accept = async () => {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.enablePersonal(status.currentConsentVersion);
      setPersonalStatus(next);
      // The first consent creates the personal workspace. Load it and open
      // it, so the Trackers item shows in the menu.
      await refreshWorkspaces();
      if (next.workspaceId) setActiveWorkspaceId(next.workspaceId);
      setAgreed(false);
      setTextChanged(false);
      onEnabled(next);
    } catch (err) {
      if (err instanceof TrackerApiError && err.code === "consent_outdated") {
        // The text changed on the server while this was open. Ask again.
        setAgreed(false);
        setTextChanged(true);
        void loadPersonalStatus(api, { force: true });
      } else {
        reportUnexpected(err, "trackers", { op: "personal_enable" });
        setError(setupErrorText(err, "Could not turn on personal mode. Try again."));
      }
    } finally {
      setBusy(false);
    }
  };

  const notice = textChanged
    ? "The text changed while this window was open. Read it again and accept."
    : status.consentOutdated
      ? "The text has changed since you last agreed. Please read it again."
      : null;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={close} dismissable={!busy} style={styles.dialog}>
        <Dialog.Title>Turn on your personal space</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
            {notice && (
              <Text variant="bodyMedium" style={[styles.point, { color: theme.colors.primary }]}>
                {notice}
              </Text>
            )}
            {POINTS.map((p) => (
              <Text key={p} variant="bodyMedium" style={[styles.point, { color: theme.colors.onSurface }]}>
                {p}
              </Text>
            ))}
            <Checkbox.Item
              label={CHECKBOX}
              status={agreed ? "checked" : "unchecked"}
              onPress={() => setAgreed((a) => !a)}
              disabled={busy}
              position="leading"
              labelVariant="bodyMedium"
              labelStyle={{ textAlign: "left" }}
              style={{ paddingHorizontal: 0 }}
              accessibilityLabel={CHECKBOX}
            />
            {error && (
              <Text variant="bodyMedium" style={{ color: theme.colors.error, marginTop: 8 }}>
                {error}
              </Text>
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={close} disabled={busy}>
            Not now
          </Button>
          <Button mode="contained" onPress={() => void accept()} loading={busy} disabled={!agreed || busy}>
            Accept and turn on
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: "85%" },
  scrollArea: { paddingHorizontal: 24 },
  point: { marginBottom: 12, lineHeight: 21 },
});
