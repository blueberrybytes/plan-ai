import React from "react";
import { Folder as FolderIcon, MoreVert as MoreVertIcon } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { useDeleteContextMutation, useListContextsQuery } from "../../store/apis/contextApi";
import { setToastMessage } from "../../store/slices/app/appSlice";

interface ContextSidebarSectionProps {
  isCollapsed: boolean;
}

export const ContextSidebarSection: React.FC<ContextSidebarSectionProps> = ({ isCollapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const { data, isLoading, isFetching } = useListContextsQuery();
  const [deleteContext, { isLoading: isDeleting }] = useDeleteContextMutation();

  const contexts = data?.data?.contexts ?? [];
  const isBusy = isFetching || isDeleting;

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [menuContextId, setMenuContextId] = React.useState<string | null>(null);

  const selected = React.useMemo(() => {
    const match = /\/contexts\/(.+)$/.exec(location.pathname);
    return match ? match[1] : null;
  }, [location.pathname]);

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, contextId: string) => {
    setAnchorEl(event.currentTarget);
    setMenuContextId(contextId);
  };

  const closeMenu = () => {
    setAnchorEl(null);
    setMenuContextId(null);
  };

  const handleDelete = async (contextId: string) => {
    closeMenu();
    try {
      await deleteContext(contextId).unwrap();
      if (selected === contextId) {
        navigate("/contexts");
      }
      dispatch(
        setToastMessage({
          severity: "success",
          message: "Context deleted",
        }),
      );
    } catch (error) {
      console.error("Failed to delete context", error);
      dispatch(
        setToastMessage({
          severity: "error",
          message: "Failed to delete context. Please try again.",
        }),
      );
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
          px: isCollapsed ? 0 : 1,
          mb: 1,
        }}
      >
        {!isCollapsed ? (
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Contexts
          </Typography>
        ) : (
          <Tooltip title="Contexts">
            <span />
          </Tooltip>
        )}
      </Box>

      <List dense sx={{ p: 0 }}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <ListItemButton key={index} disabled sx={{ borderRadius: 1 }}>
              <ListItemIcon
                sx={{
                  minWidth: isCollapsed ? 0 : 36,
                  justifyContent: "center",
                }}
              >
                <Skeleton variant="circular" width={24} height={24} />
              </ListItemIcon>
              {!isCollapsed ? <Skeleton variant="text" width="80%" /> : null}
            </ListItemButton>
          ))
        ) : contexts.length === 0 ? (
          <ListItemButton
            disabled
            sx={{
              borderRadius: 1,
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
          >
            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, justifyContent: "center" }}>
              <FolderIcon fontSize="small" color="disabled" />
            </ListItemIcon>
            {!isCollapsed ? (
              <ListItemText
                primary="No contexts yet"
                primaryTypographyProps={{
                  variant: "body2",
                  color: "text.secondary",
                }}
              />
            ) : null}
          </ListItemButton>
        ) : (
          contexts.map((context) => {
            const isActive = selected === context.id;
            const contextLabel = context.name || "Untitled context";

            const button = (
              <ListItemButton
                key={context.id}
                selected={isActive}
                onClick={() => navigate(`/contexts/${context.id}`)}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isCollapsed ? 0 : 36,
                    justifyContent: "center",
                    color: isActive ? "primary.main" : "text.secondary",
                  }}
                >
                  <FolderIcon fontSize="small" />
                </ListItemIcon>
                {!isCollapsed ? (
                  <ListItemText
                    primary={contextLabel}
                    primaryTypographyProps={{
                      variant: "body2",
                      noWrap: true,
                    }}
                  />
                ) : null}
                {!isCollapsed ? (
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(event) => openMenu(event, context.id)}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                ) : null}
              </ListItemButton>
            );

            return isCollapsed ? (
              <Tooltip key={context.id} title={contextLabel} placement="right">
                {button}
              </Tooltip>
            ) : (
              button
            );
          })
        )}
      </List>

      {isBusy ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
          <CircularProgress size={20} />
        </Box>
      ) : null}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            if (menuContextId) {
              handleDelete(menuContextId);
            }
          }}
          sx={{ color: "error.main" }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default ContextSidebarSection;
