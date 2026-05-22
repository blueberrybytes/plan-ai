import React, { useState } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Button,
  Chip,
  Divider,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { IconButton, Tooltip } from "@mui/material";
import { ChatThread } from "../../store/apis/chatApi";
import { useListProjectsQuery } from "../../store/apis/projectApi";

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: projectsResponse } = useListProjectsQuery(undefined);
  const allProjects = projectsResponse?.data?.projects ?? [];

  return (
    <Box
      sx={{
        width: { xs: "100%", md: isCollapsed ? 60 : 300 },
        display: { xs: selectedThreadId ? "none" : "flex", md: "flex" },
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 0.2s ease-in-out",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
        }}
      >
        {!isCollapsed && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<AddIcon />}
            onClick={onNewChat}
            sx={{ mr: 1 }}
          >
            {t("chat.sidebar.newChat")}
          </Button>
        )}
        <Tooltip title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <IconButton onClick={() => setIsCollapsed(!isCollapsed)} size="small">
            {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />
      {!isCollapsed && (
        <List sx={{ flexGrow: 1, overflowY: "auto", overflowX: "hidden" }}>
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
                secondary={
                  <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.25 }}>
                    {thread.projectIds && thread.projectIds.length > 0 && (
                      <Box
                        component="span"
                        sx={{ display: "flex", flexWrap: "wrap", gap: 0.3 }}
                      >
                        {thread.projectIds.slice(0, 3).map((pid) => {
                          const proj = allProjects.find((p) => p.id === pid);
                          return proj ? (
                            <Chip
                              key={pid}
                              label={proj.title}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: "0.6rem",
                                height: 18,
                                maxWidth: 120,
                                "& .MuiChip-label": { px: 0.75 },
                              }}
                            />
                          ) : null;
                        })}
                        {thread.projectIds.length > 3 && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            +{thread.projectIds.length - 3}
                          </Typography>
                        )}
                      </Box>
                    )}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: true })}
                    </Typography>
                  </Box>
                }
                primaryTypographyProps={{
                  noWrap: true,
                  sx: { fontWeight: selectedThreadId === thread.id ? 600 : 400 },
                }}
                secondaryTypographyProps={{ component: "div" }}
              />
              <Box className="chat-actions" sx={{ ml: 1, gap: 0.5 }}>
                <Tooltip title={t("chat.sidebar.edit") || "Edit"}>
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
                <Tooltip title={t("chat.sidebar.delete") || "Delete"}>
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
      )}
    </Box>
  );
};

export default ChatSidebar;
