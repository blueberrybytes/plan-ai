import React, { useState } from "react";
import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
  useSendMessageMutation,
} from "../store/apis/chatApi";
import SidebarLayout from "../components/layout/SidebarLayout";
import ChatSidebar from "../components/chat/ChatSidebar";
import ChatWindow from "../components/chat/ChatWindow";
import ChatContextDialog from "../components/chat/ChatContextDialog";

const Chat: React.FC = () => {
  const { t } = useTranslation();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);

  // Queries
  const { data: threads, isLoading: isLoadingThreads } = useListThreadsQuery();
  const { data: threadData } = useGetThreadQuery(selectedThreadId!, {
    skip: !selectedThreadId,
  });

  // Mutations
  const [createThread, { isLoading: isCreating }] = useCreateThreadMutation();
  const [sendMessage, { isLoading: isSending }] = useSendMessageMutation();

  const handleNewChat = () => {
    setSelectedThreadId(null);
    setIsContextDialogOpen(true);
  };

  const handleStartChat = async (selectedContextIds: string[]) => {
    try {
      const newThread = await createThread({
        title: t("chat.sidebar.newChat"),
        contextIds: selectedContextIds,
      }).unwrap();
      setSelectedThreadId(newThread.id);
      setIsContextDialogOpen(false);
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedThreadId) return;
    try {
      await sendMessage({ threadId: selectedThreadId, content }).unwrap();
    } catch (error) {
      console.error("Failed to send message", error);
      throw error;
    }
  };

  const activeThread = selectedThreadId
    ? (threads?.find((t) => t.id === selectedThreadId) ?? null)
    : null;

  // Merge full details if available, otherwise use list data (though list data has no contextIds usually)
  // Actually getThread returns { ...thread, messages }.
  // We should prefer threadData for the active thread view.
  const activeThreadWithDetails = threadData
    ? { ...threadData }
    : activeThread
      ? { ...activeThread, messages: [], contextIds: activeThread.contextIds || [] }
      : null;

  const messages = threadData?.messages ?? [];

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", height: "calc(100vh - 0px)" }}>
        <ChatSidebar
          threads={threads ?? []}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
          onNewChat={handleNewChat}
          isLoading={isLoadingThreads}
        />

        <ChatWindow
          activeThread={activeThreadWithDetails}
          messages={messages}
          isSending={isSending}
          onSendMessage={handleSendMessage}
          onNewChat={handleNewChat}
        />

        <ChatContextDialog
          open={isContextDialogOpen}
          onClose={() => setIsContextDialogOpen(false)}
          onStartChat={handleStartChat}
          isLoading={isCreating}
        />
      </Box>
    </SidebarLayout>
  );
};

export default Chat;
