import React, { useEffect, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Button,
  ButtonBase,
  Stack,
  Divider,
  CircularProgress,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Logout as LogoutIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  WarningAmber as WarningIcon,
  Info as InfoIcon,
  Fingerprint as FingerprintIcon,
  BugReport as BugIcon,
  Palette as PaletteIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import AppleIcon from "@mui/icons-material/Apple";
import GoogleIcon from "@mui/icons-material/Google";
import MicrosoftIcon from "../components/MicrosoftIcon";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import pkg from "../../package.json";
import { WorkspaceMemberResponse } from "../services/planAiApi";
import { useThemePreset } from "../hooks/ThemePresetProvider";
import { THEME_PRESETS } from "../theme";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, dbUser, signOut, api, token } = useAuth();
  const { themeId, setThemeId } = useThemePreset();
  // Diagnostics and crash tools: development builds, or platform admins.
  const canUseDebugPanel = import.meta.env.DEV || dbUser?.role === "ADMIN";

  const [profileData, setProfileData] = useState<{
    name: string | null;
    email: string;
    avatarUrl: string | null;
    isGoogleAccount?: boolean;
    isAppleAccount?: boolean;
    isMicrosoftAccount?: boolean;
    role?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentMemberInfo, setCurrentMemberInfo] =
    useState<WorkspaceMemberResponse | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) return;
      try {
        const currentUser = await api.getCurrentUser();
        setProfileData(currentUser);

        if (currentUser?.email) {
          const workspaceData = await api.getWorkspaceMembers();
          const member = workspaceData.members.find(
            (m) => m.email === currentUser.email,
          );
          if (member) setCurrentMemberInfo(member);
        }
      } catch (err) {
        console.error("Failed to load full profile data:", err);
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [api, token]);

  const handleLogout = async () => {
    // CRITICAL: Apple/Google Login via the Embedded Electron BrowserWindow leaves
    // permanent cookies in session.defaultSession. We MUST purge them here so
    // the next login attempt actually shows the Apple Account picker again!
    if (window.electron?.clearAuthSession) {
      try {
        console.log(
          "[Profile Logout] Sending secure IPC signal to wipe Chromium Apple Cookies...",
        );
        const success = await window.electron.clearAuthSession();
        console.log(
          "[Profile Logout] IPC signal completed. Success flag:",
          success,
        );
      } catch (err) {
        console.warn(
          "[Profile Logout] Failed to clear Electron auth session:",
          err,
        );
      }
    } else {
      console.warn(
        "[Profile Logout] FATAL: window.electron.clearAuthSession is missing from ContextBridge!",
      );
    }

    await signOut();
    navigate("/login");
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await api.deleteMyAccount();
      // The backend instantly deletes the Firebase instance + PG data.
      await signOut();
      navigate("/login");
    } catch (err) {
      console.error("Failed to delete account:", err);
      alert(
        `Failed to delete account: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: "background.default",
      }}
    >
      {/* Drag region header */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
          flexShrink: 0,
        }}
      />

      <Box
        sx={{
          flex: 1,
          p: { xs: 2, md: 3 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* Navigation Bar */}
        <Box
          sx={{ width: "100%", display: "flex", alignItems: "center", mb: 2 }}
        >
          <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight="bold">
            Profile Details
          </Typography>
        </Box>

        {loading ? (
          <CircularProgress sx={{ mt: 10 }} />
        ) : (
          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 820,
              p: { xs: 2.5, md: 3 },
              border: (theme: Theme) =>
                `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
              borderRadius: 3,
              // Two columns so sign out is reachable without scrolling.
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              columnGap: 4,
              rowGap: 3,
              alignItems: "start",
              bgcolor: (theme: Theme) =>
                alpha(theme.palette.text.primary, 0.02),
            }}
          >
            {/* Left column: who is signed in */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <Avatar
                src={profileData?.avatarUrl || user?.photoURL || undefined}
                sx={{
                  width: 64,
                  height: 64,
                  mb: 1.5,
                  fontSize: "1.75rem",
                  bgcolor: "primary.main",
                }}
              >
                {!(profileData?.avatarUrl || user?.photoURL) &&
                  (profileData?.name?.[0] || user?.email?.[0]?.toUpperCase())}
              </Avatar>

              <Typography variant="h5" fontWeight="bold" gutterBottom>
                {profileData?.name || "User"}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2.5 }}
              >
                Plan AI Account
              </Typography>

              <Divider sx={{ width: "100%", mb: 2.5, opacity: 0.5 }} />

              <Stack spacing={2} sx={{ width: "100%" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <EmailIcon color="action" />
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Email Address
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {profileData?.email || user?.email || "Unknown"}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <BadgeIcon color="action" />
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Account ID
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight="medium"
                      sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                    >
                      {user?.uid || "Unknown"}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <BadgeIcon color="action" />
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Role
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight="medium"
                      sx={{ fontFamily: "monospace" }}
                    >
                      {profileData?.role || "Unknown"}
                    </Typography>
                  </Box>
                </Box>

                {currentMemberInfo?.personas &&
                  currentMemberInfo.personas.length > 0 && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <InfoIcon color="action" />
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          Personas (Active Workspace)
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {currentMemberInfo.personas
                            .map((p) => p.replace("_", " "))
                            .join(", ")}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                {currentMemberInfo?.personaNotes && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <InfoIcon color="action" />
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        Custom AI Instructions
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ whiteSpace: "pre-wrap" }}
                      >
                        {currentMemberInfo.personaNotes}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <InfoIcon color="action" />
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      App Version
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight="medium"
                      sx={{ fontFamily: "monospace" }}
                    >
                      {pkg.version}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <FingerprintIcon color="action" />
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Sign-In Method
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                      {profileData?.isGoogleAccount && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            bgcolor: (theme: Theme) =>
                              alpha(theme.palette.text.primary, 0.05),
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                          }}
                        >
                          <GoogleIcon fontSize="small" color="error" />
                          <Typography variant="caption">Google</Typography>
                        </Box>
                      )}
                      {profileData?.isAppleAccount && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            bgcolor: (theme: Theme) =>
                              alpha(theme.palette.text.primary, 0.05),
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                          }}
                        >
                          <AppleIcon fontSize="small" />
                          <Typography variant="caption">Apple</Typography>
                        </Box>
                      )}
                      {profileData?.isMicrosoftAccount && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            bgcolor: (theme: Theme) =>
                              alpha(theme.palette.text.primary, 0.05),
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                          }}
                        >
                          <MicrosoftIcon />
                          <Typography variant="caption">Microsoft</Typography>
                        </Box>
                      )}
                      {!profileData?.isGoogleAccount &&
                        !profileData?.isAppleAccount &&
                        !profileData?.isMicrosoftAccount && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              bgcolor: (theme: Theme) =>
                                alpha(theme.palette.text.primary, 0.05),
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                            }}
                          >
                            <EmailIcon fontSize="small" color="primary" />
                            <Typography variant="caption">
                              Email / Password
                            </Typography>
                          </Box>
                        )}
                    </Box>
                  </Box>
                </Box>
              </Stack>
            </Box>

            {/* Right column: color theme and account actions */}
            <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Box sx={{ width: "100%", mb: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    mb: 1.5,
                  }}
                >
                  <PaletteIcon color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Color Theme
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 1,
                  }}
                >
                  {THEME_PRESETS.map((preset) => {
                    const selected = preset.id === themeId;
                    return (
                      <ButtonBase
                        key={preset.id}
                        onClick={() => setThemeId(preset.id)}
                        aria-pressed={selected}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "stretch",
                          borderRadius: 2,
                          border: "2px solid",
                          borderColor: selected ? "primary.main" : "divider",
                          overflow: "hidden",
                        }}
                      >
                        {/* Preview: the preset background with its accent color */}
                        <Box
                          sx={{
                            height: 36,
                            bgcolor: preset.background,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {selected ? (
                            <CheckIcon
                              sx={{ fontSize: 18, color: preset.primary }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: 22,
                                height: 8,
                                borderRadius: 4,
                                bgcolor: preset.primary,
                              }}
                            />
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ py: 0.5, textAlign: "center" }}
                        >
                          {preset.name}
                        </Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
              </Box>

              {canUseDebugPanel && (
                <Button
                  variant="outlined"
                  color="inherit"
                  fullWidth
                  startIcon={<BugIcon />}
                  onClick={() => navigate("/debug")}
                  sx={{
                    mt: "auto",
                    py: 1.2,
                    mb: 1.5,
                    borderColor: (theme: Theme) =>
                      alpha(theme.palette.text.primary, 0.2),
                    color: "text.secondary",
                  }}
                >
                  Export Debug Logs
                </Button>
              )}

              <Button
                variant="outlined"
                color="error"
                fullWidth
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                // Keeps the buttons at the bottom when the debug button is hidden.
                sx={{ mt: canUseDebugPanel ? 0 : "auto", py: 1.2, mb: 1 }}
              >
                Sign Out Securely
              </Button>

              <Button
                variant="text"
                color="error"
                fullWidth
                onClick={() => setDeleteConfirmOpen(true)}
                sx={{
                  py: 1,
                  opacity: 0.8,
                  "&:hover": { opacity: 1 },
                  fontSize: "0.8rem",
                }}
              >
                Delete Account Permanently
              </Button>

              {/* Delete Confirmation Dialog */}
              <Dialog
                open={deleteConfirmOpen}
                onClose={() => !isDeleting && setDeleteConfirmOpen(false)}
                PaperProps={{
                  sx: {
                    bgcolor: "background.paper",
                    backgroundImage: "none",
                    borderRadius: 3,
                  },
                }}
              >
                <DialogTitle
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    color: "error.main",
                  }}
                >
                  <WarningIcon />
                  Delete Account
                </DialogTitle>
                <DialogContent>
                  <DialogContentText sx={{ color: "text.secondary" }}>
                    Are you absolutely sure you want to delete your account?
                    This action is <b>permanent</b> and cannot be undone. All
                    your transcripts, summaries, and data will be immediately
                    erased.
                  </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={isDeleting}
                    color="inherit"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteAccount}
                    color="error"
                    variant="contained"
                    disabled={isDeleting}
                    startIcon={
                      isDeleting ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : null
                    }
                  >
                    {isDeleting ? "Deleting..." : "Permanently Delete"}
                  </Button>
                </DialogActions>
              </Dialog>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default Profile;
