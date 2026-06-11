import { useCallback, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../store/store";
import type { ChatAttachment } from "../../../store/apis/chatApi";

interface UseChatAttachmentsOptions {
  /**
   * Endpoint to POST the multipart upload to. Builds the absolute URL by
   * prefixing REACT_APP_API_BACKEND_URL automatically.
   * Examples:
   *   "/api/chat/threads/abc/attachments"  (thread-scoped — ChatWindow)
   *   "/api/chat/attachments"              (threadless — AssistantChatPanel)
   */
  uploadEndpoint: string;
  /** Skip uploads entirely (e.g. while there's no thread yet). */
  disabled?: boolean;
}

/**
 * Encapsulates the pending-attachment lifecycle shared by every chat surface:
 *   - pending list state
 *   - hidden <input type="file"> ref + open() helper
 *   - drag-drop / paste handlers
 *   - upload-in-flight flag
 *   - clear / remove helpers
 *
 * UI primitives (preview strip, attach button) live in separate components so
 * each chat can wire them where it makes sense.
 */
export function useChatAttachments({ uploadEndpoint, disabled }: UseChatAttachmentsOptions) {
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      if (disabled) return;
      if (!files || files.length === 0) return;
      setIsUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(`${baseUrl}${uploadEndpoint}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "x-workspace-id": activeWorkspaceId || "",
            },
            body: formData,
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.message || `Failed to upload ${file.name}`);
          }
          const attachment = (await res.json()) as ChatAttachment;
          setPending((prev) => [...prev, attachment]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to upload attachment");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [disabled, baseUrl, uploadEndpoint, token, activeWorkspaceId],
  );

  const removeAt = useCallback((idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clear = useCallback(() => setPending([]), []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Bind directly to your message-area / input container as
   * `<Box {...dragProps}>`. Returns the handlers + a `isDraggingOver` flag
   * the caller can use to render a drop overlay.
   */
  const useDragDrop = () => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const onDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
    };
    const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: React.DragEvent) => {
      // Only clear when leaving the actual outer container.
      if (e.target === e.currentTarget) setIsDraggingOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      void upload(e.dataTransfer.files);
    };
    return {
      isDraggingOver,
      dragProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    };
  };

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!e.clipboardData?.files || e.clipboardData.files.length === 0) return;
      e.preventDefault();
      void upload(e.clipboardData.files);
    },
    [upload],
  );

  return {
    pending,
    isUploading,
    error,
    setError,
    fileInputRef,
    upload,
    removeAt,
    clear,
    openFilePicker,
    useDragDrop,
    onPaste,
  };
}
