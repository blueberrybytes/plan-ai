import React, { useState, useRef, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  useTheme,
  Card,
  Avatar,
  ActivityIndicator,
  IconButton,
  Menu,
  Chip,
  Divider,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  streamAssistantMessage,
  AssistantMessage,
} from "../../services/assistantApi";
import { planAiApi, useAuth } from "../../context/AuthContext";
import type { Project } from "../../services/planAiApi";
import { useNavigation, router } from "expo-router";
import { ScreenHeader } from "../../components/ScreenHeader";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import LiveAudioStream from "react-native-live-audio-stream";
import {
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { activeWorkspaceId } = useAuth();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I am your Executive AI Assistant. How can I help you today?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // ── Project focus state ──────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectMenuVisible, setProjectMenuVisible] = useState(false);

  useEffect(() => {
    planAiApi.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const focusedProject = projects.find((p) => p.id === selectedProjectId);

  // Real-time dictation states
  const wsRef = useRef<WebSocket | null>(null);
  const [dictationInterim, setDictationInterim] = useState("");
  const g = global as any;

  useEffect(() => {
    LiveAudioStream.on("data", (data: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "input_audio",
            source: "mic",
            audio: data,
          }),
        );
      }
    });
  }, []);

  const stopDictation = (abort = false) => {
    if (!isDictating) return;
    setIsDictating(false);
    try {
      LiveAudioStream.stop();
      if (wsRef.current) {
        const ws = wsRef.current;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "end_stream" }));
        }
        
        if (abort) {
          ws.close();
        } else {
          // Keep socket alive for 1s to receive final transcripts of already-sent audio
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close();
            }
          }, 1000);
        }
        // IMMEDIATELY nullify wsRef so LiveAudioStream.on("data") stops sending new audio
        wsRef.current = null;
      }
      setDictationInterim("");
    } catch (err) {
      console.error("Dictation stop Error:", err);
    }
  };

  const handleDictate = async () => {
    if (isDictating) {
      stopDictation(false);
    } else {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) return alert("Microphone permission required.");

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          allowsBackgroundRecording: false,
        });

        // Connect WebSocket
        const ws = await planAiApi.startAudioStream();
        wsRef.current = ws;

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "transcript") {
              if (msg.isFinal) {
                setInputText(
                  (prev) => prev + (prev.length > 0 ? " " : "") + msg.text,
                );
                setDictationInterim("");
              } else {
                setDictationInterim(msg.text);
              }
            }
          } catch (e) {
            console.error("WS Message error", e);
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          setDictationInterim("");
        };

        if (!g.__isAssistantAudioInitialized) {
          LiveAudioStream.init({
            sampleRate: 24000,
            channels: 1,
            bitsPerSample: 16,
            audioSource: 1, // MIC
            bufferSize: 4096,
            wavFile: "assistant_dictation.wav",
          });
          g.__isAssistantAudioInitialized = true;
        }

        LiveAudioStream.start();
        setIsDictating(true);
      } catch (e) {
        console.error("Recording start fail", e);
        alert("Failed to start dictation stream.");
      }
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    if (isDictating) {
      stopDictation(true); // abort dictation, don't let trailing words leak into the next input
    }

    const userMsg: AssistantMessage = { role: "user", content: inputText };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setInputText("");
    setIsTyping(true);

    // Initial slot for assistant reply
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const headers = await planAiApi.getAuthHeaders();
      await streamAssistantMessage(
        headers,
        newMessages,
        (chunk) => {
          setMessages((prev) => {
            const last = { ...prev[prev.length - 1] };
            // Standard React Native Chunking Fallback merges the full text anyway,
            // but if we support true streams, this appends correctly.
            last.content = last.content === "" ? chunk : last.content + chunk;
            const res = [...prev];
            res[res.length - 1] = last;
            return res;
          });
        },
        () => setIsTyping(false),
        (err) => {
          setIsTyping(false);
          setMessages((prev) => {
            const last = { ...prev[prev.length - 1] };
            last.content += "\n[Error communicating with server.]";
            const res = [...prev];
            res[res.length - 1] = last;
            return res;
          });
        },
        selectedProjectId || undefined,
      );
    } catch (err) {
      setIsTyping(false);
    }
  };

  /**
   * Message Interceptor: Parses strictly formatted markdown blocks for UI Actions
   */
  const renderMessageContent = (content: string) => {
    // Regex looking for: [UI:CONFIRM_DOC ...]
    const docMatch = content.match(/\[UI:CONFIRM_DOC\s+(.*?)\]/);

    if (docMatch) {
      const attrsStr = docMatch[1];
      const getAttr = (name: string) => {
        const match = attrsStr.match(new RegExp(`${name}="([^"]*)"`));
        return match ? match[1] : "";
      };

      const purpose = getAttr("purpose");
      const recordingId = getAttr("recordingId");
      const recordingName = getAttr("recordingName") || recordingId;
      const contextId = getAttr("contextId");
      const contextName = getAttr("contextName") || contextId || "None";
      const textBefore = content.split(/\[UI:CONFIRM_DOC/)[0].trim();

      return (
        <View style={{ gap: 12 }}>
          {textBefore.length > 0 && (
            <Text style={{ color: theme.colors.onSurface }}>{textBefore}</Text>
          )}
          <Card
            mode="elevated"
            style={{
              backgroundColor: theme.colors.surfaceVariant,
              marginTop: 8,
            }}
          >
            <Card.Title
              title="Generate Document"
              subtitle="Confirmation Required"
              left={(props) => (
                <Avatar.Icon {...props} icon="file-document-outline" />
              )}
            />
            <Card.Content style={{ gap: 8 }}>
              <Text variant="bodyMedium">
                Ensure the following parameters are correct before generating:
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.elevation.level2,
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                <Text variant="labelMedium" style={{ fontWeight: "bold" }}>
                  Purpose:
                </Text>
                <Text variant="bodyMedium">{purpose}</Text>
                <Text
                  variant="labelMedium"
                  style={{ fontWeight: "bold", marginTop: 4 }}
                >
                  Recording ID:
                </Text>
                <Text variant="bodyMedium">{recordingName}</Text>
                <Text
                  variant="labelMedium"
                  style={{ fontWeight: "bold", marginTop: 4 }}
                >
                  Context:
                </Text>
                <Text variant="bodyMedium">{contextName}</Text>
              </View>
            </Card.Content>
            <View style={{ marginTop: 16, gap: 12 }}>
              <Button
                mode="contained"
                onPress={async () => {
                  setIsTyping(true);
                  try {
                    const headers = await planAiApi.getAuthHeaders();
                    const res = await fetch(
                      `${process.env.EXPO_PUBLIC_PLAN_AI_API_URL || "http://10.0.2.2:8080"}/api/documents`,
                      {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify({
                          title: "AI Generated Document",
                          transcriptIds: recordingId ? [recordingId] : [],
                          contextIds:
                            contextId && contextId !== "None"
                              ? [contextId]
                              : [],
                          prompt: purpose,
                        }),
                      },
                    );

                    if (!res.ok) throw new Error("Failed to generate document");
                    const documentData = await res.json();

                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Success! I have generated your document: [View Document](/doc/${documentData.id})`,
                      },
                    ]);
                  } catch (e) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Sorry, there was an error generating the document.`,
                      },
                    ]);
                  } finally {
                    setIsTyping(false);
                  }
                }}
              >
                Confirm & Generate
              </Button>
              <Button
                mode="text"
                textColor={theme.colors.error}
                onPress={() => {
                  setMessages((prev) => [
                    ...prev,
                    { role: "user", content: "Cancel that document." },
                  ]);
                }}
              >
                Cancel
              </Button>
            </View>
          </Card>
        </View>
      );
    }

    // Regex looking for: [UI:CONFIRM_TASK ...]
    const taskMatch = content.match(/\[UI:CONFIRM_TASK\s+(.*?)\]/);

    if (taskMatch) {
      const attrsStr = taskMatch[1];
      const getAttr = (name: string) => {
        const match = attrsStr.match(new RegExp(`${name}="([^"]*)"`));
        return match ? match[1] : "";
      };

      const title = getAttr("title");
      const description = getAttr("description");
      const projectId = getAttr("projectId");
      const projectName = getAttr("projectName") || projectId;
      const textBefore = content.split(/\[UI:CONFIRM_TASK/)[0].trim();

      return (
        <View style={{ gap: 12 }}>
          {textBefore.length > 0 && (
            <Text style={{ color: theme.colors.onSurface }}>{textBefore}</Text>
          )}
          <Card
            mode="elevated"
            style={{
              backgroundColor: theme.colors.surfaceVariant,
              marginTop: 8,
            }}
          >
            <Card.Title
              title="Create Task"
              subtitle="Confirmation Required"
              left={(props) => (
                <Avatar.Icon {...props} icon="check-circle-outline" />
              )}
            />
            <Card.Content style={{ gap: 8 }}>
              <Text variant="bodyMedium">
                Ensure the following details are correct before creating the
                task:
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.elevation.level2,
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                <Text variant="labelMedium" style={{ fontWeight: "bold" }}>
                  Title:
                </Text>
                <Text variant="bodyMedium">{title}</Text>
                <Text
                  variant="labelMedium"
                  style={{ fontWeight: "bold", marginTop: 4 }}
                >
                  Description:
                </Text>
                <Text variant="bodyMedium">{description || "None"}</Text>
                <Text
                  variant="labelMedium"
                  style={{ fontWeight: "bold", marginTop: 4 }}
                >
                  Project:
                </Text>
                <Text variant="bodyMedium">{projectName}</Text>
              </View>
            </Card.Content>
            <View style={{ marginTop: 16, gap: 12 }}>
              <Button
                mode="contained"
                onPress={async () => {
                  setIsTyping(true);
                  try {
                    const task = await planAiApi.createProjectTask(projectId, {
                      title,
                      description,
                    });

                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Success! Task created: [View Task](/task/${task.id})`,
                      },
                    ]);
                  } catch (e) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Sorry, there was an error creating the task.`,
                      },
                    ]);
                  } finally {
                    setIsTyping(false);
                  }
                }}
              >
                Confirm & Create Task
              </Button>
              <Button
                mode="text"
                textColor={theme.colors.error}
                onPress={() => {
                  setMessages((prev) => [
                    ...prev,
                    { role: "user", content: "Cancel that task." },
                  ]);
                }}
              >
                Cancel
              </Button>
            </View>
          </Card>
        </View>
      );
    }

    return (
      <Markdown
        style={{
          body: {
            color: theme.colors.onSurface,
            fontSize: 16,
            lineHeight: 24,
            marginVertical: 0,
          },
          paragraph: { marginTop: 0, marginBottom: 8 },
          list_item: { marginBottom: 4 },
          code_inline: {
            backgroundColor: theme.colors.surfaceVariant,
            color: theme.colors.primary,
            borderRadius: 4,
            paddingHorizontal: 4,
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          },
          fence: {
            backgroundColor: theme.colors.surfaceVariant,
            color: theme.colors.onSurface,
            padding: 8,
            borderRadius: 8,
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            marginTop: 8,
            marginBottom: 8,
          },
          code_block: {
            backgroundColor: theme.colors.surfaceVariant,
            color: theme.colors.onSurface,
            padding: 8,
            borderRadius: 8,
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          },
        }}
        onLinkPress={(url) => {
          console.log(`[Assistant] onLinkPress called with URL: ${url}`);
          if (url.startsWith("/")) {
            let mobileUrl = url;
            if (mobileUrl.startsWith("/projects/")) {
              mobileUrl = mobileUrl.replace("/projects/", "/project/");
            } else if (mobileUrl.startsWith("/transcripts/")) {
              mobileUrl = mobileUrl.replace("/transcripts/", "/transcript/");
            } else if (mobileUrl.startsWith("/recordings/")) {
              mobileUrl = mobileUrl.replace("/recordings/", "/transcript/");
            } else if (mobileUrl.startsWith("/tasks/")) {
              mobileUrl = mobileUrl.replace("/tasks/", "/task/");
            } else if (mobileUrl.startsWith("/docs/")) {
              mobileUrl = mobileUrl.replace("/docs/", "/doc/");
            }
            
            console.log(`[Assistant] Rewrote URL for mobile routing: ${mobileUrl}`);
            
            try {
              // @ts-ignore
              router.push(mobileUrl);
              console.log(`[Assistant] Successfully routed to: ${mobileUrl}`);
            } catch (err) {
              console.error(`[Assistant] Failed to route to ${mobileUrl}:`, err);
            }
            return false;
          }
          return true;
        }}
      >
        {content || "..."}
      </Markdown>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingTop: Math.max(insets.top, 16),
        },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Assistant" showProfile={false} />

      {/* Project focus selector */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.outlineVariant,
          backgroundColor: theme.colors.surface,
          gap: 8,
        }}
      >
        <Avatar.Icon
          size={24}
          icon="folder-outline"
          style={{ backgroundColor: "transparent" }}
          color={theme.colors.onSurfaceVariant}
        />
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Focus:
        </Text>
        <Menu
          visible={projectMenuVisible}
          onDismiss={() => setProjectMenuVisible(false)}
          anchor={
            <Pressable onPress={() => setProjectMenuVisible(true)}>
              <Chip
                icon={selectedProjectId ? "folder" : "folder-outline"}
                compact
                mode="outlined"
                onPress={() => setProjectMenuVisible(true)}
              >
                {focusedProject?.title || "All projects"}
              </Chip>
            </Pressable>
          }
          anchorPosition="bottom"
          contentStyle={{ maxHeight: 300 }}
        >
          <Menu.Item
            title="All projects (workspace-wide)"
            leadingIcon="folder-multiple-outline"
            onPress={() => {
              setSelectedProjectId("");
              setProjectMenuVisible(false);
            }}
          />
          <Divider />
          {projects.map((p) => (
            <Menu.Item
              key={p.id}
              title={p.title}
              leadingIcon={p.id === selectedProjectId ? "check" : "folder-outline"}
              onPress={() => {
                setSelectedProjectId(p.id);
                setProjectMenuVisible(false);
              }}
            />
          ))}
        </Menu>
        <View style={{ flex: 1 }} />
        {selectedProjectId ? (
          <Chip
            compact
            mode="flat"
            onClose={() => setSelectedProjectId("")}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            textStyle={{ fontSize: 10, color: theme.colors.onPrimaryContainer }}
          >
            Scoped to {focusedProject?.title}
          </Chip>
        ) : null}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          return (
            <View
              key={index}
              style={[
                styles.messageRow,
                isUser ? styles.messageRowUser : styles.messageRowAssistant,
              ]}
            >
              {!isUser && (
                <Avatar.Icon
                  size={32}
                  icon="robot"
                  style={{
                    marginRight: 8,
                    backgroundColor: theme.colors.primary,
                  }}
                />
              )}
              <View
                style={[
                  styles.messageBubble,
                  {
                    backgroundColor: isUser
                      ? theme.colors.primaryContainer
                      : theme.colors.elevation.level1,
                  },
                ]}
              >
                <View style={{ paddingRight: 24 }}>
                  {isUser ? (
                    <Text style={{ color: theme.colors.onPrimaryContainer }}>
                      {msg.content}
                    </Text>
                  ) : (
                    renderMessageContent(msg.content)
                  )}
                </View>
                <IconButton
                  icon="content-copy"
                  size={16}
                  iconColor={
                    isUser
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurfaceVariant
                  }
                  onPress={() => Clipboard.setStringAsync(msg.content)}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    margin: 0,
                    padding: 0,
                    width: 24,
                    height: 24,
                    opacity: 0.6,
                  }}
                />
              </View>
            </View>
          );
        })}
        {isTyping && (
          <View style={[styles.messageRow, styles.messageRowAssistant]}>
            <ActivityIndicator size="small" style={{ marginLeft: 40 }} />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.colors.surface,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {isDictating && dictationInterim ? (
          <View
            style={{
              position: "absolute",
              top: -24,
              left: 24,
              right: 60,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.primary,
                fontStyle: "italic",
              }}
              numberOfLines={1}
            >
              {dictationInterim}
            </Text>
          </View>
        ) : isDictating ? (
          <View
            style={{
              position: "absolute",
              top: -20,
              left: 24,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: "#10B981",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              Listening...
            </Text>
          </View>
        ) : null}
        <TextInput
          mode="outlined"
          placeholder={isDictating ? "Listening..." : "Message plan AI..."}
          value={inputText}
          onChangeText={setInputText}
          style={styles.textInput}
          multiline
          maxLength={500}
        />
        <IconButton
          icon={
            inputText.trim().length > 0
              ? "send"
              : isDictating
                ? "stop-circle"
                : "microphone"
          }
          iconColor={isDictating ? theme.colors.error : undefined}
          mode="contained"
          size={24}
          onPress={inputText.trim().length > 0 ? handleSend : handleDictate}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatArea: { flex: 1 },
  messageRow: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-end",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
  },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  textInput: {
    flex: 1,
    marginRight: 12,
    backgroundColor: "transparent",
    maxHeight: 100,
  },
  sendButton: {
    marginBottom: 4,
  },
});
