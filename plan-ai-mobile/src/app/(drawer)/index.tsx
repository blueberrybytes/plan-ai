/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { getAuth } from "@react-native-firebase/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Text,
  useTheme,
  Avatar,
  Card,
  FAB,
  ActivityIndicator,
  Searchbar,
  Button,
} from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import { DailyReportReminder } from "../../components/DailyReportReminder";
import { WorkspaceSelector } from "../../components/WorkspaceSelector";
import { useRouter, useFocusEffect, useNavigation, Href } from "expo-router";
import { Transcript } from "../../services/planAiApi";
import { refreshOutbox, saveAndUpload, useOutbox } from "../../services/recordingUploader";
import { useRecordingSession } from "../../services/recordingService";
import {
  createImportedSession,
  importExtension,
  importTitleOf,
  newSessionId,
} from "../../services/recordingSessions";
import { loadLastLanguage } from "../../utils/recordingPrefs";
import { LocalRecordingCard } from "../../components/LocalRecordingCard";

export type FeedItem = Transcript;

// Larger files take too long to slice and upload from a phone (256 slices of
// 8 MB at 2 GB), so they are refused up front.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;

export default function DashboardScreen() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { api, activeWorkspaceId, user } = useAuth();

  // Meetings on this phone that are not on the server yet (see
  // recordingUploader.ts). The one being recorded or on the save screen is
  // left out: it is still in use.
  const outbox = useOutbox();
  const session = useRecordingSession();
  const localRecordings = outbox.sessions.filter(
    (m) => m.sessionId !== session.sessionId && m.sessionId !== session.stoppedSessionId,
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleRetry = async (transcriptId: string) => {
    setRetryingIds((prev) => [...prev, transcriptId]);
    try {
      const updated = await api.reprocessTranscript(transcriptId);
      setTranscripts((prev) =>
        prev.map((t) => (t.id === transcriptId ? updated : t)),
      );
    } catch (e) {
      console.error("[Retry] Failed to reprocess transcript", e);
    } finally {
      setRetryingIds((prev) => prev.filter((id) => id !== transcriptId));
    }
  };

  const fetchTranscripts = useCallback(async () => {
    try {
      const data = await api.listTranscripts(debouncedSearch);
      setTranscripts(data || []);
    } catch (e) {
      console.error("Failed to fetch transcripts", e);
    } finally {
      // Meetings still on the phone show even when the server is unreachable.
      refreshOutbox();
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [api, debouncedSearch]);

  useFocusEffect(
    useCallback(() => {
      if (activeWorkspaceId === null) return; // Prevent premature fetches causing 'no recordings' false positive
      fetchTranscripts();
    }, [activeWorkspaceId, fetchTranscripts]),
  );

  // Smart polling mechanism if any transcripts are currently processing
  const hasPending = transcripts.some((t) => {
    const status = t.metadata?.processingStatus;
    return (
      status === "PENDING" ||
      status === "PROCESSING" ||
      status === "EXTRACTING_TASKS" ||
      status === "REFINING_TASKS" ||
      t.title?.includes("Generating")
    );
  });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (hasPending) {
      interval = setInterval(() => {
        fetchTranscripts();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasPending, debouncedSearch, fetchTranscripts]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTranscripts();
  };

  // An audio file from the phone (a voice memo, a call recorded elsewhere)
  // goes through the same outbox as a recording: it is kept on the phone
  // until the server confirms it, and shows as a card while it uploads.
  const [isImporting, setIsImporting] = useState(false);
  const importAudio = async () => {
    if (isImporting) return;
    let asset: DocumentPicker.DocumentPickerAsset | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      asset = result.assets[0];
    } catch (err) {
      Alert.alert("Could not open the file", err instanceof Error ? err.message : String(err));
      return;
    }
    if (!asset) return;
    const picked = asset;
    // The picker left a copy in the cache. Drop it when the file is refused.
    const dropCopy = () => {
      try {
        const f = new File(picked.uri);
        if (f.exists) f.delete();
      } catch {
        // cache file, the OS clears it anyway
      }
    };
    let size = picked.size ?? 0;
    if (!size) {
      try {
        size = new File(picked.uri).size;
      } catch {
        size = 0;
      }
    }
    if (size > MAX_IMPORT_BYTES) {
      dropCopy();
      Alert.alert(
        "File too large",
        `This file is ${(size / 1024 / 1024 / 1024).toFixed(1)} GB. Import a file under 2 GB.`,
      );
      return;
    }
    if (size <= 0) {
      dropCopy();
      Alert.alert("Empty file", "This file has no audio in it.");
      return;
    }
    const extension = importExtension(picked.name, picked.mimeType);
    if (!extension) {
      dropCopy();
      Alert.alert(
        "Format not supported",
        "Import an m4a, mp3, wav, aac, ogg, opus, webm, flac or caf file.",
      );
      return;
    }

    setIsImporting(true);
    const language = loadLastLanguage();
    const sessionId = newSessionId();
    try {
      await createImportedSession({
        sessionId,
        sourceUri: picked.uri,
        fileName: picked.name,
        extension,
        startedAt: Date.now(),
        language,
        workspaceId: activeWorkspaceId || null,
        ownerUid: getAuth().currentUser?.uid ?? undefined,
      });
      refreshOutbox();
    } catch (err) {
      dropCopy();
      setIsImporting(false);
      Alert.alert(
        "Could not import the file",
        err instanceof Error ? err.message : "The file could not be saved on this phone.",
      );
      return;
    }
    setIsImporting(false);

    // The card shows the progress. The upload can take minutes for a long
    // file, so nothing waits on it here.
    saveAndUpload(api, sessionId, {
      title: importTitleOf(picked.name),
      skipAi: false,
      createDoc: true,
      language: language || undefined,
    })
      .then((outcome) => {
        if (outcome === "uploaded") {
          fetchTranscripts();
        } else if (outcome === "failed") {
          Alert.alert(
            "Upload stopped",
            "The server refused the file. It stays on this phone; you can retry or delete it from the list.",
          );
        }
      })
      .catch((err) => {
        console.warn("[import] could not start the upload", err);
        refreshOutbox();
      });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Avatar.Icon
        size={120}
        icon="microphone-off"
        style={{
          backgroundColor: theme.colors.surfaceVariant,
          marginBottom: 24,
        }}
        color={theme.colors.onSurfaceVariant}
      />
      <Text
        variant="headlineSmall"
        style={{
          color: theme.colors.primary,
          fontWeight: "bold",
          marginBottom: 12,
        }}
      >
        No meetings recorded yet
      </Text>
      <Text
        variant="bodyLarge"
        style={{
          color: theme.colors.onSurfaceVariant,
          textAlign: "center",
          paddingHorizontal: 32,
          marginBottom: 32,
        }}
      >
        Tap the microphone button to start recording and transcribing your first
        meeting with Plan AI.
      </Text>
      <Button
        mode="text"
        icon="file-music-outline"
        onPress={importAudio}
        loading={isImporting}
        disabled={isImporting}
      >
        Or import an audio file
      </Button>
    </View>
  );

  const renderItem = ({ item }: { item: FeedItem }) => {
    const dateSource = item.recordedAt || item.createdAt;
    const formattedDate = dateSource
      ? new Date(dateSource).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Unknown Date";

    const title = item.title || "Untitled Meeting";

    // Feature: Analytics Extraction
    const duration = item.durationSeconds
      ? `${Math.floor(item.durationSeconds / 60)}m ${item.durationSeconds % 60}s`
      : null;
    const speakers = item.speakerCount ? `${item.speakerCount} Speakers` : null;

    let sentimentColor = theme.colors.surfaceVariant;
    let sentimentTextColor = theme.colors.onSurfaceVariant;
    if (item.sentiment === "POSITIVE") {
      sentimentColor = "#dcfce7";
      sentimentTextColor = "#166534";
    } else if (item.sentiment === "NEGATIVE") {
      sentimentColor = "#fee2e2";
      sentimentTextColor = "#991b1b";
    } else if (item.sentiment === "MIXED") {
      sentimentColor = "#fef3c7";
      sentimentTextColor = "#92400e";
    } else if (item.sentiment === "NEUTRAL") {
      sentimentColor = "#f1f5f9";
      sentimentTextColor = "#334155";
    }

    const processingStatus = item.metadata?.processingStatus;
    const isDone =
      processingStatus === "COMPLETED" || processingStatus === "DONE";
    // Show Retry for genuinely FAILED transcripts AND "legacy" ones that were
    // masked as completed before the backend started throwing on AI failure
    // (they carry a fallback error title + 0 tasks). Keeps pre-fix broken
    // recordings recoverable without delete + re-record.
    const isErrorTitle =
      title.startsWith("Processing Error") ||
      title.startsWith("Failed Transcript") ||
      title.startsWith("Authentication Error");
    const showRetry = processingStatus === "FAILED" || isErrorTitle;

    // Determine summary snippet
    let summarySnippet = "Processing summary...";
    if (processingStatus === "FAILED") {
      summarySnippet = "AI processing failed.";
    } else if (item.summary) {
      summarySnippet =
        item.summary.length > 100
          ? item.summary.substring(0, 100) + "..."
          : item.summary;
    } else if (isDone) {
      // Fallback to raw transcript snippet if AI was skipped
      summarySnippet = item.transcript
        ? item.transcript.length > 100
          ? item.transcript.substring(0, 100) + "..."
          : item.transcript
        : "Raw transcript saved without AI processing.";
    }

    return (
      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        mode="elevated"
        elevation={1}
        onPress={() => router.push(`/transcript/${item.id}` as Href)}
      >
        <Card.Title
          title={title}
          subtitle={formattedDate}
          titleStyle={{ color: theme.colors.onSurface, fontWeight: "bold" }}
          subtitleStyle={{ color: theme.colors.onSurfaceVariant }}
          left={(props) => (
            <Avatar.Icon
              {...props}
              icon="waveform"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color="#ffffff"
            />
          )}
        />
        <Card.Content>
          {summarySnippet === "Processing summary..." ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                backgroundColor: theme.colors.primary,
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                elevation: 2,
                shadowColor: theme.colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
              }}
            >
              <ActivityIndicator
                size={14}
                color="#ffffff"
                style={{ marginRight: 8 }}
              />
              <Text
                variant="labelMedium"
                style={{
                  color: "#ffffff",
                  fontWeight: "bold",
                  letterSpacing: 0.5,
                }}
              >
                Analyzing Meeting...
              </Text>
            </View>
          ) : (
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
            >
              {summarySnippet}
            </Text>
          )}

          {/* Pass 2 (background refinement) indicator. Appears AFTER the
              summary is rendered — tickets are already usable. Distinct
              purple color signals "this is the new code-aware enrichment
              step, not the initial analysis". */}
          {processingStatus === "REFINING_TASKS" && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                backgroundColor: "rgba(167, 139, 250, 0.15)",
                borderColor: "#a78bfa",
                borderWidth: 1,
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <ActivityIndicator size={12} color="#a78bfa" style={{ marginRight: 6 }} />
              <Text
                variant="labelSmall"
                style={{ color: "#a78bfa", fontWeight: "600", fontSize: 11 }}
              >
                ✨ Enhancing tickets with code context…
              </Text>
            </View>
          )}

          {showRetry && (
            <View style={{ marginTop: 10 }}>
              <Button
                mode="contained-tonal"
                icon={retryingIds.includes(item.id) ? undefined : "refresh"}
                loading={retryingIds.includes(item.id)}
                disabled={retryingIds.includes(item.id)}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleRetry(item.id);
                }}
                buttonColor="#fee2e2"
                textColor="#991b1b"
                compact
              >
                {retryingIds.includes(item.id)
                  ? "Queuing..."
                  : "Retry AI Generation"}
              </Button>
            </View>
          )}

          {(("project" in item && item.project?.title) ||
            duration ||
            speakers ||
            item.sentiment) &&
            summarySnippet !== "Processing summary..." &&
            summarySnippet !== "AI processing failed." && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {"project" in item && item.project?.title && (
                  <View
                    style={{
                      backgroundColor: "rgba(147, 197, 253, 0.1)",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(147, 197, 253, 0.5)",
                    }}
                  >
                    <Text variant="labelSmall" style={{ color: "#2563eb" }}>
                      📁 {item.project.title}
                    </Text>
                  </View>
                )}
                {duration && (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      ⏱️ {duration}
                    </Text>
                  </View>
                )}
                {speakers && (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      🎙️ {speakers}
                    </Text>
                  </View>
                )}
                {item.sentiment && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Sentiment:
                    </Text>
                    <View
                      style={{
                        backgroundColor: sentimentColor,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 12,
                      }}
                    >
                      <Text
                        variant="labelSmall"
                        style={{
                          color: sentimentTextColor,
                          fontWeight: "bold",
                        }}
                      >
                        {item.sentiment}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader
        user={user}
        titleComponent={
          <WorkspaceSelector
            onWorkspaceChange={() => {
              setIsLoading(true);
              fetchTranscripts();
            }}
          />
        }
      />

      <DailyReportReminder />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {(transcripts.length > 0 ||
            localRecordings.length > 0 ||
            searchQuery.length > 0) && (
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <Searchbar
                placeholder="Search by text, sentiment..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={{
                  backgroundColor: theme.colors.surfaceVariant,
                  elevation: 0,
                }}
                inputStyle={{ color: theme.colors.onSurface }}
                iconColor={theme.colors.primary}
              />
            </View>
          )}
          <FlatList
            data={transcripts}
            ListHeaderComponent={
              localRecordings.length > 0 ? (
                <View>
                  {localRecordings.map((m) => (
                    <LocalRecordingCard
                      key={m.sessionId}
                      manifest={m}
                      api={api}
                      progress={
                        outbox.active?.sessionId === m.sessionId ? outbox.active.progress : null
                      }
                    />
                  ))}
                </View>
              ) : null
            }
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={
              transcripts.length === 0 && localRecordings.length === 0
                ? styles.emptyListContent
                : [styles.listContent, { paddingBottom: 160 + insets.bottom }]
            }
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
              />
            }
          />
        </View>
      )}

      {/* Quick capture: the editor opens with the keyboard up and saves on the phone first. */}
      <FAB
        icon="note-plus-outline"
        label="Note"
        accessibilityLabel="New note"
        style={[
          styles.noteFab,
          { backgroundColor: theme.colors.secondaryContainer, bottom: 20 + insets.bottom },
        ]}
        color={theme.colors.onSecondaryContainer}
        onPress={() => router.push("/note/new" as Href)}
      />
      <FAB
        icon={isImporting ? "timer-sand" : "file-music-outline"}
        size="small"
        accessibilityLabel="Import audio"
        disabled={isImporting}
        style={[
          styles.importFab,
          { backgroundColor: theme.colors.secondaryContainer, bottom: 92 + insets.bottom },
        ]}
        color={theme.colors.onSecondaryContainer}
        onPress={importAudio}
      />
      <FAB
        icon="microphone"
        style={[
          styles.fab,
          { backgroundColor: theme.colors.primary, bottom: 20 + insets.bottom },
        ]}
        color={theme.colors.onPrimary}
        onPress={() => router.push("/record" as Href)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Space for FAB
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 20,
    borderRadius: 16,
  },
  noteFab: {
    position: "absolute",
    margin: 16,
    left: 0,
    borderRadius: 16,
  },
  // Centred above the 56 pt microphone button.
  importFab: {
    position: "absolute",
    margin: 16,
    right: 8,
    borderRadius: 12,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 80,
  },
});
