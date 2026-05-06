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
  Button,
} from "@mui/material";
import {
  //Dashboard as DashboardIcon,
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
  AccountTree as AccountTreeIcon,
  Palette as PaletteIcon,
  Insights as InsightsIcon,
  People as PeopleIcon,
  MonetizationOn as MonetizationOnIcon,
  Group as GroupIcon,
  DesktopWindows as DesktopWindowsIcon,
  Smartphone as SmartphoneIcon,
} from "@mui/icons-material";
import { NavLink, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectAvatar, selectUser, selectUserDb } from "../../store/slices/auth/authSelector";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { selectSidebarCollapsed } from "../../store/slices/app/appSelector";
import { toggleSidebar } from "../../store/slices/app/appSlice";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";
import { MailOutline as MailIcon } from "@mui/icons-material";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { CircularProgress, LinearProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetUsageMetricsQuery } from "../../store/apis/aiUsageApi";
import { useGetMyWorkspacesQuery } from "../../store/apis/workspaceApi";

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
  /*{
    labelKey: "sidebarLayout.nav.dashboard",
    path: "/dashboard",
    icon: <DashboardIcon fontSize="small" />,
  },*/
  {
    labelKey: "sidebarLayout.nav.team",
    path: "/team",
    icon: <GroupIcon fontSize="small" />,
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
    labelKey: "sidebarLayout.nav.diagrams", // Or add to i18n later
    path: "/diagrams",
    icon: <AccountTreeIcon fontSize="small" />,
  },
  {
    labelKey: "Brand Themes",
    path: "/brand-themes",
    icon: <PaletteIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.integrations",
    path: "/integrations",
    icon: <IntegrationInstructionsIcon fontSize="small" />,
  },
  {
    labelKey: "aiUsage.heading",
    path: "/usage",
    icon: <InsightsIcon fontSize="small" />,
  },
];

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, fullHeight = false }) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const userDb = useSelector(selectUserDb);
  const avatar = useSelector(selectAvatar);
  const { logoSrc, logoAlt, productName, brandKey } = useBrandIdentity();
  const isCollapsed = useSelector(selectSidebarCollapsed);
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const { t } = useTranslation();

  const { data: usageData } = useGetUsageMetricsQuery(
    { currentMonthOnly: true, limit: 1, workspaceId: activeWorkspaceId || "" },
    { skip: !activeWorkspaceId, refetchOnFocus: true, pollingInterval: 10000 },
  );

  const { data: workspaces } = useGetMyWorkspacesQuery(undefined, { skip: !activeWorkspaceId });
  const activeWorkspace = React.useMemo(() => 
    workspaces?.find((w) => w.id === activeWorkspaceId), 
  [workspaces, activeWorkspaceId]);

  const isMissingKeys = activeWorkspace && !activeWorkspace.isCourtesy && (!activeWorkspace.openRouterKey || !activeWorkspace.deepgramKey);

  const MAX_MONTHLY_TOKENS = activeWorkspace?.monthlyTokenLimit || 200000;
  const currentTokens = usageData?.totalBlueberryTokens || 0;
  const tokenPercentage = Math.min((currentTokens / MAX_MONTHLY_TOKENS) * 100, 100);
  const isOverLimit = currentTokens > MAX_MONTHLY_TOKENS;

  const appNavItems = React.useMemo(() => {
    const items = [...navItems];
    if (userDb?.role === "ADMIN") {
      items.push({
        labelKey: "sidebarLayout.nav.users",
        path: "/admin/users",
        icon: <PeopleIcon fontSize="small" />,
      });
      items.push({
        labelKey: "aiPricing.heading",
        path: "/admin/pricing",
        icon: <MonetizationOnIcon fontSize="small" />,
      });
      items.push({
        labelKey: "Email Templates",
        path: "/admin/emails",
        icon: <MailIcon fontSize="small" />,
      });
      items.push({
        labelKey: "Chat Stream Test",
        path: "/chat-stream-test",
        icon: <ChatIcon fontSize="small" />,
      });
    }
    return items;
  }, [userDb?.role]);

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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          flexGrow: 1,
          minHeight: 0,
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
              {!isCollapsed && (
                <img
                  src={logoSrc}
                  alt={logoAlt}
                  style={{
                    height: brandKey === "housegroup" ? 22 : 32,
                    filter: "brightness(1.2)",
                    maxWidth: "100%",
                  }}
                />
              )}
              {!isCollapsed && brandKey !== "housegroup" ? (
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: "-0.5px",
                    background: (theme) =>
                      `linear-gradient(90deg, ${theme.palette.text.primary} 0%, ${theme.palette.text.secondary} 100%)`,
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
                isCollapsed
                  ? t("sidebarLayout.tooltip.expand")
                  : t("sidebarLayout.tooltip.collapse")
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

          <WorkspaceSwitcher />

          {!isCollapsed && activeWorkspaceId && (
            <Box sx={{ px: 2, mt: 1.5, mb: 0.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                  Usage (This Month)
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: isOverLimit ? "error.main" : "text.primary", fontWeight: 600 }}
                >
                  {currentTokens.toLocaleString()} / {MAX_MONTHLY_TOKENS.toLocaleString()}
                </Typography>
              </Box>
              <Tooltip
                title={
                  isOverLimit
                    ? "You are exceeding the recommended token limit"
                    : `${currentTokens.toLocaleString()} Blueberry Tokens used`
                }
              >
                <LinearProgress
                  variant="determinate"
                  value={tokenPercentage}
                  color={isOverLimit ? "error" : "primary"}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.1),
                    "& .MuiLinearProgress-bar": { borderRadius: 3 },
                  }}
                />
              </Tooltip>
            </Box>
          )}

          <Divider sx={{ my: 1, opacity: 0.5 }} />

          <List
            sx={{
              flexGrow: 1,
              p: 0,
              overflowY: "auto",
              overflowX: "hidden",
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                borderRadius: 4,
              },
            }}
          >
            {appNavItems.map((item) => (
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

          <Divider sx={{ my: 1, opacity: 0.5 }} />
          
          <ButtonBase
            component={NavLink}
            to="/downloads"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: isCollapsed ? 0 : 1.5,
              borderRadius: "10px",
              px: isCollapsed ? 1 : 1.5,
              py: 0.8,
              mb: 1,
              mx: isCollapsed ? 0.5 : 0,
              width: isCollapsed ? "auto" : "100%",
              textAlign: "left",
              color: "text.secondary",
              transition: (theme) => theme.transitions.create(["background-color", "color"], { duration: 200 }),
              "&.active": {
                color: "primary.light",
                bgcolor: alpha("#4361EE", 0.08),
              },
              "&:hover": {
                bgcolor: "rgba(255, 255, 255, 0.04)",
                color: "text.primary",
              },
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <DesktopWindowsIcon sx={{ fontSize: 18 }} />
              <SmartphoneIcon sx={{ fontSize: 16, opacity: 0.8 }} />
            </Box>
            {!isCollapsed && (
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                Get the Apps
              </Typography>
            )}
          </ButtonBase>

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
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
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
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            height: "100%",
            overflow: fullHeight ? "hidden" : "auto",
            bgcolor: "background.default",
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
          <Box
            sx={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {activeWorkspaceId ? (
              <>
                {isMissingKeys && (
                  <Box
                    sx={{
                      px: 3,
                      py: 1,
                      bgcolor: "warning.main",
                      color: "warning.contrastText",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      zIndex: 10,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ⚠️ Your workspace is missing required API keys. AI features (Transcriptions, Insights) will not work.
                    </Typography>
                    <Button
                      component={NavLink}
                      to="/team"
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor: "warning.contrastText",
                        color: "warning.contrastText",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        "&:hover": {
                          bgcolor: "rgba(0,0,0,0.1)",
                          borderColor: "warning.contrastText",
                        },
                      }}
                    >
                      Configure Keys
                    </Button>
                  </Box>
                )}
                {children}
              </>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <CircularProgress />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default SidebarLayout;
