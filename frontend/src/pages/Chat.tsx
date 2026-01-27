import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useListThreadsQuery,
  useGetThreadQuery,
  useCreateThreadMutation,
  useUpdateThreadMutation,
  useDeleteThreadMutation,
  ChatThread,
} from "../store/apis/chatApi";
import SidebarLayout from "../components/layout/SidebarLayout";
import ChatSidebar from "../components/chat/ChatSidebar";
import ChatWindow from "../components/chat/ChatWindow";
import ChatContextDialog from "../components/chat/ChatContextDialog";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

const Chat: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadIdFromUrl = searchParams.get("chat");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadIdFromUrl);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingThread, setEditingThread] = useState<ChatThread | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const dispatch = useDispatch();

  // Sync state to URL when selectedThreadId changes
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

  // Sync URL to state when URL changes (e.g. back button)
  useEffect(() => {
    if (threadIdFromUrl !== selectedThreadId) {
      setSelectedThreadId(threadIdFromUrl);
    }
  }, [threadIdFromUrl, selectedThreadId]);

  // Queries
  const { data: threads, isLoading: isLoadingThreads } = useListThreadsQuery();
  const { data: threadData } = useGetThreadQuery(selectedThreadId ?? "", {
    skip: !selectedThreadId,
  });

  // Mutations
  const [createThread, { isLoading: isCreating }] = useCreateThreadMutation();
  const [updateThread, { isLoading: isUpdating }] = useUpdateThreadMutation();
  const [deleteThread, { isLoading: isDeleting }] = useDeleteThreadMutation();
  // const [sendMessage, { isLoading: isSending }] = useSendMessageMutation();
  const isSending = false;

  const handleNewChat = () => {
    setDialogMode("create");
    setEditingThread(null);
    setIsContextDialogOpen(true);
  };

  const handleEditChat = (thread: ChatThread) => {
    setDialogMode("edit");
    setEditingThread(thread);
    setIsContextDialogOpen(true);
  };

  const handleDeleteChat = (id: string) => {
    setThreadToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveChat = async (selectedContextIds: string[], title?: string) => {
    try {
      if (dialogMode === "create") {
        const newThread = await createThread({
          title: title || t("chat.sidebar.newChat"),
          contextIds: selectedContextIds,
        }).unwrap();
        handleSelectThread(newThread.id);
        dispatch(
          setToastMessage({
            message: t("chat.messages.chatCreated") || "Chat created",
            severity: "success",
          }),
        );
      } else if (editingThread) {
        await updateThread({
          threadId: editingThread.id,
          title: title || editingThread.title,
          contextIds: selectedContextIds,
        }).unwrap();
        dispatch(
          setToastMessage({
            message: t("chat.messages.chatUpdated") || "Chat updated",
            severity: "success",
          }),
        );
      }
      setIsContextDialogOpen(false);
    } catch (error) {
      console.error("Failed to save chat", error);
      dispatch(
        setToastMessage({
          message: t("chat.messages.saveError") || "Failed to save chat",
          severity: "error",
        }),
      );
    }
  };

  const confirmDeleteChat = async () => {
    if (!threadToDelete) return;
    try {
      await deleteThread(threadToDelete).unwrap();
      if (selectedThreadId === threadToDelete) {
        handleSelectThread(null);
      }
      setIsDeleteDialogOpen(false);
      setThreadToDelete(null);
      dispatch(
        setToastMessage({
          message: t("chat.messages.chatDeleted") || "Chat deleted",
          severity: "success",
        }),
      );
    } catch (error) {
      console.error("Failed to delete chat", error);
      dispatch(
        setToastMessage({
          message: t("chat.messages.deleteError") || "Failed to delete chat",
          severity: "error",
        }),
      );
    }
  };

  /*
  const handleSendMessage = async (content: string) => {
    if (!selectedThreadId) return;
    try {
      await sendMessage({ threadId: selectedThreadId, content }).unwrap();
    } catch (error) {
      console.error("Failed to send message", error);
      throw error;
    }
  };
  */

  const activeThread = selectedThreadId
    ? (threads?.find((t) => t.id === selectedThreadId) ?? null)
    : null;

  // Merge full details if available, otherwise use list data (though list data has no contextIds usually)
  // Actually getThread returns { ...thread, messages }.
  // We should prefer threadData for the active thread view.
  const activeThreadWithDetails =
    selectedThreadId && threadData
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
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          onEditChat={handleEditChat}
          onDeleteChat={handleDeleteChat}
          isLoading={isLoadingThreads}
        />

        <ChatWindow
          activeThread={activeThreadWithDetails}
          messages={messages}
          isSending={isSending}
          onNewChat={handleNewChat}
        />

        <ChatContextDialog
          open={isContextDialogOpen}
          onClose={() => setIsContextDialogOpen(false)}
          onStartChat={handleSaveChat}
          isLoading={isCreating || isUpdating}
          mode={dialogMode}
          initialTitle={editingThread?.title || ""}
          initialSelectedContextIds={editingThread?.contextIds || []}
        />

        <ConfirmDeletionDialog
          open={isDeleteDialogOpen}
          onConfirm={confirmDeleteChat}
          onCancel={() => setIsDeleteDialogOpen(false)}
          isProcessing={isDeleting}
          title={t("chat.sidebar.delete")}
          description={t("chat.sidebar.confirmDelete")}
          entityName={threads?.find((t) => t.id === threadToDelete)?.title}
        />
      </Box>
    </SidebarLayout>
  );
};

export default Chat;
