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
  alpha,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  ViewKanban as ViewKanbanIcon,
  Folder as FolderIcon,
  Person as PersonIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  IntegrationInstructions as IntegrationInstructionsIcon,
  Slideshow as SlideshowIcon,
  Mic as MicIcon,
  Article as ArticleIcon,
  AutoAwesome as AutoAwesomeIcon,
  Chat as ChatIcon,
} from "@mui/icons-material";
import { NavLink, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectAvatar, selectUser } from "../../store/slices/auth/authSelector";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { selectSidebarCollapsed } from "../../store/slices/app/appSelector";
import { toggleSidebar } from "../../store/slices/app/appSlice";
import { useTranslation } from "react-i18next";

type SidebarLayoutProps = {
  children: React.ReactNode;
  /** Set to true for pages that manage their own full-height layout (e.g. split panels) */
  fullHeight?: boolean;
};

type NavItem = {
  labelKey: string;
  path: string;
  icon: React.ReactElement;
};

const navItems: NavItem[] = [
  { labelKey: "sidebarLayout.nav.home", path: "/home", icon: <AutoAwesomeIcon fontSize="small" /> },
  {
    labelKey: "sidebarLayout.nav.dashboard",
    path: "/dashboard",
    icon: <DashboardIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.sessions",
    path: "/projects",
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
    labelKey: "sidebarLayout.nav.recordings",
    path: "/recordings",
    icon: <MicIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.slides",
    path: "/slides",
    icon: <SlideshowIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.documents",
    path: "/docs",
    icon: <ArticleIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.integrations",
    path: "/integrations",
    icon: <IntegrationInstructionsIcon fontSize="small" />,
  },
];

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, fullHeight = false }) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const avatar = useSelector(selectAvatar);
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
        height: "100vh",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <Box
        component="aside"
        sx={{
          width: isCollapsed ? 80 : 264,
          flexShrink: 0,
          borderRight: "1px solid",
          borderColor: "rgba(255, 255, 255, 0.08)",
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column",
          py: 3,
          px: isCollapsed ? 1 : 2,
          transition: (theme) =>
            theme.transitions.create(["width", "padding"], {
              duration: theme.transitions.duration.shorter,
            }),
          position: "relative",
          zIndex: 10,
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
            <img src={logoSrc} alt={logoAlt} style={{ height: 32, filter: "brightness(1.2)" }} />
            {!isCollapsed ? (
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  background: "linear-gradient(90deg, #fff 0%, #94a3b8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {productName}
              </Typography>
            ) : null}
          </Box>
          <Tooltip
            title={
              isCollapsed ? t("sidebarLayout.tooltip.expand") : t("sidebarLayout.tooltip.collapse")
            }
          >
            <IconButton
              onClick={handleToggleCollapse}
              size="small"
              sx={{ color: "text.secondary" }}
            >
              {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ my: 3, opacity: 0.5 }} />

        <List sx={{ flexGrow: 1, p: 0 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={isNavActive(item.path)}
              sx={{
                borderRadius: "12px",
                mb: 0.8,
                mx: isCollapsed ? 0.5 : 0,
                justifyContent: isCollapsed ? "center" : "flex-start",
                padding: isCollapsed ? "10px" : "10px 16px",
                "&.Mui-selected": {
                  bgcolor: alpha("#4361EE", 0.12),
                  color: "primary.light",
                  border: "1px solid rgba(67, 97, 238, 0.2)",
                  "& .MuiListItemIcon-root": {
                    color: "primary.light",
                  },
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: "20%",
                    bottom: "20%",
                    width: "3px",
                    bgcolor: "primary.main",
                    borderRadius: "0 4px 4px 0",
                    boxShadow: "0 0 10px rgba(67, 97, 238, 0.8)",
                  },
                },
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.04)",
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
                  primaryTypographyProps={{
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                  }}
                />
              ) : null}
            </ListItemButton>
          ))}
        </List>

        <Divider sx={{ my: 2, opacity: 0.5 }} />

        <ButtonBase
          component={NavLink}
          to="/profile"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: isCollapsed ? 0 : 1.5,
            borderRadius: "14px",
            px: 1.5,
            py: 1,
            width: "100%",
            textAlign: "left",
            transition: (theme) =>
              theme.transitions.create(["background-color"], { duration: 200 }),
            "&:hover": {
              bgcolor: "rgba(255, 255, 255, 0.04)",
            },
            justifyContent: isCollapsed ? "center" : "flex-start",
          }}
        >
          <Avatar
            src={avatar || undefined}
            sx={{
              bgcolor: "primary.dark",
              color: "primary.contrastText",
              width: 36,
              height: 36,
              fontSize: "0.875rem",
              fontWeight: 700,
              boxShadow: "0 0 15px rgba(67, 97, 238, 0.2)",
            }}
          >
            {profileInitials || <PersonIcon fontSize="small" />}
          </Avatar>
          {!isCollapsed ? (
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#fff" }}>
                {user?.displayName || t("sidebarLayout.profile.fallbackName")}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap
                sx={{ fontSize: "0.75rem" }}
              >
                {user?.email || t("sidebarLayout.profile.fallbackEmail")}
              </Typography>
            </Box>
          ) : null}
        </ButtonBase>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          height: "100%",
          overflow: fullHeight ? "hidden" : "auto",
          bgcolor: "#0b0d11",
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, rgba(67, 97, 238, 0) 0%, rgba(67, 97, 238, 0.1) 50%, rgba(67, 97, 238, 0) 100%)",
          },
        }}
      >
        {/* Ambient orbs — decorative only, pointer-events:none */}
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {/* Primary orb — top right */}
          <Box
            sx={{
              position: "absolute",
              top: "-10%",
              right: "-5%",
              width: 600,
              height: 600,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(67,97,238,0.13) 0%, rgba(67,97,238,0.04) 45%, transparent 70%)",
              animation: "orb-drift 18s ease-in-out infinite alternate",
              "@keyframes orb-drift": {
                "0%": { transform: "translate(0, 0) scale(1)" },
                "50%": { transform: "translate(-40px, 30px) scale(1.06)" },
                "100%": { transform: "translate(-20px, 60px) scale(0.97)" },
              },
            }}
          />
          {/* Secondary orb — bottom left */}
          <Box
            sx={{
              position: "absolute",
              bottom: "-15%",
              left: "-5%",
              width: 480,
              height: 480,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.03) 45%, transparent 70%)",
              animation: "orb-drift-b 22s ease-in-out infinite alternate",
              "@keyframes orb-drift-b": {
                "0%": { transform: "translate(0, 0) scale(1)" },
                "50%": { transform: "translate(30px, -40px) scale(1.08)" },
                "100%": { transform: "translate(50px, -20px) scale(0.95)" },
              },
            }}
          />
          {/* Tiny accent orb — mid-left */}
          <Box
            sx={{
              position: "absolute",
              top: "40%",
              left: "20%",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
              animation: "orb-drift 28s ease-in-out infinite alternate-reverse",
            }}
          />
        </Box>

        {/* Page content sits above orbs */}
        <Box sx={{ position: "relative", zIndex: 1, height: "100%" }}>{children}</Box>
      </Box>
    </Box>
  );
};

export default SidebarLayout;
