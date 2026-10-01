import React from "react";
import { ListItemButton, ListItemIcon, ListItemText, Tooltip, alpha } from "@mui/material";
import { NavLink } from "react-router-dom";

type SidebarNavItemProps = {
  label: string;
  path: string;
  icon: React.ReactElement;
  selected: boolean;
  collapsed: boolean;
};

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  label,
  path,
  icon,
  selected,
  collapsed,
}) => (
  <Tooltip title={collapsed ? label : ""} placement="right">
    <ListItemButton
      component={NavLink}
      to={path}
      selected={selected}
      sx={{
        borderRadius: "10px",
        mb: 0.5,
        mx: collapsed ? 0.5 : 0,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "10px" : "9px 14px",
        "&.Mui-selected": {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          color: "primary.main",
          "& .MuiListItemIcon-root": {
            color: "primary.main",
          },
        },
        "&:hover": {
          bgcolor: "action.hover",
        },
      }}
    >
      <ListItemIcon
        sx={{
          color: "text.secondary",
          minWidth: collapsed ? 0 : 34,
          justifyContent: "center",
        }}
      >
        {icon}
      </ListItemIcon>
      {!collapsed ? (
        <ListItemText
          primary={label}
          primaryTypographyProps={{ fontWeight: 600, fontSize: "0.9375rem" }}
        />
      ) : null}
    </ListItemButton>
  </Tooltip>
);

export default SidebarNavItem;
