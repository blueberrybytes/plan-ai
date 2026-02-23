import React from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Button,
  Divider,
  CircularProgress,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { IconButton, Tooltip } from "@mui/material";
import { ChatThread } from "../../store/apis/chatApi";

interface ChatSidebarProps {
  threads: ChatThread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  onEditChat: (thread: ChatThread) => void;
  onDeleteChat: (threadId: string) => void;
  isLoading: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewChat,
  onEditChat,
  onDeleteChat,
  isLoading,
}) => {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        width: 300,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <Box sx={{ p: 2 }}>
        <Button variant="contained" fullWidth startIcon={<AddIcon />} onClick={onNewChat}>
          {t("chat.sidebar.newChat")}
        </Button>
      </Box>
      <Divider />
      <List sx={{ flexGrow: 1, overflowY: "auto" }}>
        {isLoading && <CircularProgress sx={{ m: 2 }} />}
        {threads.map((thread) => (
          <ListItemButton
            key={thread.id}
            selected={selectedThreadId === thread.id}
            onClick={() => onSelectThread(thread.id)}
            sx={{
              "& .chat-actions": { display: "none" },
              "&:hover .chat-actions": { display: "flex" },
            }}
          >
            <ListItemText
              primary={thread.title}
              secondary={formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: true })}
              primaryTypographyProps={{
                noWrap: true,
                sx: { fontWeight: selectedThreadId === thread.id ? 600 : 400 },
              }}
            />
            <Box className="chat-actions" sx={{ ml: 1, gap: 0.5 }}>
              <Tooltip title={t("chat.sidebar.edit")}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditChat(thread);
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("chat.sidebar.delete")}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(thread.id);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </ListItemButton>
        ))}
        {!isLoading && threads.length === 0 && (
          <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">{t("chat.sidebar.emptyList")}</Typography>
          </Box>
        )}
      </List>
    </Box>
  );
};

export default ChatSidebar;
