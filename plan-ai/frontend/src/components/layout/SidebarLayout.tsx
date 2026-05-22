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
  Collapse,
} from "@mui/material";
import {
  //Dashboard as DashboardIcon,
  ViewKanban as ViewKanbanIcon,
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
  People as PeopleIcon,
  Group as GroupIcon,
  DesktopWindows as DesktopWindowsIcon,
  Smartphone as SmartphoneIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Brush as BrushIcon,
} from "@mui/icons-material";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectAvatar, selectUser, selectUserDb } from "../../store/slices/auth/authSelector";

import { selectSidebarCollapsed } from "../../store/slices/app/appSelector";
import { toggleSidebar, setActiveWorkspaceId } from "../../store/slices/app/appSlice";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";
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

const coreNavItems: NavItem[] = [
  { labelKey: "sidebarLayout.nav.home", path: "/home", icon: <AutoAwesomeIcon fontSize="small" /> },
  {
    labelKey: "sidebarLayout.nav.recordings",
    path: "/recordings",
    icon: <MicIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.sessions",
    path: "/projects",
    icon: <ViewKanbanIcon fontSize="small" />,
  },
  { labelKey: "sidebarLayout.nav.chat", path: "/chat", icon: <ChatIcon fontSize="small" /> },
];

const libraryNavItems: NavItem[] = [
  {
    labelKey: "sidebarLayout.nav.integrations",
    path: "/integrations",
    icon: <IntegrationInstructionsIcon fontSize="small" />,
  },
  { labelKey: "sidebarLayout.nav.team", path: "/team", icon: <GroupIcon fontSize="small" /> },
];

const studioNavItems: NavItem[] = [
  {
    labelKey: "sidebarLayout.nav.documents",
    path: "/docs",
    icon: <ArticleIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.slides",
    path: "/slides",
    icon: <SlideshowIcon fontSize="small" />,
  },
  {
    labelKey: "sidebarLayout.nav.diagrams",
    path: "/diagrams",
    icon: <AccountTreeIcon fontSize="small" />,
  },
  { labelKey: "Brand Themes", path: "/brand-themes", icon: <PaletteIcon fontSize="small" /> },
];

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, fullHeight = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const userDb = useSelector(selectUserDb);
  const avatar = useSelector(selectAvatar);

  const isCollapsed = useSelector(selectSidebarCollapsed);
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const { t } = useTranslation();

  const [studioOpen, setStudioOpen] = React.useState(false);

  const { data: usageData } = useGetUsageMetricsQuery(
    { currentMonthOnly: true, limit: 1, workspaceId: activeWorkspaceId || "" },
    { skip: !activeWorkspaceId, refetchOnFocus: true, pollingInterval: 10000 },
  );

  const { data: workspaces } = useGetMyWorkspacesQuery();
  
  React.useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      dispatch(setActiveWorkspaceId(workspaces[0].id));
    }
  }, [workspaces, activeWorkspaceId, dispatch]);
  const activeWorkspace = React.useMemo(
    () => workspaces?.find((w) => w.id === activeWorkspaceId),
    [workspaces, activeWorkspaceId],
  );

  const isMissingKeys =
    activeWorkspace &&
    !activeWorkspace.isCourtesy &&
    activeWorkspace.role === "OWNER" &&
    userDb?.role !== "ADMIN" &&
    (!activeWorkspace.openRouterKey || !activeWorkspace.deepgramKey);

  const MAX_MONTHLY_TOKENS = activeWorkspace?.monthlyTokenLimit || 200000;
  const currentTokens = usageData?.totalBlueberryTokens || 0;
  const tokenPercentage = Math.min((currentTokens / MAX_MONTHLY_TOKENS) * 100, 100);
  const isOverLimit = currentTokens > MAX_MONTHLY_TOKENS;

  const adminNavItems = React.useMemo(() => {
    const items = [];
    if (userDb?.role === "ADMIN") {
      items.push({
        labelKey: "Admin",
        path: "/admin",
        icon: <PeopleIcon fontSize="small" />,
      });
    }
    return items;
  }, [userDb?.role]);

  const isNavActive = React.useCallback(
    (path: string): boolean =>
      location.pathname === path || location.pathname.startsWith(`${path}/`),
    [location.pathname],
  );

  React.useEffect(() => {
    if (!isCollapsed && studioNavItems.some((item) => isNavActive(item.path))) {
      setStudioOpen(true);
    }
  }, [isNavActive, isCollapsed]);

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
          p: 1.5,
          gap: 1.5,
        }}
      >
        <Box
          component="aside"
          sx={{
            width: isCollapsed ? 64 : 200,
            flexShrink: 0,
            bgcolor: "background.paper",
            borderRadius: "20px",
            border: "1px solid",
            borderColor: "rgba(255, 255, 255, 0.05)",
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
              gap: 0.5,
              px: isCollapsed ? 0 : 0.5,
              mb: 1,
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
          >
            {!isCollapsed && (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <WorkspaceSwitcher />
              </Box>
            )}
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
                sx={{ 
                  color: "text.secondary",
                  flexShrink: 0,
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" }
                }}
              >
                {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </IconButton>
            </Tooltip>
          </Box>

          {!isCollapsed && activeWorkspaceId && (
            <Box
              onClick={() => navigate("/team?tab=analytics")}
              sx={{
                px: 2,
                mt: 1.5,
                mb: 0.5,
                cursor: "pointer",
                borderRadius: "12px",
                mx: 1,
                py: 0.5,
                transition: "background-color 0.2s",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.04)",
                },
              }}
            >
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
            {coreNavItems.map((item) => {
              return (
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
              );
            })}

            <Divider
              sx={{
                my: 1.5,
                borderColor: (theme) => theme.palette.primary.dark,
                mx: isCollapsed ? 1 : 2,
              }}
            />

            {libraryNavItems.map((item) => {
              return (
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
              );
            })}

            <ListItemButton
              onClick={() => {
                if (isCollapsed) {
                  dispatch(toggleSidebar());
                  setStudioOpen(true);
                } else {
                  setStudioOpen(!studioOpen);
                }
              }}
              selected={
                studioNavItems.some((i) => isNavActive(i.path)) && (isCollapsed || !studioOpen)
              }
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
                <BrushIcon fontSize="small" />
              </ListItemIcon>
              {!isCollapsed && (
                <ListItemText
                  primary="Studio"
                  primaryTypographyProps={{
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                  }}
                />
              )}
              {!isCollapsed && (
                <ListItemIcon sx={{ minWidth: 0, color: "text.secondary" }}>
                  {studioOpen ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </ListItemIcon>
              )}
            </ListItemButton>

            <Collapse in={studioOpen && !isCollapsed} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {studioNavItems.map((item) => {
                  return (
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
                        pl: !isCollapsed ? 4 : undefined,
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
                  );
                })}
              </List>
            </Collapse>

            {adminNavItems.length > 0 && (
              <>
                <Divider
                  sx={{
                    my: 1.5,
                    borderColor: (theme) => theme.palette.primary.dark,
                    mx: isCollapsed ? 1 : 2,
                  }}
                />
                {adminNavItems.map((item) => {
                  return (
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
                  );
                })}
              </>
            )}
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
              transition: (theme) =>
                theme.transitions.create(["background-color", "color"], { duration: 200 }),
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
            bgcolor: "background.paper",
            borderRadius: "20px",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            position: "relative",
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
                      ⚠️ Your workspace is missing required API keys. AI features (Transcriptions,
                      Insights) will not work.
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
