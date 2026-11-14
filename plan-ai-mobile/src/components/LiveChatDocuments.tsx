import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { ActivityIndicator, Chip, IconButton, Text, useTheme } from "react-native-paper";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useAuth } from "@/context/AuthContext";
import { HttpError, type LiveChatDocument } from "@/services/planAiApi";

// Same limits as the backend endpoint POST /api/chat/live/documents.
const MAX_DOCUMENTS = 5;
const MAX_BYTES = 20 * 1024 * 1024;

// The types the backend can read. "text/*" covers txt, md, csv and xml.
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/json",
  "application/xml",
  "text/*",
];

export type AttachedDocument = LiveChatDocument & { id: string };

// The files of the meeting in progress. Kept outside the screen so they stay
// attached when the record screen remounts mid-meeting. Memory only, never on
// disk. A new meeting, or no meeting, starts with an empty list.
type Store = { meetingId: string | null; documents: AttachedDocument[] };
let store: Store = { meetingId: null, documents: [] };
const listeners = new Set<() => void>();
const setStore = (next: Store) => {
  store = next;
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getStore = () => store;
const NO_DOCUMENTS: AttachedDocument[] = [];

// The picker leaves a copy in the cache. It is deleted once read.
const dropCopy = (uri: string) => {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // cache file, the OS clears it anyway
  }
};

const readError = (err: unknown, name: string): string => {
  if (err instanceof HttpError && err.message) return err.message;
  if (err instanceof Error && err.name === "AbortError") {
    return `The server did not answer in time while reading ${name}.`;
  }
  return `Could not upload ${name}. Check the connection and try again.`;
};

/**
 * Files attached to the live chat. Pass the id of the meeting being recorded,
 * or null when none is. The server reads each file and stores nothing. The
 * text goes with every later question of the same meeting.
 */
export function useLiveChatDocuments(meetingId: string | null) {
  const { api } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getStore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A different meeting, or the end of one, drops the old text.
  useEffect(() => {
    if (store.meetingId !== meetingId) setStore({ meetingId, documents: [] });
  }, [meetingId]);

  const documents = snapshot.meetingId === meetingId ? snapshot.documents : NO_DOCUMENTS;

  const attach = async () => {
    if (!api || !meetingId || busy) return;
    const room = MAX_DOCUMENTS - documents.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_DOCUMENTS} files per meeting.`);
      return;
    }
    setError(null);

    let assets: DocumentPicker.DocumentPickerAsset[];
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      assets = result.assets;
    } catch {
      setError("Could not open the file picker.");
      return;
    }

    assets.slice(room).forEach((a) => dropCopy(a.uri));
    let lastError: string | null =
      assets.length > room ? `You can attach up to ${MAX_DOCUMENTS} files per meeting.` : null;

    // Files are read one by one so a bad file does not drop the others.
    setBusy(true);
    try {
      for (const asset of assets.slice(0, room)) {
        try {
          if ((asset.size ?? 0) > MAX_BYTES) {
            lastError = `${asset.name} is too large. The limit is 20 MB.`;
            continue;
          }
          const doc = await api.readLiveChatDocument({
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType || "application/octet-stream",
          });
          // The meeting may have ended while the file was read.
          if (store.meetingId !== meetingId) continue;
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          setStore({ meetingId, documents: [...store.documents, { ...doc, id }] });
        } catch (err) {
          // Network and server errors are reported by the API client.
          lastError = readError(err, asset.name);
        } finally {
          dropCopy(asset.uri);
        }
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        setError(lastError);
      }
    }
  };

  const remove = (id: string) => {
    if (store.meetingId !== meetingId) return;
    setStore({ meetingId, documents: store.documents.filter((d) => d.id !== id) });
  };

  return {
    documents,
    busy,
    error,
    canAttach: !!meetingId && !busy && documents.length < MAX_DOCUMENTS,
    attach,
    remove,
    /** What sendLiveChatMessage takes, or undefined when nothing is attached. */
    forQuestion: () =>
      documents.length > 0 ? documents.map((d) => ({ name: d.name, text: d.text })) : undefined,
  };
}

export type LiveChatDocumentsState = ReturnType<typeof useLiveChatDocuments>;

/** Paperclip button for the chat input row. */
export function LiveChatAttachButton({ state }: { state: LiveChatDocumentsState }) {
  const theme = useTheme();
  return (
    <IconButton
      icon="paperclip"
      iconColor={theme.colors.onSurfaceVariant}
      onPress={state.attach}
      disabled={!state.canAttach}
      accessibilityLabel="Attach a file (PDF, Word, Excel, PowerPoint, text)"
      style={{ margin: 0, marginRight: 4 }}
    />
  );
}

/** The attached files, the file being read and the last error. */
export function LiveChatDocumentList({ state }: { state: LiveChatDocumentsState }) {
  const theme = useTheme();
  const { documents, busy, error } = state;
  if (documents.length === 0 && !busy && !error) return null;
  const partial = documents.some((d) => d.truncated);

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 6 }}>
      {documents.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {documents.map((d) => (
            <Chip
              key={d.id}
              mode="outlined"
              compact
              icon="file-document-outline"
              onClose={() => state.remove(d.id)}
              closeIconAccessibilityLabel={`Remove ${d.name}`}
              style={{ maxWidth: "100%" }}
              textStyle={{ fontSize: 13 }}
              ellipsizeMode="middle"
            >
              {d.truncated ? `${d.name} (partial)` : d.name}
            </Chip>
          ))}
        </View>
      )}
      {busy && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size={12} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Reading file...
          </Text>
        </View>
      )}
      {error && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
      {documents.length > 0 && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {documents.length === 1
            ? "The chat reads this file with every question until the meeting ends. It is not saved."
            : `The chat reads these ${documents.length} files with every question until the meeting ends. They are not saved.`}
          {partial ? " Long files: the chat reads only the first part." : ""}
        </Text>
      )}
    </View>
  );
}
