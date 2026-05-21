import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Typography,
} from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import {
  Logout as LogoutIcon,
  DeleteForever as DeleteForeverIcon,
  Person as PersonIcon,
  Warning as WarningIcon,
  Email as EmailIcon,
} from "@mui/icons-material";
import GoogleIcon from "@mui/icons-material/Google";
import AppleIcon from "@mui/icons-material/Apple";
import MicrosoftIcon from "../components/MicrosoftIcon";
import BugReportIcon from "@mui/icons-material/BugReport";
import { getLogSink } from "../utils/loggerSink";

import { useDispatch, useSelector } from "react-redux";

import SidebarLayout from "../components/layout/SidebarLayout";
import DeleteAccountDialog from "../components/dialogs/DeleteAccountDialog";
import { selectAvatar, selectUser, selectUserDb } from "../store/slices/auth/authSelector";
import { logout, setUserDb } from "../store/slices/auth/authSlice";
import { useGetCurrentUserQuery } from "../store/apis/authApi";
import {
  useDeleteMyAccountMutation,
  useGetCustomThemeQuery,
  useUpsertCustomThemeMutation,
} from "../store/apis/accountApi";
import { useGetWorkspaceMembersQuery } from "../store/apis/workspaceApi";
import { useListIntegrationsQuery } from "../store/apis/integrationApi";
import { useTranslation } from "react-i18next";
import { getAppThemePresets } from "../utils/appThemes";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

