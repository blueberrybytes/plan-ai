import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Alert, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Text,
  IconButton,
  useTheme,
  Surface,
  ActivityIndicator,
  SegmentedButtons,
  Button,
  Menu,
} from "react-native-paper";
import { useAuth } from "@/context/AuthContext";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import { Share, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import MermaidViewer from "../../components/MermaidViewer";
import { Transcript } from "@/services/planAiApi";

const formatTimestamp = (seconds?: number | null) => {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}]`;
};

export default function TranscriptViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { api, backendUser } = useAuth();

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");
  const [isRetrying, setIsRetrying] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (id) {
      api
        .getTranscript(id)
        .then(setTranscript)
        .catch((e) => {
          console.error("Failed to load transcript", e);
          alert("Could not load meeting details.");
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, api]);

  const handleRetry = async () => {
    if (!transcript) return;
    setIsRetrying(true);
    try {
      const updated = await api.reprocessTranscript(transcript.id);
      setTranscript(updated);
    } catch (e) {
      Alert.alert("Error", "Could not queue reprocessing. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  };

  const getShareableText = () => {
    if (!transcript) return "";
    let text = `Meeting: ${transcript.title || "Untitled"}\n`;
    text += `Date: ${new Date(transcript.recordedAt ?? transcript.createdAt).toLocaleDateString()}\n\n`;
    if (transcript.summary) {
      text += `--- SUMMARY ---\n${transcript.summary}\n\n`;
    }
    if (transcript.transcript) {
      text += `--- TRANSCRIPT ---\n${transcript.transcript}\n`;
    }
    return text;
  };

  const handleCopy = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(getShareableText());
    Alert.alert("Copied", "Transcript text copied to clipboard.");
  };

  const handleShare = async () => {
    setMenuVisible(false);
    try {
      await Share.share({
        message: getShareableText(),
        title: transcript?.title || "Transcript",
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const handleDownload = async () => {
    setMenuVisible(false);
    try {
      const fileName = `Transcript_${transcript?.id || "download"}.txt`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, getShareableText(), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Error", "Sharing is not available on this device");
      }
    } catch (error: any) {
      Alert.alert("Error", "Could not save file: " + error.message);
    }
  };

  const processingStatus = (transcript?.metadata as Record<string, unknown>)?.processingStatus as string | undefined;
  const isFailed = processingStatus === "FAILED";
  const isPending = processingStatus === "PENDING" || processingStatus === "PROCESSING";

  const renderSummaryTab = () => {
    if (!transcript?.summary) {
      return (
        <View style={styles.emptyContainer}>
          {isFailed ? (
            <>
              <IconButton icon="alert-circle-outline" size={40} iconColor={theme.colors.error} />
              <Text variant="titleMedium" style={{ color: theme.colors.error, fontWeight: "bold", marginBottom: 8 }}>
                AI Processing Failed
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginBottom: 20, paddingHorizontal: 16 }}>
                The AI could not analyze this meeting. You can retry or view the raw transcript below.
              </Text>
              <Button
                mode="contained"
                icon={isRetrying ? undefined : "refresh"}
                onPress={handleRetry}
                disabled={isRetrying}
                loading={isRetrying}
              >
                {isRetrying ? "Queuing..." : "Retry AI Generation"}
              </Button>
            </>
          ) : isPending ? (
            <>
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
              <Text style={{ color: theme.colors.onSurfaceVariant }}>AI is analyzing this meeting...</Text>
            </>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              No AI summary has been generated for this meeting yet.
            </Text>
          )}
        </View>
      );
    }

    return (
      <View style={{ paddingBottom: 40 }}>
        <Markdown
          rules={{
            fence: (node: any, children, parent, styles) => {
              if (node.sourceInfo === "mermaid") {
                return <MermaidViewer key={node.key} code={node.content} />;
              }
              return (
                <View key={node.key} style={styles.fence}>
                  <Text style={[styles.code_block]}>{node.content}</Text>
                </View>
              );
            },
          }}
          style={{
            body: {
              color: theme.colors.onSurface,
              fontSize: 16,
              lineHeight: 24,
            },
            heading1: {
              color: theme.colors.primary,
              marginTop: 16,
              marginBottom: 8,
            },
            heading2: {
              color: theme.colors.primary,
              marginTop: 16,
              marginBottom: 8,
            },
            heading3: {
              color: theme.colors.primary,
              marginTop: 12,
              marginBottom: 8,
            },
            list_item: { marginVertical: 4 },
            code_block: {
              backgroundColor: theme.colors.surfaceVariant,
              color: theme.colors.onSurfaceVariant,
              padding: 12,
              borderRadius: 8,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
            fence: {
              backgroundColor: theme.colors.surfaceVariant,
              color: theme.colors.onSurfaceVariant,
              padding: 12,
              borderRadius: 8,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
          }}
        >
          {transcript.summary}
        </Markdown>
      </View>
    );
  };

  const renderUtterancesTab = () => {
    type Utterance = { speaker: string; transcript: string; start: number; end: number };
    const utterances = transcript?.utterances as Utterance[] | null | undefined;
    if (utterances && utterances.length > 0) {
      const principalSpeaker = (transcript?.metadata as Record<string, unknown>)?.principalSpeaker as string | undefined;

      return (
        <View style={{ paddingBottom: 40, gap: 16 }}>
          {utterances.map((u, i) => {
            console.log("Utterance:", u);
            const speakerStr = u.speaker || "Unknown";
            const isMe = principalSpeaker ? speakerStr === principalSpeaker : false;
            const speakerLabel = isMe ? "(Me)" : speakerStr;
            return (
              <Surface
                key={i}
                style={[
                  styles.chatBubble,
                  {
                    backgroundColor: isMe
                      ? theme.colors.primaryContainer
                      : theme.colors.surfaceVariant,
                    alignSelf: isMe ? "flex-end" : "flex-start",
                    borderBottomRightRadius: isMe ? 4 : 16,
                    borderBottomLeftRadius: isMe ? 16 : 4,
                  },
                ]}
                elevation={0}
              >
                <Text
                  variant="labelMedium"
                  style={{
                    color: isMe ? theme.colors.primary : theme.colors.secondary,
                    fontWeight: "bold",
                    marginBottom: 4,
                  }}
                >
                  {formatTimestamp(u.start)} {speakerLabel}
                </Text>
                <Text style={{ color: theme.colors.onSurface, lineHeight: 22 }}>
                  {u.transcript}
                </Text>
              </Surface>
            );
          })}
        </View>
      );
    }

    // Fallback for basic transcripts without utterances
    const rawText =
      transcript?.transcript || "No transcript content available.";
    console.log("🛑 Raw Transcript Text evaluating:", rawText);
    const blocks = rawText.split(/\n+/).filter(Boolean);

    // Check if the text has speaker labels in either desktop or mobile format
    const hasLabels = blocks.some(
      (b) => /^\[(.*?)\]\s*(.*)/.test(b) || /^(.{1,40}?):\s*(.*)/.test(b),
    );
    console.log("🛑 Has Labels:", hasLabels);

    if (hasLabels) {
      const principalSpeaker = (transcript?.metadata as any)?.principalSpeaker;

      return (
        <View style={{ paddingBottom: 40, gap: 16 }}>
          {blocks.map((block, i) => {
            console.log(`🧐 Block [${i}]:`, block);
            let speaker = "Unknown";
            let text = block;

            const matchBracket = block.match(/^\[(.*?)\]\s*(.*)/);
            if (matchBracket) {
              speaker = matchBracket[1];
              text = matchBracket[2];
            } else {
              const matchColon = block.match(/^(.{1,40}?):\s*(.*)/);
              if (matchColon) {
                speaker = matchColon[1].trim();
                text = matchColon[2];
                if (speaker.toLowerCase() === "user") speaker = "Me";
              }
            }

            if (speaker === "Unknown") {
              return (
                <Text
                  key={i}
                  style={{ color: theme.colors.onSurface, lineHeight: 22 }}
                >
                  {block}
                </Text>
              );
            }

            const isMe = principalSpeaker ? speaker === principalSpeaker : false;
            const displaySpeaker = isMe ? "(Me)" : speaker;

            console.log(
              `🧐 Speaker Parsed: '${speaker}', isMe: ${isMe}`,
            );

            return (
              <Surface
                key={i}
                style={[
                  styles.chatBubble,
                  {
                    backgroundColor: isMe
                      ? theme.colors.primaryContainer
                      : theme.colors.surfaceVariant,
                    alignSelf: isMe ? "flex-end" : "flex-start",
                    borderBottomRightRadius: isMe ? 4 : 16,
                    borderBottomLeftRadius: isMe ? 16 : 4,
                  },
                ]}
                elevation={0}
              >
                <Text
                  variant="labelMedium"
                  style={{
                    color: isMe ? theme.colors.primary : theme.colors.secondary,
                    fontWeight: "bold",
                    marginBottom: 4,
                  }}
                >
                  {displaySpeaker}
                </Text>
                <Text style={{ color: theme.colors.onSurface, lineHeight: 22 }}>
                  {text}
                </Text>
              </Surface>
            );
          })}
        </View>
      );
    }

    // Naked raw fallback (if zero speaker labels detected)
    return (
      <View style={{ paddingBottom: 40 }}>
        <Text style={{ color: theme.colors.onSurface, lineHeight: 24 }}>
          {rawText}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => router.back()}
          style={{ marginLeft: -8 }}
        />
        <View style={{ flex: 1 }}>
          <Text
            variant="titleLarge"
            style={{ fontWeight: "bold", color: theme.colors.onBackground }}
            numberOfLines={1}
          >
            {transcript?.title || "Meeting Details"}
          </Text>
          {(transcript?.recordedAt || transcript?.createdAt) && (
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {new Date(transcript.recordedAt ?? transcript.createdAt).toLocaleDateString()}
            </Text>
          )}
          {transcript &&
            (transcript.durationSeconds ||
              transcript.speakerCount ||
              transcript.sentiment) && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                {transcript.durationSeconds && (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      ⏱️ {Math.floor(transcript.durationSeconds / 60)}m{" "}
                      {transcript.durationSeconds % 60}s
                    </Text>
                  </View>
                )}
                {transcript.speakerCount ? (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      🎙️ {transcript.speakerCount}
                    </Text>
                  </View>
                ) : null}
                {(transcript.metadata as any)?.location && (
                  <TouchableOpacity
                    onPress={() => {
                      const lat = (transcript.metadata as any).location.latitude;
                      const lng = (transcript.metadata as any).location.longitude;
                      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
                    }}
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 8,
                      flexDirection: "row",
                      alignItems: "center"
                    }}
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      📍 {(transcript.metadata as any).location.latitude.toFixed(4)}, {(transcript.metadata as any).location.longitude.toFixed(4)}
                    </Text>
                  </TouchableOpacity>
                )}
                {transcript.sentiment && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Sentiment:
                    </Text>
                    <View
                      style={{
                        backgroundColor:
                          transcript.sentiment === "POSITIVE"
                            ? "#dcfce7"
                            : transcript.sentiment === "NEGATIVE"
                              ? "#fee2e2"
                              : transcript.sentiment === "MIXED"
                                ? "#fef3c7"
                                : "#f1f5f9",
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        variant="labelSmall"
                        style={{
                          color:
                            transcript.sentiment === "POSITIVE"
                              ? "#166534"
                              : transcript.sentiment === "NEGATIVE"
                                ? "#991b1b"
                                : transcript.sentiment === "MIXED"
                                  ? "#92400e"
                                  : "#334155",
                          fontWeight: "bold",
                        }}
                      >
                        {transcript.sentiment}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          {(transcript?.metadata as { sentimentExplanation?: string })?.sentimentExplanation && (
            <Text
              style={{
                marginTop: 8,
                fontStyle: "italic",
                color: theme.colors.onSurfaceVariant,
                fontSize: 13,
                borderLeftWidth: 2,
                borderLeftColor: theme.colors.outlineVariant,
                paddingLeft: 8,
              }}
            >
              {(transcript?.metadata as { sentimentExplanation?: string }).sentimentExplanation}
            </Text>
          )}
        </View>

        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={theme.colors.onBackground}
              size={24}
              onPress={() => setMenuVisible(true)}
              style={{ marginRight: -8 }}
            />
          }
        >
          <Menu.Item
            onPress={handleCopy}
            title="Copy to Clipboard"
            leadingIcon="content-copy"
          />
          <Menu.Item
            onPress={handleShare}
            title="Share Text"
            leadingIcon="share-variant"
          />
          <Menu.Item
            onPress={handleDownload}
            title="Save as File"
            leadingIcon="download"
          />
        </Menu>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.segmentContainer}>
            <SegmentedButtons
              value={activeTab}
              onValueChange={setActiveTab}
              buttons={[
                { value: "summary", label: "Summary" },
                { value: "utterances", label: "Transcript" },
              ]}
            />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activeTab === "summary"
              ? renderSummaryTab()
              : renderUtterancesTab()}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  segmentContainer: {
    padding: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  chatBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "85%",
  },
});
