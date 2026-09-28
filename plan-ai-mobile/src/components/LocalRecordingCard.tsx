import React from "react";
import { Alert, View } from "react-native";
import { ActivityIndicator, Avatar, Button, Card, ProgressBar, Text } from "react-native-paper";
import * as Sharing from "expo-sharing";
import type { createPlanAiApi } from "../services/planAiApi";
import {
  WAV_HEADER_BYTES,
  audioBytes,
  audioMimeTypeOf,
  importTitleOf,
  isImported,
  sampleRateOf,
  sessionAudioFileOf,
  type RecordingManifest,
} from "../services/recordingSessions";
import {
  discardRecording,
  retryUpload,
  saveAndUpload,
} from "../services/recordingUploader";

type Api = ReturnType<typeof createPlanAiApi>;

const formatWhen = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// 16-bit mono PCM: two bytes per sample.
const minutesOfAudio = (bytes: number, sampleRate: number) =>
  Math.max(0, Math.round((bytes - WAV_HEADER_BYTES) / (sampleRate * 2) / 60));

// An imported file is compressed, so its length cannot be read from its size.
const megabytes = (bytes: number) => {
  const mb = bytes / 1024 / 1024;
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
};

/**
 * A meeting that is on this phone and not on the server yet: waiting to
 * upload, uploading, stopped by an error, or left behind by a crash.
 */
export function LocalRecordingCard({
  manifest,
  progress,
  api,
}: {
  manifest: RecordingManifest;
  /** 0 to 1 while this one is uploading, else null. */
  progress: number | null;
  api: Api;
}) {
  const id = manifest.sessionId;
  const imported = isImported(manifest);
  const bytes = audioBytes(id, manifest);
  const hasAudio = imported ? bytes > 0 : bytes > WAV_HEADER_BYTES;
  const amount = imported
    ? `${megabytes(bytes)} MB file`
    : `${minutesOfAudio(bytes, sampleRateOf(manifest))} min of audio`;
  const uploading = progress !== null;
  const interrupted = manifest.status !== "pending_upload";

  const title = interrupted
    ? imported
      ? `Imported file, ${manifest.importedFileName}`
      : `Unsaved recording, ${formatWhen(manifest.startedAt)}`
    : manifest.upload?.title || "Meeting";

  let subtitle: string;
  if (uploading) {
    subtitle = "Uploading…";
  } else if (interrupted) {
    subtitle = `${amount} on this phone`;
  } else if (manifest.permanentError) {
    subtitle = "Upload stopped";
  } else if (manifest.nextAttemptAt && manifest.nextAttemptAt > Date.now()) {
    subtitle = `Waiting for the connection · next try ${new Date(
      manifest.nextAttemptAt,
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    subtitle = "Waiting to upload";
  }

  const exportAudio = async () => {
    if (!hasAudio) {
      Alert.alert("No audio", "This meeting has no audio on the phone, only text.");
      return;
    }
    try {
      await Sharing.shareAsync(sessionAudioFileOf(id, manifest).uri, {
        mimeType: audioMimeTypeOf(manifest),
        dialogTitle: "Export meeting audio",
      });
    } catch (err) {
      Alert.alert("Could not export", err instanceof Error ? err.message : String(err));
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete this meeting?",
      "Its audio and text will be deleted from this phone and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => discardRecording(api, id) },
      ],
    );

  const uploadInterrupted = () => {
    void saveAndUpload(api, id, {
      title:
        imported && manifest.importedFileName
          ? importTitleOf(manifest.importedFileName)
          : `Recovered meeting (${formatWhen(manifest.startedAt)})`,
      projectId: manifest.projectId ?? undefined,
      contextIds: manifest.contextIds.length > 0 ? manifest.contextIds : undefined,
      language: manifest.language || undefined,
      skipAi: false,
      createDoc: true,
    });
  };

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: "#fff9e6",
        borderColor: manifest.permanentError ? "#dc2626" : "#f59e0b",
        borderWidth: 1,
      }}
      mode="elevated"
      elevation={1}
    >
      <Card.Title
        title={title}
        subtitle={subtitle}
        titleStyle={{ color: "#1f2937", fontWeight: "bold" }}
        subtitleStyle={{ color: manifest.permanentError ? "#b91c1c" : "#d97706" }}
        left={(props) => (
          <Avatar.Icon
            {...props}
            icon={interrupted ? "content-save-alert-outline" : "cloud-upload-outline"}
            style={{ backgroundColor: "#fcd34d" }}
            color="#92400e"
          />
        )}
        right={() =>
          uploading ? (
            <ActivityIndicator size="small" color="#d97706" style={{ marginRight: 16 }} />
          ) : null
        }
      />
      <Card.Content>
        {uploading && (
          <ProgressBar progress={progress ?? 0} color="#d97706" style={{ marginTop: 4 }} />
        )}
        {interrupted && (
          <Text variant="bodyMedium" style={{ color: "#92400e", marginTop: 4 }}>
            {manifest.origin === "legacy_backup"
              ? "Audio found from an older version of the app. It may already be saved; check your meetings before uploading it."
              : imported
                ? "This file was imported but not uploaded yet. Upload it to get the transcript, summary and tasks."
                : "The app closed before this meeting was saved. Upload it to get the transcript, summary and tasks."}
          </Text>
        )}
        {!interrupted && manifest.permanentError && manifest.lastError && (
          <Text variant="bodyMedium" style={{ color: "#b91c1c", marginTop: 4 }}>
            {manifest.lastError}
          </Text>
        )}
        {uploading && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button mode="outlined" compact onPress={exportAudio}>
              Export audio
            </Button>
          </View>
        )}
        {!uploading && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {interrupted ? (
              <Button mode="contained" compact onPress={uploadInterrupted}>
                Upload
              </Button>
            ) : (
              <Button mode="contained" compact onPress={() => retryUpload(api, id)}>
                {manifest.permanentError ? "Retry" : "Upload now"}
              </Button>
            )}
            <Button mode="outlined" compact onPress={exportAudio}>
              Export audio
            </Button>
            <Button mode="text" compact textColor="#b91c1c" onPress={confirmDelete}>
              Delete
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}
