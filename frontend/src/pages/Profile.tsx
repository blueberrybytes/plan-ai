import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
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
} from "@mui/icons-material";
import { useDispatch, useSelector } from "react-redux";

import SidebarLayout from "../components/layout/SidebarLayout";
import DeleteAccountDialog from "../components/dialogs/DeleteAccountDialog";
import { selectAvatar, selectUser, selectUserDb } from "../store/slices/auth/authSelector";
import { logout, setUserDb } from "../store/slices/auth/authSlice";
import { useGetCurrentUserQuery } from "../store/apis/authApi";
import { useDeleteMyAccountMutation } from "../store/apis/accountApi";
import { useListIntegrationsQuery } from "../store/apis/integrationApi";
import { useTranslation } from "react-i18next";

const Profile: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const avatar = useSelector(selectAvatar);
  const userDb = useSelector(selectUserDb);

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
      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
        {role ? role.toUpperCase() : t("profile.role.notAvailable")}
      </Typography>
    );
  }, [
    isUserDataLoading,
    userDataError,
    userDb?.role,
    currentUserData?.data?.role,
    t,
    refetchUserData,
  ]);

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
      <Grid container spacing={3} sx={{ p: { xs: 3, md: 6 } }}>
        <Grid item xs={12} lg={8}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                alignItems: { xs: "flex-start", md: "center" },
                justifyContent: "space-between",
                gap: 3,
                mb: 3,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Avatar src={avatar || undefined} sx={{ width: 72, height: 72 }}>
                  {initials || <PersonIcon />}
                </Avatar>
                <Box>
                  <Typography variant="h4" gutterBottom>
                    {t("profile.heading")}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {t("profile.description")}
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
                >
                  {languageOptions.map((option) => (
                    <MenuItem key={option.code} value={option.code}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Divider sx={{ my: 3 }} />

            {isUserDataLoading && !currentUserData ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={16} />
                  {t("profile.alerts.loading")}
                </Box>
              </Alert>
            ) : null}

            {userDataError ? (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => refetchUserData()}>
                    {t("profile.role.retry")}
                  </Button>
                }
              >
                {t("profile.alerts.refreshError")}
              </Alert>
            ) : null}

            <Typography variant="h6" gutterBottom>
              {t("profile.sections.info")}
            </Typography>

            <List disablePadding>
              <ListItem>
                <ListItemText
                  primary={t("profile.info.email")}
                  secondary={email || t("profile.role.notAvailable")}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t("profile.info.userId")}
                  secondary={user?.uid || t("profile.role.notAvailable")}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t("profile.info.accountCreated")}
                  secondary={
                    user?.creationTime || userDb?.createdAt || t("profile.role.notAvailable")
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t("profile.info.lastSignIn")}
                  secondary={
                    user?.lastSignInTime || userDb?.updatedAt || t("profile.role.notAvailable")
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText primary={t("profile.info.role")} secondary={roleDisplay} />
              </ListItem>
            </List>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
              >
                {t("profile.buttons.logout")}
              </Button>

              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteForeverIcon />}
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                {t("profile.buttons.deleteAccount")}
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper elevation={1} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t("profile.sections.workspaceFootprint")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("profile.sections.workspaceDescription")}
            </Typography>
          </Paper>

          <Paper elevation={1} sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t("profile.sections.integrations")}
            </Typography>

            {isIntegrationsLoading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
                <List disablePadding sx={{ mt: 1 }}>
                  {integrations.map((integration) => (
                    <ListItem
                      key={integration?.id ?? integration?.provider}
                      divider
                      sx={{ alignItems: "flex-start" }}
                    >
                      <ListItemText
                        primary={formatProvider(integration?.provider ?? "Unknown")}
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
                          sx={{ ml: 2, textTransform: "capitalize" }}
                        />
                      ) : null}
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t("profile.integrations.empty")}
                </Typography>
              )
            ) : null}
          </Paper>
        </Grid>
      </Grid>

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
