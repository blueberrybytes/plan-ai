import React, { useEffect } from "react";
import {
  Box,
  MenuItem,
  Select,
  SelectChangeEvent,
  CircularProgress,
  Typography,
  alpha,
} from "@mui/material";
import { useSelector, useDispatch } from "react-redux";
import {
  selectActiveWorkspaceId,
  selectSidebarCollapsed,
} from "../../store/slices/app/appSelector";
import { setActiveWorkspaceId } from "../../store/slices/app/appSlice";
import { useGetMyWorkspacesQuery } from "../../store/apis/workspaceApi";
import { Business as BusinessIcon, Person as PersonIcon } from "@mui/icons-material";

const WorkspaceSwitcher: React.FC = () => {
  const dispatch = useDispatch();
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const isCollapsed = useSelector(selectSidebarCollapsed);

  const {
    data: workspaces,
    isLoading,
    error,
  } = useGetMyWorkspacesQuery(undefined, {
    // Polling or refetch rules can go here if needed
  });

  // Auto-select the first workspace if none is active
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      dispatch(setActiveWorkspaceId(workspaces[0].id));
    }
  }, [workspaces, activeWorkspaceId, dispatch]);

  const handleChange = (event: SelectChangeEvent<string>) => {
    const newId = event.target.value;
    if (newId && newId !== activeWorkspaceId) {
      // Dispatching setActiveWorkspaceId naturally intercepts at rootReducers.ts
      // which aggressively purges every single workspace-dependent RTK query cache instantly!
      dispatch(setActiveWorkspaceId(newId));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <CircularProgress size={24} color="inherit" sx={{ opacity: 0.5 }} />
      </Box>
    );
  }

  if (error || !workspaces || workspaces.length === 0) {
    return null; // Don't render switcher if failed or empty
  }

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  if (isCollapsed) {
    // Mini view
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            bgcolor: alpha("#4361EE", 0.12),
            color: "primary.light",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(67, 97, 238, 0.2)",
          }}
          title={activeWorkspace.name}
        >
          {activeWorkspace.tier === "FREE" ? (
            <PersonIcon fontSize="small" />
          ) : (
            <BusinessIcon fontSize="small" />
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
      <Select
        value={activeWorkspaceId || activeWorkspace.id}
        onChange={handleChange}
        fullWidth
        size="small"
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: "background.paper",
              mt: 1,
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
            },
          },
        }}
        sx={{
          borderRadius: "12px",
          color: "text.primary",
          fontWeight: 600,
          bgcolor: "rgba(255,255,255,0.03)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.2)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
          },
          "& .MuiSelect-select": {
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            py: 1,
            px: 1.5,
          },
        }}
      >
        {workspaces.map((ws) => (
          <MenuItem
            key={ws.id}
            value={ws.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              borderRadius: "8px",
              mx: 1,
              my: 0.5,
            }}
          >
            {ws.tier === "FREE" ? (
              <PersonIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
            ) : (
              <BusinessIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
            )}
            <Box sx={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {ws.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {ws.tier === "FREE" ? "Personal" : "Team"} • {ws.role}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};

export default WorkspaceSwitcher;
