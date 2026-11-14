import React, { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../../context/AuthContext";
import { HttpError, type TranscriptClip } from "../../services/planAiApi";
import { formatClock } from "../MeetingAudioPlayer";
import { defaultClipRange, readClipRange } from "../../utils/meetingShare";

/**
 * Cuts up to 5 minutes of the meeting's audio and gives a link that works
 * for 7 days. Times are on the player's clock (the microphone file when there
 * is one), the same clock the server uses.
 */
export function ClipDialog({
  visible,
  onDismiss,
  transcriptId,
  title,
  currentSeconds,
  durationSeconds,
}: {
  visible: boolean;
  onDismiss: () => void;
  transcriptId: string;
  title: string;
  /** Where the player is when the dialog opens. */
  currentSeconds: number | null;
  durationSeconds?: number | null;
}) {
  const theme = useTheme();
  const { api } = useAuth();
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<TranscriptClip | null>(null);
  const [cutting, setCutting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const range = defaultClipRange(currentSeconds, durationSeconds);
    setStartText(formatClock(range.start));
    setEndText(formatClock(range.end));
    setError(null);
    setClip(null);
    setCopied(false);
    // Only when it opens: the player keeps moving while the dialog is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const create = async () => {
    const range = readClipRange(startText, endText, durationSeconds);
    if ("error" in range) {
      setError(range.error);
      return;
    }
    setError(null);
    setCutting(true);
    try {
      setClip(await api.createTranscriptClip(transcriptId, range));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : undefined;
      setError(
        status === undefined
          ? "No connection. The clip was not made."
          : status < 500 && err instanceof Error && err.message
            ? err.message
            : "The clip could not be made.",
      );
    } finally {
      setCutting(false);
    }
  };

  const copy = async () => {
    if (!clip) return;
    await Clipboard.setStringAsync(clip.url);
    setCopied(true);
  };

  const share = async () => {
    if (!clip) return;
    try {
      await Share.share({ message: `${title}\n${clip.url}` });
    } catch {
      // The share sheet was closed or is not there; the link can still be copied.
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={cutting ? undefined : onDismiss}>
        <Dialog.Title>Share a clip</Dialog.Title>
        <Dialog.Content style={{ gap: 12 }}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Pick up to 5 minutes of the recording. Anyone with the link can listen to it for 7 days.
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TextInput
              mode="outlined"
              dense
              label="Start"
              value={startText}
              onChangeText={setStartText}
              keyboardType="numbers-and-punctuation"
              disabled={cutting}
              style={{ flex: 1 }}
            />
            <TextInput
              mode="outlined"
              dense
              label="End"
              value={endText}
              onChangeText={setEndText}
              keyboardType="numbers-and-punctuation"
              disabled={cutting}
              style={{ flex: 1 }}
            />
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Minutes and seconds, for example 4:05.
          </Text>
          {error && <HelperText type="error">{error}</HelperText>}
          {clip && (
            <View style={{ gap: 8 }}>
              <Text selectable variant="bodySmall" style={{ color: theme.colors.onSurface }}>
                {clip.url}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button mode="outlined" compact icon="content-copy" onPress={() => void copy()}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button mode="outlined" compact icon="share-variant" onPress={() => void share()}>
                  Share
                </Button>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                The link stops working on {new Date(clip.expiresAt).toLocaleString()}.
              </Text>
            </View>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={cutting}>
            Close
          </Button>
          <Button mode="contained" onPress={() => void create()} loading={cutting} disabled={cutting}>
            {clip ? "Make another" : "Make clip"}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
