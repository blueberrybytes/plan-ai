import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
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
import { WorkspaceSelector } from "../../components/WorkspaceSelector";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import { Transcript } from "../../services/planAiApi";
import { Directory, Paths, File } from "expo-file-system";

export default function DashboardScreen() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const [pendingSyncs, setPendingSyncs] = useState<any[]>([]);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { api, activeWorkspaceId, user } = useAuth();

  const handleRetry = async (transcriptId: string) => {
    setRetryingIds((prev) => [...prev, transcriptId]);
    try {
      const updated = await api.reprocessTranscript(transcriptId);
      setTranscripts((prev) => prev.map((t) => (t.id === transcriptId ? updated : t)));
    } catch (e) {
      console.error("[Retry] Failed to reprocess transcript", e);
    } finally {
      setRetryingIds((prev) => prev.filter((id) => id !== transcriptId));
    }
  };

  const fetchTranscripts = async () => {
    try {
      const data = await api.listTranscripts();
      setTranscripts(data || []);
    } catch (e) {
      console.error("Failed to fetch transcripts", e);
    }

    // Check for offline files
    try {
      const syncDir = new Directory(Paths.document, "pending_sync");
      if (syncDir.exists) {
        const files = syncDir.list();
        const items = [];
        for (const f of files) {
          if (f.name && f.name.endsWith(".json")) {
            try {
              const text = await (f as File).text();
              items.push(JSON.parse(text));
            } catch (jsonErr) {
              console.error("Corrupted offline file:", f.name);
            }
          }
        }
        setPendingSyncs(items.sort((a, b) => b.timestamp - a.timestamp));
      }
    } catch (e) {
      console.error("Failed to check offline sync", e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (activeWorkspaceId === null) return; // Prevent premature fetches causing 'no recordings' false positive
      fetchTranscripts();
    }, [activeWorkspaceId]),
  );

  // Smart polling mechanism if any transcripts are currently processing
  const hasPending = transcripts.some((t) => {
    const status = (t.metadata as Record<string, unknown>)?.processingStatus as string | undefined;
    return status === "PENDING" || status === "PROCESSING";
  });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (hasPending) {
      interval = setInterval(() => {
        api
          .listTranscripts()
          .then((data) => {
            if (data) setTranscripts(data);
          })
          .catch(console.error);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasPending, api]);

  // Aggressive Auto-Sync Offline Pings
  useEffect(() => {
    if (pendingSyncs.length === 0) return;
    const syncInterval = setInterval(() => {
      pendingSyncs.forEach(async (item) => {
        if (syncingIds.includes(item.id)) return;

        setSyncingIds((prev) => [...prev, item.id]);
        console.log(`[AutoSync] Attempting to push offline record: ${item.id}`);
        try {
          const payload = { ...item };
          if (item.audioUri) {
            payload.micFile = {
              uri: item.audioUri,
              name: "emergency_backup.wav",
              type: "audio/wav",
            };
          }

          await api.saveRecording(payload);

          console.log(`[AutoSync] SUCCESS: ${item.id}. Purging local cache.`);
          // Delete the native files
          try {
            new File(Paths.document, `pending_sync/${item.id}.json`).delete();
            if (item.audioUri) {
              new File(item.audioUri).delete();
            }
          } catch (e) {}

          setPendingSyncs((prev) => prev.filter((p) => p.id !== item.id));
          fetchTranscripts(); // Reload online data
        } catch (e) {
          console.log(
            `[AutoSync] Network still down for ${item.id}. Will retry later.`,
          );
        } finally {
          setSyncingIds((prev) => prev.filter((id) => id !== item.id));
        }
      });
    }, 10000); // 10s auto-sync interval
    return () => clearInterval(syncInterval);
  }, [pendingSyncs, syncingIds, api]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTranscripts();
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
    </View>
  );

  const renderItem = ({ item }: { item: any }) => {
    // Determine if this is a local pending item mapped into the UI
    if (item.isLocalPending) {
      const isSyncing = syncingIds.includes(item.id);
      return (
        <Card
          style={[
            styles.card,
            {
              backgroundColor: "#fff9e6",
              borderColor: "#f59e0b",
              borderWidth: 1,
            },
          ]}
          mode="elevated"
          elevation={1}
        >
          <Card.Title
            title={item.title || "Offline Meeting"}
            subtitle={`Saved to Device • Pending Sync`}
            titleStyle={{ color: theme.colors.onSurface, fontWeight: "bold" }}
            subtitleStyle={{ color: "#d97706" }}
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="cloud-off-outline"
                style={{ backgroundColor: "#fcd34d" }}
                color="#92400e"
              />
            )}
            right={(props) =>
              isSyncing ? (
                <ActivityIndicator
                  size="small"
                  color="#d97706"
                  style={{ marginRight: 16 }}
                />
              ) : null
            }
          />
          <Card.Content>
            <Text
              variant="bodyMedium"
              style={{ color: "#92400e", marginTop: 8 }}
            >
              {isSyncing
                ? "Attempting to push audio and transcript to AI..."
                : "Waiting for network connection to securely upload this meeting."}
            </Text>
          </Card.Content>
        </Card>
      );
    }

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

    const processingStatus = item.metadata?.processingStatus as
      | string
      | undefined;
    const isDone =
      processingStatus === "COMPLETED" || processingStatus === "DONE";

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
        onPress={() => router.push(`/transcript/${item.id}` as any)}
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

          {processingStatus === "FAILED" && (
            <View style={{ marginTop: 10 }}>
              <Button
                mode="contained-tonal"
                icon={retryingIds.includes(item.id) ? undefined : "refresh"}
                loading={retryingIds.includes(item.id)}
                disabled={retryingIds.includes(item.id)}
                onPress={(e) => { e.stopPropagation?.(); handleRetry(item.id); }}
                buttonColor="#fee2e2"
                textColor="#991b1b"
                compact
              >
                {retryingIds.includes(item.id) ? "Queuing..." : "Retry AI Generation"}
              </Button>
            </View>
          )}

          {(duration || speakers || item.sentiment) && summarySnippet !== "Processing summary..." && summarySnippet !== "AI processing failed." && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {duration && (
                <View style={{ backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>⏱️ {duration}</Text>
                </View>
              )}
              {speakers && (
                <View style={{ backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>🎙️ {speakers}</Text>
                </View>
              )}
              {item.sentiment && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Sentiment:
                  </Text>
                  <View style={{ backgroundColor: sentimentColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                    <Text variant="labelSmall" style={{ color: sentimentTextColor, fontWeight: 'bold' }}>{item.sentiment}</Text>
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {(transcripts.length > 0 || pendingSyncs.length > 0 || searchQuery.length > 0) && (
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <Searchbar
                placeholder="Search by text, sentiment..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={{ backgroundColor: theme.colors.surfaceVariant, elevation: 0 }}
                inputStyle={{ color: theme.colors.onSurface }}
                iconColor={theme.colors.primary}
              />
            </View>
          )}
          <FlatList
            data={[
              ...pendingSyncs.map((p) => ({ ...p, isLocalPending: true })),
              ...transcripts,
            ].filter(t => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (
                t.title?.toLowerCase().includes(q) ||
                t.summary?.toLowerCase().includes(q) ||
                t.sentiment?.toLowerCase().includes(q) ||
                t.transcript?.toLowerCase().includes(q)
              );
            })}
            keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={
            transcripts.length === 0 && pendingSyncs.length === 0
              ? styles.emptyListContent
              : [styles.listContent, { paddingBottom: 100 + insets.bottom }]
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

      <FAB
        icon="microphone"
        style={[
          styles.fab,
          { backgroundColor: theme.colors.primary, bottom: 20 + insets.bottom },
        ]}
        color={theme.colors.onPrimary}
        onPress={() => router.push("/record" as any)}
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
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 80,
  },
});
