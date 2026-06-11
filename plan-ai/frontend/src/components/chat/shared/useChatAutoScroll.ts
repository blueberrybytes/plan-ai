import { useRef, useEffect } from "react";

/**
 * Manages auto-scroll behavior for a chat-like scrollable container:
 * - Keeps the view pinned to the bottom when new messages arrive...
 * - ...unless the user has manually scrolled up.
 * - Force-scrolls to bottom when a streaming response starts.
 *
 * Used by ChatWindow, FloatingAssistant, and AssistantChatPanel so they
 * all behave identically when the user is reading older messages while
 * a stream is happening.
 */
export function useChatAutoScroll<TDeps extends readonly unknown[]>(
  /** Re-pin to bottom whenever any of these dependencies change (typically the messages array). */
  trackDeps: TDeps,
  /** When this turns true, ignore "user scrolled up" and snap to bottom (new send). */
  isStreaming: boolean,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Snap to bottom on dep changes unless the user scrolled away.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, trackDeps);

  // Reset "scrolled up" + force-snap when a new stream begins.
  useEffect(() => {
    if (isStreaming) {
      userScrolledUp.current = false;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [isStreaming]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Mark as "scrolled up" if more than 80px from the bottom.
    userScrolledUp.current = distanceFromBottom > 80;
  };

  return { scrollRef, handleScroll };
}
