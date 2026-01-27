import React, { useState } from "react";
import { Box } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
} from "../store/apis/chatApi";
import ChatWindow from "../components/chat/ChatWindow";
import ChatContextDialog from "../components/chat/ChatContextDialog";

const ChatFull: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadIdFromUrl = searchParams.get("chat");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadIdFromUrl);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);

  // Queries
  const { data: threads } = useListThreadsQuery();
  const { data: threadData, refetch: refetchThread } = useGetThreadQuery(selectedThreadId ?? "", {
    skip: !selectedThreadId,
  });

  // Mutations
  const [createThread, { isLoading: isCreating }] = useCreateThreadMutation();

  const handleSelectThread = (id: string | null) => {
    setSelectedThreadId(id);
    if (id) {
      setSearchParams({ chat: id });
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("chat");
      setSearchParams(newParams);
    }
  };

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
      handleSelectThread(newThread.id);
      setIsContextDialogOpen(false);
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  };

  const activeThread = selectedThreadId
    ? (threads?.find((t) => t.id === selectedThreadId) ?? null)
    : null;

  const activeThreadWithDetails =
    selectedThreadId && threadData
      ? { ...threadData }
      : activeThread
        ? { ...activeThread, messages: [], contextIds: activeThread.contextIds || [] }
        : null;

  const messages = threadData?.messages ?? [];

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ChatWindow
        activeThread={activeThreadWithDetails}
        messages={messages}
        isSending={false}
        onNewChat={handleNewChat}
        onRefetch={refetchThread}
        isFullScreen={true}
      />

      <ChatContextDialog
        open={isContextDialogOpen}
        onClose={() => setIsContextDialogOpen(false)}
        onStartChat={handleStartChat}
        isLoading={isCreating}
      />
    </Box>
  );
};

export default ChatFull;
