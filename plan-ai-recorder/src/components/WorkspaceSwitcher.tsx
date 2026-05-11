import React from "react";
import { Box, MenuItem, Select, Typography, type SelectChangeEvent } from "@mui/material";
import { Business as BusinessIcon } from "@mui/icons-material";
import { useAuth } from "../hooks/useAuth";

const WORKSPACE_STORAGE_KEY = "plan-ai-recorder-active-workspace";

/**
 * Compact workspace switcher for the recorder sidebar.
 * When switched, data (recordings, projects, contexts) refreshes for the new workspace.
 */
const WorkspaceSwitcher: React.FC<{ onSwitch?: () => void }> = ({ onSwitch }) => {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId } = useAuth();

  if (workspaces.length === 0) return null;

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

  // Single workspace — show as static label
  if (workspaces.length === 1) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        <BusinessIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, color: "text.primary" }}>
          {activeWs?.name || workspaces[0].name}
        </Typography>
      </Box>
    );
  }

  // Multiple workspaces — show dropdown selector
  const handleChange = (event: SelectChangeEvent<string>) => {
    const newId = event.target.value;
    if (newId && newId !== activeWorkspaceId) {
      setActiveWorkspaceId(newId);
      onSwitch?.();
    }
  };

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Select
        size="small"
        fullWidth
        value={activeWorkspaceId || ""}
        onChange={handleChange}
        displayEmpty
        renderValue={(value) => {
          const ws = workspaces.find((w) => w.id === value);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <BusinessIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" noWrap sx={{ fontWeight: 600 }}>
                {ws?.name || "Select Workspace"}
              </Typography>
            </Box>
          );
        }}
        sx={{
          bgcolor: "rgba(255,255,255,0.04)",
          borderRadius: 1.5,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.08)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.15)",
          },
          "& .MuiSelect-select": {
            py: 0.75,
            fontSize: "0.75rem",
          },
        }}
      >
        {workspaces.map((ws) => (
          <MenuItem key={ws.id} value={ws.id} sx={{ fontSize: "0.8rem" }}>
            <BusinessIcon sx={{ fontSize: 14, mr: 1, color: "text.secondary" }} />
            {ws.name}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};

export default WorkspaceSwitcher;
