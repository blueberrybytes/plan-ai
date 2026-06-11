import React, { useState } from "react";
import { Box } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
  useUpdateThreadMutation,
  ChatThread,
} from "../store/apis/chatApi";
import ChatWindow from "../components/chat/ChatWindow";
import ChatContextDialog from "../components/chat/ChatContextDialog";

const ChatFull: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadIdFromUrl = searchParams.get("chat");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadIdFromUrl);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingThread, setEditingThread] = useState<ChatThread | null>(null);

  // Queries
  const { data: threads } = useListThreadsQuery();
  const { data: threadData, refetch: refetchThread } = useGetThreadQuery(selectedThreadId ?? "", {
    skip: !selectedThreadId,
  });

  // Mutations
  const [createThread, { isLoading: isCreating }] = useCreateThreadMutation();
  const [updateThread, { isLoading: isUpdating }] = useUpdateThreadMutation();

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
    setDialogMode("create");
    setEditingThread(null);
    setIsContextDialogOpen(true);
  };

  const handleEditChat = (thread: ChatThread) => {
    setDialogMode("edit");
    setEditingThread(thread);
    setIsContextDialogOpen(true);
  };

  const handleStartChat = async (
    selectedProjectIds: string[],
    title?: string,
    complexityLevel?: string,
  ) => {
    try {
      if (dialogMode === "edit" && editingThread) {
        await updateThread({
          threadId: editingThread.id,
          title: title || editingThread.title,
          projectIds: selectedProjectIds,
          complexityLevel,
        }).unwrap();
        await refetchThread();
      } else {
        const newThread = await createThread({
          title: title || t("chat.sidebar.newChat"),
          projectIds: selectedProjectIds,
          complexityLevel,
        }).unwrap();
        handleSelectThread(newThread.id);
      }
      setIsContextDialogOpen(false);
    } catch (error) {
      console.error("Failed to save chat", error);
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
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <ChatWindow
        activeThread={activeThreadWithDetails}
        messages={messages}
        isSending={false}
        onNewChat={handleNewChat}
        onRefetch={refetchThread}
        isFullScreen={true}
        onEditChat={handleEditChat}
      />

      <ChatContextDialog
        open={isContextDialogOpen}
        onClose={() => setIsContextDialogOpen(false)}
        onStartChat={handleStartChat}
        isLoading={isCreating || isUpdating}
        mode={dialogMode}
        initialTitle={editingThread?.title || ""}
        initialSelectedProjectIds={editingThread?.projectIds || []}
      />
    </Box>
  );
};

export default ChatFull;
