import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import {
  Text,
  IconButton,
  useTheme,
  ActivityIndicator,
  Card,
  Avatar,
  FAB,
  Divider,
  Portal,
  Dialog,
  Button,
} from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { Context, ContextFileResponse } from "../../services/planAiApi";
import * as DocumentPicker from "expo-document-picker";

export default function ContextDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ContextFileResponse | null>(
    null,
  );

  const theme = useTheme();
  const router = useRouter();
  const { api } = useAuth();

  const fetchContext = () => {
    if (id) {
      api
        .getContext(id)
        .then((data) => {
          setContext(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to fetch context", err);
          setLoading(false);
          Alert.alert("Error", "Failed to load context.");
          router.back();
        });
    }
  };

  useEffect(() => {
    fetchContext();
  }, [id]);

  const hasPendingFiles = context?.files?.some((f) => {
    return f.metadata && (f.metadata as any).processingStatus === "PENDING";
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (hasPendingFiles && id) {
      interval = setInterval(() => {
        api
          .getContext(id)
          .then((data) => {
            if (data) setContext(data);
          })
          .catch(console.error);
      }, 3000); // Poll every 3 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasPendingFiles, id, api]);

  const handleUploadFile = async () => {
    try {
      // Prompt user to pick a document
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "text/csv",
          "application/json",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setUploading(true);

      const mimeType = file.mimeType || "application/octet-stream";
      await api.uploadContextFile(id as string, {
        uri: file.uri,
        name: file.name,
        type: mimeType,
      });

      // Reload context to reflect new processing file
      fetchContext();
    } catch (error: any) {
      console.error("File upload failed", error);
      Alert.alert(
        "Upload Failed",
        error.message || "Could not upload the selected file.",
      );
    } finally {
      setUploading(false);
    }
  };

  const executeDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      setUploading(true);
      await api.deleteContextFile(id as string, fileToDelete.id);
      fetchContext();
    } catch (error: any) {
      Alert.alert(
        "Delete Failed",
        error.message || "Could not delete document.",
      );
    } finally {
      setUploading(false);
      setDeleteDialogVisible(false);
      setFileToDelete(null);
    }
  };

  const renderMetadata = (metadata: unknown) => {
    if (!metadata) return null;
    let displayData = "";
    try {
      displayData = JSON.stringify(metadata, null, 2);
    } catch {
      displayData = String(metadata);
    }
    return (
      <View
        style={[
          styles.metadataContainer,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
      >
        <Text
          variant="labelLarge"
          style={{ color: theme.colors.primary, marginBottom: 8 }}
        >
          Diagnostic Metadata
        </Text>
        <Text
          style={{
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            color: theme.colors.onSurfaceVariant,
            fontSize: 12,
          }}
        >
          {displayData}
        </Text>
      </View>
    );
  };

  const renderFileItem = (file: ContextFileResponse) => {
    const formattedDate = file.createdAt
      ? new Date(file.createdAt).toLocaleDateString()
      : "Unknown Date";

    // Format bytes
    const sizeKB = Math.round(file.sizeBytes / 1024);
    const sizeString =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

    // Processing status check
    const isPending =
      file.metadata && (file.metadata as any).processingStatus === "PENDING";

    return (
      <Card
        style={[styles.fileCard, { backgroundColor: theme.colors.surface }]}
        key={file.id}
        elevation={1}
        onPress={() => {
          if (file.publicUrl) Linking.openURL(file.publicUrl);
        }}
      >
        <Card.Title
          title={file.fileName}
          subtitle={`${sizeString} • ${formattedDate}`}
          titleStyle={{ color: theme.colors.onSurface, fontWeight: "bold" }}
          subtitleStyle={{ color: theme.colors.onSurfaceVariant }}
          left={(props) => (
            <Avatar.Icon
              {...props}
              icon="file-document-outline"
              style={{ backgroundColor: theme.colors.secondaryContainer }}
              color={theme.colors.secondary}
            />
          )}
          right={(props) => (
            <IconButton
              {...props}
              icon="delete-outline"
              iconColor={theme.colors.error}
              onPress={() => {
                setFileToDelete(file);
                setDeleteDialogVisible(true);
              }}
            />
          )}
        />
        {isPending && (
          <View
            style={[
              styles.pendingBanner,
              { backgroundColor: theme.colors.tertiaryContainer },
            ]}
          >
            <ActivityIndicator
              size={14}
              color={theme.colors.onTertiaryContainer}
              style={{ marginRight: 8 }}
            />
            <Text
              variant="labelSmall"
              style={{
                color: theme.colors.onTertiaryContainer,
                fontWeight: "bold",
              }}
            >
              AI is processing this document...
            </Text>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          {context?.color && (
            <View
              style={[
                styles.colorDot,
                {
                  backgroundColor: context.color,
                  borderColor: theme.colors.outline,
                },
              ]}
            />
          )}
          <Text
            variant="headlineSmall"
            style={{
              color: theme.colors.primary,
              fontWeight: "bold",
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {context ? context.name : "Loading..."}
          </Text>
        </View>
        <IconButton
          icon="close"
          size={28}
          iconColor={theme.colors.onSurface}
          onPress={() => router.back()}
        />
      </View>

      {loading || uploading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          {uploading && (
            <Text style={{ marginTop: 12, color: theme.colors.onSurface }}>
              Saving to server...
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            elevation={0}
          >
            <Card.Content>
              <Text
                variant="labelMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginBottom: 4,
                }}
              >
                Last Updated:{" "}
                {context?.updatedAt
                  ? new Date(context.updatedAt).toLocaleString()
                  : "Unknown"}
              </Text>
              <View style={styles.divider} />
              <Text
                variant="titleMedium"
                style={{
                  color: theme.colors.primary,
                  marginBottom: 8,
                  marginTop: 12,
                }}
              >
                Description
              </Text>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.onSurface, lineHeight: 24 }}
              >
                {context?.description || "No description provided."}
              </Text>
            </Card.Content>
          </Card>

          <View style={styles.documentsTitleRow}>
            <Text
              variant="titleLarge"
              style={{ color: theme.colors.onSurface, fontWeight: "bold" }}
            >
              Sources & Documents
            </Text>
          </View>

          {!context?.files || context.files.length === 0 ? (
            <View style={styles.emptyFilesState}>
              <Avatar.Icon
                size={64}
                icon="file-search-outline"
                style={{ backgroundColor: "transparent" }}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                No documents attached yet.{"\n"}Tap + to upload a file.
              </Text>
            </View>
          ) : (
            context.files.map(renderFileItem)
          )}

          {context?.metadata ? renderMetadata(context.metadata) : null}
        </ScrollView>
      )}

      {/* Upload FAB */}
      {!loading && !uploading && (
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color="#ffffff"
          label="Upload Document"
          onPress={handleUploadFile}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title style={{ color: theme.colors.onSurface }}>
            Delete File
          </Dialog.Title>
          <Dialog.Content>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Are you sure you want to completely remove "
              {fileToDelete?.fileName}"? This action cannot be undone and will
              strip the AI's knowledge of this source.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setDeleteDialogVisible(false)}
              textColor={theme.colors.onSurface}
            >
              Cancel
            </Button>
            <Button
              onPress={executeDeleteFile}
              textColor="#ffffff"
              buttonColor={theme.colors.error}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === "ios" ? 60 : 40 },
  header: {
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollArea: { flex: 1, paddingHorizontal: 24 },
  card: {
    marginVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(150, 150, 150, 0.2)",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(150, 150, 150, 0.2)",
    marginVertical: 12,
  },
  metadataContainer: { padding: 16, borderRadius: 8, marginVertical: 24 },
  documentsTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  fileCard: { marginBottom: 12 },
  emptyFilesState: { alignItems: "center", paddingVertical: 32, opacity: 0.7 },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 20,
    borderRadius: 16,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
});
