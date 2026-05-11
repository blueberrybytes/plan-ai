import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
  CircularProgress,
  Card,
  CardActionArea,
  alpha,
  Link,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGetMyWorkspacesQuery, workspaceApi } from "../store/apis/workspaceApi";
import {
  useCompleteOnboardingMutation,
  CustomThemePayload,
  BrandThemePayload,
} from "../store/apis/onboardingApi";
import { setToastMessage } from "../store/slices/app/appSlice";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { getAppThemePresets } from "../utils/appThemes";
import { selectUserDb } from "../store/slices/auth/authSelector";
import { setUserDb } from "../store/slices/auth/authSlice";
import { authApi } from "../store/apis/authApi";
import * as Sentry from "@sentry/react";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";

const Onboarding: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userDb = useSelector(selectUserDb);

  const { brandKey } = useBrandIdentity();
  const uiThemeOptions = getAppThemePresets(brandKey);

  // APIs
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useGetMyWorkspacesQuery();
  const [completeOnboarding, { isLoading: isSubmitting }] = useCompleteOnboardingMutation();

  // State
  const [step, setStep] = useState<number>(0); // 0 = Checking, 1 = UI Theme, 2 = Workspace & Brand (if uninvited)
  const [isInvited, setIsInvited] = useState<boolean>(false);
  const [selectedUiTheme, setSelectedUiTheme] = useState<string>(uiThemeOptions[0].id);
  const [selectedBrandTheme, setSelectedBrandTheme] = useState<string>(uiThemeOptions[0].id);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [openRouterKey, setOpenRouterKey] = useState<string>("");
  const [deepgramKey, setDeepgramKey] = useState<string>("");

  useEffect(() => {
    if (!isLoadingWorkspaces) {
      const invited = workspaces && workspaces.length > 0;
      setIsInvited(!!invited);
      setStep(1); // Proceed to first user step
    }
  }, [isLoadingWorkspaces, workspaces]);

  const handleNext = () => {
    if (isInvited) {
      // Invited users only do step 1, skip straight to complete
      submitOnboarding();
    } else {
      if (step === 1) setStep(2);
      else submitOnboarding();
    }
  };

  const submitOnboarding = async () => {
    try {
      if (!isInvited && !workspaceName.trim()) {
        dispatch(setToastMessage({ message: "Workspace name is required", severity: "error" }));
        return; // Workspace name required for uninvited
      }

      const selectedTheme =
        uiThemeOptions.find((t) => t.id === selectedUiTheme) || uiThemeOptions[0];
      const selectedUiPayload: CustomThemePayload = {
        primaryColor: selectedTheme.primaryColor,
        secondaryColor: selectedTheme.secondaryColor,
        backgroundColor: selectedTheme.backgroundColor,
        surfaceColor: selectedTheme.surfaceColor,
        textPrimaryColor:
          selectedTheme.textPrimaryColor || (selectedTheme.isLight ? "#0f172a" : "#f8fafc"),
        textSecondaryColor: selectedTheme.textSecondaryColor,
        borderRadius: selectedTheme.borderRadius,
      };
      const selectedBrandThemePreset =
        uiThemeOptions.find((t) => t.id === selectedBrandTheme) || uiThemeOptions[0];
      const selectedBrandPayload: BrandThemePayload = {
        name: t(selectedBrandThemePreset.nameKey),
        primaryColor: selectedBrandThemePreset.primaryColor,
        secondaryColor:
          selectedBrandThemePreset.secondaryColor || selectedBrandThemePreset.primaryColor,
        backgroundColor: selectedBrandThemePreset.backgroundColor,
        textColor:
          selectedBrandThemePreset.textPrimaryColor ||
          (selectedBrandThemePreset.isLight ? "#0f172a" : "#f8fafc"),
        headingFont: "Inter",
        bodyFont: "Inter",
      };

      await completeOnboarding({
        uiTheme: selectedUiPayload as CustomThemePayload,
        workspaceName: isInvited ? undefined : workspaceName,
        brandTheme: isInvited ? undefined : selectedBrandPayload,
        openRouterKey: isInvited ? undefined : openRouterKey,
        deepgramKey: isInvited ? undefined : deepgramKey,
      }).unwrap();

      // Mark onboarding complete locally
      if (userDb) {
        dispatch(setUserDb({ ...userDb, hasCompletedOnboarding: true }));
      }

      // Reset both caches: workspace so the switcher picks up the new workspace,
      // and authApi so App.tsx refetches getCurrentUser and doesn't overwrite
      // hasCompletedOnboarding with the stale cached value (false).
      dispatch(workspaceApi.util.resetApiState());
      dispatch(authApi.util.resetApiState());

      navigate("/", { replace: true });
    } catch (error) {
      console.error("[Onboarding] Failed onboarding", error);
      Sentry.captureException(error, {
        extra: { workspaceName, selectedUiTheme, selectedBrandTheme },
      });
      dispatch(setToastMessage({ message: "Failed to complete setup", severity: "error" }));
    }
  };

  const selectedTheme = uiThemeOptions.find((t) => t.id === selectedUiTheme) || uiThemeOptions[0];

  const previewTheme = React.useMemo(() => {
    const isLightMode = selectedTheme.isLight === true;
    return createTheme({
      palette: {
        mode: isLightMode ? "light" : "dark",
        primary: { main: selectedTheme.primaryColor },
        secondary: { main: selectedTheme.secondaryColor || selectedTheme.primaryColor },
        background: {
          default: selectedTheme.backgroundColor,
          paper: selectedTheme.surfaceColor,
        },
        text: {
          primary: selectedTheme.textPrimaryColor || (isLightMode ? "#0f172a" : "#f8fafc"),
          secondary: selectedTheme.textSecondaryColor || (isLightMode ? "#475569" : "#94a3b8"),
        },
      },
      shape: {
        borderRadius: selectedTheme.borderRadius,
      },
    });
  }, [selectedTheme]);

  if (step === 0 || isLoadingWorkspaces) {
    return (
      <Box
        sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={previewTheme}>
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          transition: "background-color 0.3s ease",
          color: "text.primary",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 5,
            maxWidth: 600,
            width: "100%",
            borderRadius: 4,
            border: "1px solid rgba(128,128,128,0.1)",
            transition: "all 0.3s ease",
            bgcolor: "background.paper",
            color: "text.primary",
          }}
        >
          {step === 1 && (
            <Box>
              <Typography variant="h4" fontWeight={700} mb={1}>
                {t("onboarding.welcome", { defaultValue: "Welcome to Plan AI!" })}
              </Typography>
              <Typography color="text.secondary" mb={4}>
                {isInvited
                  ? t("onboarding.invitedSubtitle", {
                      defaultValue:
                        "You've been invited to join a team. Let's set up your personal workspace aesthetics.",
                    })
                  : t("onboarding.uiSubtitle", {
                      defaultValue: "How do you want your dashboard to look?",
                    })}
              </Typography>

              <Grid container spacing={3} mb={5}>
                {uiThemeOptions.map((theme) => (
                  <Grid item xs={12} sm={6} key={theme.id}>
                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 3,
                        border:
                          selectedUiTheme === theme.id ? "2px solid" : "2px solid transparent",
                        borderColor: selectedUiTheme === theme.id ? "primary.main" : "divider",
                        bgcolor: "background.paper",
                      }}
                    >
                      <CardActionArea onClick={() => setSelectedUiTheme(theme.id)} sx={{ p: 2 }}>
                        <Typography variant="subtitle1" fontWeight={600} mb={1}>
                          {t(theme.nameKey)}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              bgcolor: theme.primaryColor,
                            }}
                          />
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              bgcolor: theme.backgroundColor,
                              border: "1px solid rgba(128,128,128,0.2)",
                            }}
                          />
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              bgcolor: theme.surfaceColor,
                              border: "1px solid rgba(128,128,128,0.2)",
                            }}
                          />
                        </Box>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={handleNext}
                sx={{ borderRadius: "12px", py: 1.5 }}
              >
                {isInvited
                  ? t("onboarding.finish", { defaultValue: "Complete Setup" })
                  : t("common.continue", { defaultValue: "Continue" })}
              </Button>
            </Box>
          )}

          {step === 2 && !isInvited && (
            <Box>
              <Typography variant="h4" fontWeight={700} mb={1}>
                {t("onboarding.teamSetup", { defaultValue: "Create your Workspace" })}
              </Typography>
              <Typography color="text.secondary" mb={4}>
                {t("onboarding.teamSubtitle", {
                  defaultValue:
                    "Name your workspace and choose the branding style for your generated presentations.",
                })}
              </Typography>

              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Workspace Name
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="e.g. Acme Corp"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                OpenRouter API Key (Required){" "}
                <Link href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" sx={{ fontSize: '0.85em', ml: 1 }}>
                  Get your key
                </Link>
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="sk-or-v1-..."
                type="password"
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Deepgram API Key (Required){" "}
                <Link href="https://console.deepgram.com/api-keys" target="_blank" rel="noopener noreferrer" sx={{ fontSize: '0.85em', ml: 1 }}>
                  Get your key
                </Link>
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Your deepgram key..."
                type="password"
                value={deepgramKey}
                onChange={(e) => setDeepgramKey(e.target.value)}
                sx={{ mb: 4 }}
              />

              <Typography variant="subtitle2" fontWeight={600} mb={2}>
                Presentation Brand Identity
              </Typography>
              <Grid container spacing={2} mb={5}>
                {uiThemeOptions.map((theme) => {
                  return (
                    <Grid item xs={12} sm={6} key={`brand-${theme.id}`}>
                      <Card
                        elevation={0}
                        sx={{
                          borderRadius: 3,
                          border:
                            selectedBrandTheme === theme.id ? "2px solid" : "2px solid transparent",
                          borderColor:
                            selectedBrandTheme === theme.id ? theme.primaryColor : "divider",
                          bgcolor: alpha(theme.primaryColor, 0.05),
                        }}
                      >
                        <CardActionArea
                          onClick={() => setSelectedBrandTheme(theme.id)}
                          sx={{
                            p: 2,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "stretch",
                            gap: 1.5,
                          }}
                        >
                          <Typography
                            variant="subtitle1"
                            fontWeight={600}
                            color={theme.primaryColor}
                          >
                            {t(theme.nameKey)}
                          </Typography>

                          {/* Generative Document / Slide Preview Box */}
                          <Box
                            sx={{
                              aspectRatio: "16/9",
                              backgroundColor: theme.surfaceColor || theme.backgroundColor,
                              borderRadius: 1,
                              border: `1px solid rgba(128,128,128,0.2)`,
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <SlideRenderer
                              typeKey={SLIDE_TYPES[0].key}
                              data={{
                                title: t(theme.nameKey),
                                subtitle: "Brand aesthetic preview",
                                iconName: "Palette",
                              }}
                              brandColors={{
                                primary: theme.primaryColor,
                                secondary: theme.secondaryColor || theme.primaryColor,
                                background: theme.backgroundColor,
                                backgroundStyle: "solid",
                                cardStyle: "flat",
                              }}
                              scale={0.28}
                            />
                          </Box>
                        </CardActionArea>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>

              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={handleNext}
                disabled={isSubmitting || !workspaceName.trim() || !openRouterKey.trim() || !deepgramKey.trim()}
                sx={{ borderRadius: "12px", py: 1.5 }}
              >
                {isSubmitting ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t("onboarding.finish", { defaultValue: "Complete Setup" })
                )}
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  );
};

export default Onboarding;
