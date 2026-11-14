import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Checkbox, Dialog, HelperText, Portal, Text, TextInput, useTheme } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { HttpError, type TranscriptMetadata } from "../../services/planAiApi";

/** Same limits as the web dialog (plan-ai/frontend/src/components/transcript/SendNotesDialog.tsx). */
const MAX_RECIPIENTS = 30;
const EMAIL_RE = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]{2,}$/;

interface Attendee {
  name?: string;
  email: string;
}

/**
 * Sends the meeting notes (summary, key points and action items) by email.
 * The calendar invite fills the list and everyone in it starts ticked; more
 * addresses can be added by hand. Nothing is sent without this dialog.
 */
export function SendNotesDialog({
  visible,
  onDismiss,
  transcriptId,
  metadata,
  onSent,
}: {
  visible: boolean;
  onDismiss: () => void;
  transcriptId: string;
  metadata: TranscriptMetadata | null | undefined;
  /** Called with a sentence saying what happened, after a send. */
  onSent: (summary: string) => void;
}) {
  const theme = useTheme();
  const { api, user } = useAuth();
  const me = user?.email?.toLowerCase() ?? "";

  const invited = useMemo<Attendee[]>(
    () =>
      (metadata?.calendarEvent?.attendees ?? []).filter(
        (a) => typeof a?.email === "string" && a.email.toLowerCase() !== me,
      ),
    [metadata, me],
  );
  const lastSend = metadata?.notesEmails?.[metadata.notesEmails.length - 1];

  const [people, setPeople] = useState<Attendee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset only when the dialog opens. The meeting can refresh while it is
  // open, and resetting then would undo the user's choices.
  const invitedRef = useRef(invited);
  invitedRef.current = invited;
  useEffect(() => {
    if (!visible) return;
    const now = invitedRef.current;
    setPeople(now);
    setSelected(new Set(now.map((a) => a.email.toLowerCase())));
    setDraft("");
    setDraftError(false);
    setMessage("");
    setError(null);
  }, [visible]);

  const toggle = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const key = email.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addDraft = () => {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email) || email === me) {
      setDraftError(true);
      return;
    }
    if (!people.some((p) => p.email.toLowerCase() === email)) {
      setPeople((prev) => [...prev, { email }]);
    }
    setSelected((prev) => new Set(prev).add(email));
    setDraft("");
    setDraftError(false);
  };

  const recipients = [...selected];
  const tooMany = recipients.length > MAX_RECIPIENTS;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await api.sendMeetingNotes(transcriptId, {
        recipients,
        message: message.trim() || undefined,
      });
      const notSent = [...(result.failed ?? []), ...(result.invalid ?? [])];
      onSent(
        notSent.length
          ? `Notes sent to ${result.sent.length}. Not sent to: ${notSent.join(", ")}.`
          : `Notes sent. Recipients: ${result.sent.length}.`,
      );
      onDismiss();
    } catch (err) {
      const status = err instanceof HttpError ? err.status : undefined;
      setError(
        status === undefined
          ? "No connection. The notes were not sent."
          : status < 500 && err instanceof Error && err.message
            ? err.message
            : "The notes could not be sent.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={sending ? undefined : onDismiss}>
        <Dialog.Title>Send the notes by email</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 460, paddingHorizontal: 24 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, gap: 8 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Each person gets the summary, the key points and the action items in their own email.
              Replies go to you.
            </Text>
            {lastSend && (
              <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
                Last sent on {new Date(lastSend.sentAt).toLocaleString()}. Recipients: {lastSend.count}.
              </Text>
            )}
            {people.length === 0 ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                This meeting has no calendar invite. Add the addresses below.
              </Text>
            ) : (
              people.map((p) => (
                <Checkbox.Item
                  key={p.email}
                  label={p.name ? `${p.name} (${p.email})` : p.email}
                  status={selected.has(p.email.toLowerCase()) ? "checked" : "unchecked"}
                  onPress={() => toggle(p.email)}
                  disabled={sending}
                  mode="android"
                  position="leading"
                  labelStyle={{ textAlign: "left" }}
                  style={{ paddingHorizontal: 0 }}
                />
              ))
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                mode="outlined"
                dense
                label="Add an email address"
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  setDraftError(false);
                }}
                onSubmitEditing={addDraft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                disabled={sending}
                style={{ flex: 1 }}
              />
              <Button mode="outlined" compact onPress={addDraft} disabled={sending || !draft.trim()}>
                Add
              </Button>
            </View>
            {draftError && <HelperText type="error">That is not a valid email address.</HelperText>}
            <TextInput
              mode="outlined"
              label="Message above the notes (optional)"
              value={message}
              onChangeText={setMessage}
              multiline
              disabled={sending}
              maxLength={2000}
            />
            {tooMany && <HelperText type="error">At most {MAX_RECIPIENTS} people per send.</HelperText>}
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={sending}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={() => void send()}
            loading={sending}
            disabled={sending || recipients.length === 0 || tooMany}
          >
            {`Send (${recipients.length})`}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
