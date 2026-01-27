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
import { Add as AddIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ChatThread } from "../../store/apis/chatApi";

interface ChatSidebarProps {
  threads: ChatThread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  isLoading: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewChat,
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
          >
            <ListItemText
              primary={thread.title}
              secondary={formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: true })}
              primaryTypographyProps={{ noWrap: true }}
            />
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
