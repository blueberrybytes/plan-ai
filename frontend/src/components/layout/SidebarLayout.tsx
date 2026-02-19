import React from "react";
import {
  Avatar,
  Box,
  ButtonBase,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  ViewKanban as ViewKanbanIcon,
  Folder as FolderIcon,
  Person as PersonIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  IntegrationInstructions as IntegrationInstructionsIcon,
  Chat as ChatIcon,
  Slideshow as SlideshowIcon,
} from "@mui/icons-material";
import { NavLink, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectUser } from "../../store/slices/session/sessionSelector";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { selectSidebarCollapsed } from "../../store/slices/app/appSelector";
import { toggleSidebar } from "../../store/slices/app/appSlice";
import { useTranslation } from "react-i18next";

type SidebarLayoutProps = {
  children: React.ReactNode;
};

type NavItem = {
  labelKey: string;
  path: string;
  icon: React.ReactElement;
};

const navItems: NavItem[] = [
  { labelKey: "sidebarLayout.nav.home", path: "/home", icon: <DashboardIcon fontSize="small" /> },
  {
    labelKey: "sidebarLayout.nav.sessions",
    path: "/sessions",
    icon: <ViewKanbanIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.contexts",
    path: "/contexts",
    icon: <FolderIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.chat",
    path: "/chat",
    icon: <ChatIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.slides",
    path: "/slides",
    icon: <SlideshowIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.integrations",
    path: "/integrations",
    icon: <IntegrationInstructionsIcon fontSize="small" />,
  },
];

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const { logoSrc, logoAlt, productName } = useBrandIdentity();
  const isCollapsed = useSelector(selectSidebarCollapsed);
  const { t } = useTranslation();

  const isNavActive = (path: string): boolean =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const profileInitials = React.useMemo(() => {
    if (user?.displayName) {
      return user.displayName
        .split(" ")
        .filter((segment) => Boolean(segment))
        .map((segment: string) => segment.charAt(0).toUpperCase())
        .slice(0, 2)
        .join("");
    }

    if (user?.email) {
      return user.email[0]?.toUpperCase() ?? "";
    }

    return "";
  }, [user?.displayName, user?.email]);

  const handleToggleCollapse = () => {
    dispatch(toggleSidebar());
  };

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Box
        component="aside"
        sx={{
          width: isCollapsed ? 80 : 264,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          py: 3,
          px: isCollapsed ? 1 : 2,
          transition: (theme) =>
            theme.transitions.create(["width", "padding"], {
              duration: theme.transitions.duration.shorter,
            }),
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: isCollapsed ? 0 : 1.5,
            px: 1,
            minHeight: 48,
            justifyContent: isCollapsed ? "center" : "space-between",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <img src={logoSrc} alt={logoAlt} style={{ height: 32 }} />
            {!isCollapsed ? (
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {productName}
              </Typography>
            ) : null}
          </Box>
          <Tooltip
            title={
              isCollapsed ? t("sidebarLayout.tooltip.expand") : t("sidebarLayout.tooltip.collapse")
            }
          >
            <IconButton onClick={handleToggleCollapse} size="small">
              {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ my: 3 }} />

        <List sx={{ flexGrow: 1, p: 0 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={isNavActive(item.path)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                justifyContent: isCollapsed ? "center" : "flex-start",
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "& .MuiListItemIcon-root": {
                    color: "primary.contrastText",
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: "text.secondary",
                  minWidth: isCollapsed ? 0 : 36,
                  justifyContent: "center",
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!isCollapsed ? (
                <ListItemText
                  primary={t(item.labelKey)}
                  primaryTypographyProps={{ fontWeight: 500 }}
                />
              ) : null}
            </ListItemButton>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <ButtonBase
          component={NavLink}
          to="/profile"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: isCollapsed ? 0 : 1.5,
            borderRadius: 1,
            px: 1.5,
            py: 1,
            width: "100%",
            textAlign: "left",
            transition: (theme) =>
              theme.transitions.create(["background-color"], { duration: 200 }),
            "&:hover": {
              bgcolor: "action.hover",
            },
            justifyContent: isCollapsed ? "center" : "flex-start",
          }}
        >
          <Avatar sx={{ bgcolor: "primary.light", color: "primary.contrastText" }}>
            {profileInitials || <PersonIcon fontSize="small" />}
          </Avatar>
          {!isCollapsed ? (
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {user?.displayName || t("sidebarLayout.profile.fallbackName")}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {user?.email || t("sidebarLayout.profile.fallbackEmail")}
              </Typography>
            </Box>
          ) : null}
        </ButtonBase>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
};

export default SidebarLayout;