const AppThemeSelector: React.FC = () => {
  const { t } = useTranslation();
  const user = useSelector(selectUser);
  const { brandKey } = useBrandIdentity();
  const { data, isLoading } = useGetCustomThemeQuery(undefined, { skip: !user });
  const [upsertTheme, { isLoading: isUpdating }] = useUpsertCustomThemeMutation();

  const activePresets = useMemo(() => getAppThemePresets(brandKey), [brandKey]);

  const currentThemeId = useMemo(() => {
    if (!data?.data || !data.data.primaryColor) return activePresets[0]?.id || "custom";

    // Attempt to match custom theme back to a preset by primaryColor
    const matched = activePresets.find(
      (p) => p.primaryColor.toLowerCase() === data.data?.primaryColor?.toLowerCase(),
    );
    console.log("Profile - Current Theme ID matched:", matched?.id || "custom");
    return matched ? matched.id : "custom";
  }, [data, activePresets]);

  const handleSelectPreset = async (presetId: string) => {
    const preset = activePresets.find((p) => p.id === presetId);
    if (!preset) return;

    try {
      await upsertTheme({
        primaryColor: preset.primaryColor,
        secondaryColor: preset.secondaryColor || null,
        backgroundColor: preset.backgroundColor,
        surfaceColor: preset.surfaceColor,
        textPrimaryColor: preset.textPrimaryColor || null,
        textSecondaryColor: preset.textSecondaryColor || null,
        borderRadius: preset.borderRadius || 12,
        configJson: preset.isLight ? { isLight: true } : null,
      }).unwrap();
    } catch (e) {
      console.error("Failed to update theme:", e);
    }
  };

  if (isLoading) {
    return <CircularProgress size={24} />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {activePresets.map((preset) => {
        const isSelected = currentThemeId === preset.id;
        return (
          <Paper
            key={preset.id}
            onClick={() => !isUpdating && handleSelectPreset(preset.id)}
            sx={{
              p: 2,
              cursor: isUpdating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: isSelected ? `2px solid ${preset.primaryColor}` : "2px solid transparent",
              backgroundColor: preset.surfaceColor,
              opacity: isUpdating ? 0.6 : 1,
              transition: "all 0.2s",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${preset.primaryColor} 0%, ${preset.secondaryColor || preset.primaryColor} 100%)`,
                }}
              />
              <Typography
                variant="body1"
                sx={{ fontWeight: 600, color: preset.isLight ? "#1a1a1a" : "#ffffff" }}
              >
                {t(preset.nameKey, preset.id.charAt(0).toUpperCase() + preset.id.slice(1))}
              </Typography>
            </Box>
            {isSelected && <CheckCircleIcon sx={{ color: preset.primaryColor }} />}
          </Paper>
        );
      })}
    </Box>
  );
};


const Profile: React.FC = () => {

  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const avatar = useSelector(selectAvatar);
  const userDb = useSelector(selectUserDb);
  const { productName } = useBrandIdentity();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    data: currentUserData,
    isLoading: isUserDataLoading,
    error: userDataError,
    refetch: refetchUserData,
  } = useGetCurrentUserQuery(undefined, {
    skip: !user,
  });

  const {
    data: integrationsData,
    isLoading: isIntegrationsLoading,
    error: integrationsError,
    refetch: refetchIntegrations,
  } = useListIntegrationsQuery(undefined, {
    skip: !user,
  });

  const { data: workspaceMembersData } = useGetWorkspaceMembersQuery(undefined, { skip: !user });

  const currentMemberInfo = useMemo(() => {
    if (!workspaceMembersData?.members || !user?.email) return null;
    return workspaceMembersData.members.find((m) => m.email === user.email);
  }, [workspaceMembersData, user?.email]);

  const integrations = useMemo(() => integrationsData?.data ?? [], [integrationsData?.data]);

  const resolveStatusChipColor = useMemo(
    () =>
      ({
        CONNECTED: "success",
        DISCONNECTED: "default",
        ERROR: "error",
      }) as const,
    [],
  );

  const formatProvider = (provider: string) =>
    provider
      .toLowerCase()
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

  const [deleteMyAccount, { isLoading: isDeleting }] = useDeleteMyAccountMutation();

  useEffect(() => {
    if (currentUserData?.data) {
      dispatch(
        setUserDb({
          id: currentUserData.data.id,
          name: currentUserData.data.name || "",
          email: currentUserData.data.email,
          avatar: currentUserData.data.avatarUrl || "",
          role: currentUserData.data.role,
          company: "",
          createdAt: userDb?.createdAt ?? new Date().toISOString(),
          updatedAt: userDb?.updatedAt ?? new Date().toISOString(),
        }),
      );
    }
  }, [currentUserData, dispatch, userDb?.createdAt, userDb?.updatedAt]);

  const roleDisplay = useMemo(() => {
    if (isUserDataLoading) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t("profile.role.loading")}
          </Typography>
        </Box>
      );
    }

    if (userDataError) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" fontSize="small" />
          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
            {t("profile.role.error")}
          </Typography>
          <Button size="small" onClick={() => refetchUserData()} sx={{ minWidth: "auto" }}>
            {t("profile.role.retry")}
          </Button>
        </Box>
      );
    }

    const role = userDb?.role || currentUserData?.data?.role;
    return (
      <Chip
        label={role ? role.toUpperCase() : t("profile.role.notAvailable")}
        color={
          role === "ADMIN"
            ? "error"
            : role === "PREMIUM"
              ? "secondary"
              : role === "PENDING"
                ? "warning"
                : "primary"
        }
        size="small"
        sx={{ fontWeight: "bold" }}
      />
    );
  }, [
    isUserDataLoading,
    userDataError,
    userDb?.role,
    currentUserData?.data?.role,
    t,
    refetchUserData,
  ]);

  const signInMethods = useMemo(() => {
    const methods = [];
    const data = currentUserData?.data as Record<string, unknown>;
    if (data?.isGoogleAccount) {
      methods.push({
        icon: <GoogleIcon fontSize="small" />,
        label: "Google",
        color: "error" as const,
      });
    }
    if (data?.isAppleAccount) {
      methods.push({
        icon: <AppleIcon fontSize="small" />,
        label: "Apple",
        color: "default" as const,
      });
    }
    if (data?.isMicrosoftAccount) {
      methods.push({ icon: <MicrosoftIcon />, label: "Microsoft", color: "info" as const });
    }
    if (methods.length === 0) {
      methods.push({
        icon: <EmailIcon fontSize="small" />,
        label: "Email / Password",
        color: "primary" as const,
      });
    }
    return methods;
  }, [currentUserData]);

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleConfirmDelete = async () => {
    setDeleteError(null);
    try {
      await deleteMyAccount().unwrap();
      dispatch(logout());
    } catch (error) {
      console.error("Error deleting account", error);
      setDeleteError(t("profile.errors.deleteAccount"));
      throw error;
    }
  };

  const initials = useMemo(() => {
    if (userDb?.name) {
      return userDb.name
        .split(" ")
        .filter((segment) => Boolean(segment))
        .map((segment) => segment.charAt(0).toUpperCase())
        .slice(0, 2)
        .join("");
    }

    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }

    return "";
  }, [userDb?.name, user?.email]);

  const email = user?.email || userDb?.email || "";
  const languageOptions = useMemo(
    () => [
      { code: "en", label: t("profile.language.options.en") },
      { code: "es", label: t("profile.language.options.es") },
    ],
    [t],
  );

  const selectedLanguage = useMemo(
    () => (i18n.language ? i18n.language.split("-")[0] : "en"),
    [i18n.language],
  );

  const handleLanguageChange = (event: SelectChangeEvent<string>) => {
    void i18n.changeLanguage(event.target.value);
  };

  return (
    <SidebarLayout>
      <Box sx={{ width: "100%", p: { xs: 2, md: 4 } }}>
        <Paper elevation={3} sx={{ p: 4, mb: 4, borderRadius: 2 }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              gap: 3,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Avatar src={avatar || undefined} sx={{ width: 80, height: 80 }}>
                {initials || <PersonIcon fontSize="large" />}
              </Avatar>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 0 }}>
                    {t("profile.heading")}
                  </Typography>
                  {roleDisplay}
                </Box>
                <Typography variant="body1" color="text.secondary">
                  {email || t("profile.role.notAvailable")}
                </Typography>
              </Box>
            </Box>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="profile-language-label">{t("profile.language.label")}</InputLabel>
              <Select
                labelId="profile-language-label"
                label={t("profile.language.label")}
                value={selectedLanguage}
                onChange={handleLanguageChange}
                sx={{ borderRadius: 2 }}
              >
                {languageOptions.map((option) => (
                  <MenuItem key={option.code} value={option.code}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Paper>

        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Paper elevation={1} sx={{ p: 3, height: "100%", borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                {t("profile.sections.info")}
              </Typography>

              {isUserDataLoading && !currentUserData ? (
                <Alert severity="info" sx={{ mb: 2, mt: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={16} />
                    {t("profile.alerts.loading")}
                  </Box>
                </Alert>
              ) : null}

              {userDataError ? (
                <Alert
                  severity="error"
                  sx={{ mb: 2, mt: 2 }}
                  action={
                    <Button color="inherit" size="small" onClick={() => refetchUserData()}>
                      {t("profile.role.retry")}
                    </Button>
                  }
                >
                  {t("profile.alerts.refreshError")}
                </Alert>
              ) : null}

              <List disablePadding>
                <ListItem divider>
                  <ListItemText
                    primary={t("profile.info.userId")}
                    secondary={user?.uid || t("profile.role.notAvailable")}
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    secondaryTypographyProps={{ variant: "body1", color: "text.primary" }}
                  />
                </ListItem>
                <ListItem divider>
                  <ListItemText
                    primary={t("profile.info.accountCreated")}
                    secondary={
                      user?.creationTime || userDb?.createdAt || t("profile.role.notAvailable")
                    }
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    secondaryTypographyProps={{ variant: "body1", color: "text.primary" }}
                  />
                </ListItem>
                <ListItem divider>
                  <ListItemText
                    primary={t("profile.info.lastSignIn")}
                    secondary={
                      user?.lastSignInTime || userDb?.updatedAt || t("profile.role.notAvailable")
                    }
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    secondaryTypographyProps={{ variant: "body1", color: "text.primary" }}
                  />
                </ListItem>
                <ListItem divider>
                  <ListItemText
                    primary="User Personas (Active Workspace)"
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    secondary={
                      currentMemberInfo?.personas?.length ? (
                        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                          {currentMemberInfo.personas.map((p) => (
                            <Chip
                              key={p}
                              label={p.replace(/_/g, " ")}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ textTransform: "capitalize", fontWeight: 500 }}
                            />
                          ))}
                        </Box>
                      ) : (
                        "None assigned"
                      )
                    }
                    secondaryTypographyProps={{ component: "div" }}
                  />
                </ListItem>
                {currentMemberInfo?.personaNotes && (
                  <ListItem divider>
                    <ListItemText
                      primary="Custom AI Instructions"
                      primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                      secondary={currentMemberInfo.personaNotes}
                      secondaryTypographyProps={{
                        sx: { whiteSpace: "pre-wrap", mt: 0.5, color: "text.primary" },
                      }}
                    />
                  </ListItem>
                )}
                <ListItem>
                  <ListItemText
                    primary="Sign-In Method"
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    secondary={
                      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                        {signInMethods.map((method, idx) => (
                          <Chip
                            key={idx}
                            icon={method.icon}
                            label={method.label}
                            size="small"
                            color={method.color}
                            variant="outlined"
                            sx={{ fontWeight: 500 }}
                          />
                        ))}
                      </Box>
                    }
                    secondaryTypographyProps={{ component: "div" }}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
              <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  {t("profile.sections.theme", "App Theme Appearance")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {t(
                    "profile.sections.themeDescription",
                    `Personalize how ${productName} looks for you.`,
                  )}
                </Typography>
                <AppThemeSelector />
              </Paper>

              <Paper elevation={1} sx={{ p: 3, borderRadius: 2, flexGrow: 1 }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  {t("profile.sections.integrations")}
                </Typography>

                {isIntegrationsLoading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      {t("profile.integrations.loading")}
                    </Typography>
                  </Box>
                ) : null}

                {integrationsError ? (
                  <Alert
                    severity="error"
                    sx={{ mt: 2 }}
                    action={
                      <Button color="inherit" size="small" onClick={() => refetchIntegrations()}>
                        {t("profile.integrations.retry")}
                      </Button>
                    }
                  >
                    {t("profile.integrations.error")}
                  </Alert>
                ) : null}

                {!isIntegrationsLoading && !integrationsError ? (
                  integrations.length > 0 ? (
                    <List disablePadding sx={{ mt: 2 }}>
                      {integrations.map((integration) => (
                        <ListItem
                          key={integration?.id ?? integration?.provider}
                          divider
                          sx={{ alignItems: "flex-start", px: 0 }}
                        >
                          <ListItemText
                            primary={formatProvider(integration?.provider ?? "Unknown")}
                            primaryTypographyProps={{ fontWeight: 500 }}
                            secondary={
                              integration?.accountName ??
                              integration?.accountId ??
                              t("profile.integrations.notLinked")
                            }
                          />
                          {integration?.status ? (
                            <Chip
                              label={integration.status}
                              color={
                                resolveStatusChipColor[
                                  integration.status as keyof typeof resolveStatusChipColor
                                ] ?? "default"
                              }
                              size="small"
                              sx={{ ml: 2, textTransform: "capitalize", fontWeight: 600 }}
                            />
                          ) : null}
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {t("profile.integrations.empty")}
                    </Typography>
                  )
                ) : null}
              </Paper>
            </Box>
          </Grid>
        </Grid>

        <Box
          sx={{
            mt: 6,
            pt: 3,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<BugReportIcon />}
            onClick={() => {
              const logs = getLogSink();
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
              const downloadAnchorNode = document.createElement("a");
              downloadAnchorNode.setAttribute("href", dataStr);
              downloadAnchorNode.setAttribute("download", `plan-ai-debug-logs-${new Date().toISOString()}.json`);
              document.body.appendChild(downloadAnchorNode);
              downloadAnchorNode.click();
              downloadAnchorNode.remove();
            }}
            sx={{ px: 3, borderRadius: 2 }}
          >
            Export Debug Logs
          </Button>

          <Button
            variant="contained"
            color="primary"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ px: 3, borderRadius: 2 }}
          >
            {t("profile.buttons.logout")}
          </Button>

          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setIsDeleteDialogOpen(true)}
            sx={{ px: 3, borderRadius: 2 }}
          >
            {t("profile.buttons.deleteAccount")}
          </Button>
        </Box>
      </Box>

      <DeleteAccountDialog
        open={isDeleteDialogOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteError(null);
            setIsDeleteDialogOpen(false);
          }
        }}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        errorMessage={deleteError}
        userEmail={email}
      />
    </SidebarLayout>
  );
};

export default Profile;
