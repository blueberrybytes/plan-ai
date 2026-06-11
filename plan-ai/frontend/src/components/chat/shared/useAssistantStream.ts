/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../store/store";
import type { ChatAttachment } from "../../../store/apis/chatApi";

export interface AssistantUIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: any[];
  /** Attachments persisted with this user message so they render on reload. */
  attachments?: ChatAttachment[];
}

/**
 * Convert a ChatAttachment to the Vercel AI SDK UIMessage `file` part. Images
 * use a "file" part too — the SDK / model identifies images by mediaType.
 */
function attachmentToPart(att: ChatAttachment): { type: "file"; url: string; mediaType: string } {
  return { type: "file", url: att.url, mediaType: att.type };
}

interface UseAssistantStreamOptions {
  /** When set, every request is scoped to this project. */
  projectId?: string;
  /** Receives every message-state change so the caller can persist (Redux, localStorage). */
  onMessagesChange?: (messages: AssistantUIMessage[]) => void;
  /** Initial messages (from persistence). */
  initialMessages?: AssistantUIMessage[];
}

/**
 * Encapsulates the assistant streaming flow used by ChatHome and the
 * per-Project Assistant tab. Owns the messages array, the streaming-in-flight
 * boolean, and the optimistic user/assistant message creation + chunk decode.
 *
 * Surface-specific things (project selector UI, layout, suggestions) stay in
 * the caller — this hook is purely the state + network plumbing.
 */
export function useAssistantStream({
  projectId,
  onMessagesChange,
  initialMessages,
}: UseAssistantStreamOptions = {}) {
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);

  const [messages, setMessagesState] = useState<AssistantUIMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);

  const setMessages = useCallback(
    (updater: (prev: AssistantUIMessage[]) => AssistantUIMessage[]) => {
      setMessagesState((prev) => {
        const next = updater(prev);
        onMessagesChange?.(next);
        return next;
      });
    },
    [onMessagesChange],
  );

  const clear = useCallback(() => {
    setMessages(() => []);
  }, [setMessages]);

  const send = useCallback(
    async (text: string, attachments: ChatAttachment[] = []) => {
      const trimmed = text.trim();
      const hasText = trimmed.length > 0;
      const hasAttachments = attachments.length > 0;
      if (!hasText && !hasAttachments) return;
      if (isStreaming) return;

      // Build multimodal parts: text first (if any), then each attachment.
      const userParts: any[] = [];
      if (hasText) userParts.push({ type: "text", text: trimmed });
      for (const att of attachments) {
        userParts.push(attachmentToPart(att));
      }

      const userTempId = `temp-user-${Date.now()}`;
      const userMsg: AssistantUIMessage = {
        id: userTempId,
        role: "user",
        content: trimmed,
        parts: userParts,
        ...(hasAttachments ? { attachments } : {}),
      };

      const aiTempId = `temp-ai-${Date.now()}`;
      const aiMsg: AssistantUIMessage = {
        id: aiTempId,
        role: "assistant",
        content: "",
        parts: [],
      };

      // Snapshot for the request payload BEFORE the optimistic insert.
      const baselineMessages = [...messages, userMsg];

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);

      try {
        const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
        const formatted = baselineMessages.map((m: any, i) => ({
          ...m,
          id: m.id || `msg-${Date.now()}-${i}`,
          parts: m.parts || [{ type: "text", text: m.content || "" }],
        }));

        const response = await fetch(`${baseUrl}/api/chat/assistant/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "x-workspace-id": activeWorkspaceId || "",
          },
          body: JSON.stringify({
            messages: formatted,
            projectId: projectId || undefined,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.error?.message || errData?.message || "Stream request failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let isDone = false;
        let currentAiContent = "";

        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) {
            isDone = true;
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          currentAiContent += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiTempId ? { ...m, content: currentAiContent } : m)),
          );
        }
      } catch (error: any) {
        console.error("Assistant streaming error", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiTempId
              ? {
                  ...m,
                  content: `**⚠️ Error:**\n\n${
                    error?.message || "Failed to generate AI response."
                  }`,
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, token, activeWorkspaceId, projectId, setMessages],
  );

  return {
    messages,
    isStreaming,
    send,
    clear,
    /** Use sparingly — prefer `send` and `clear`. For hydrating from external state. */
    setMessages,
  };
}
