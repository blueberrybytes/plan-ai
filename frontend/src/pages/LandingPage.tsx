import React, { useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Typography,
  Paper,
  Link,
  useTheme,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import {
  Article as TranscriptIcon,
  AutoAwesome as AutomationIcon,
  Dashboard as BoardIcon,
  Insights as InsightsIcon,
} from "@mui/icons-material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/session/sessionSelector";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { useTranslation } from "react-i18next";

export default function LandingPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { logoSrc, logoAlt, productName } = useBrandIdentity();
  const { t, i18n } = useTranslation();

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

  useEffect(() => {
    if (user) {
      navigate("/home");
    }
  }, [user, navigate]);

  const features = useMemo(
    () => [
      {
        key: "transcript",
        icon: <TranscriptIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />,
      },
      {
        key: "tasks",
        icon: <AutomationIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />,
      },
      {
        key: "boards",
        icon: <BoardIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />,
      },
      {
        key: "insights",
        icon: <InsightsIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />,
      },
    ],
    [theme.palette.primary.main],
  );

  const currentYear = new Date().getFullYear();

  // If user is authenticated, don't render the landing page
  if (user) {
    return null;
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Header */}
      <Box sx={{ bgcolor: "background.paper", py: 2, boxShadow: 1 }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <img src={logoSrc} alt={logoAlt} style={{ height: "32px" }} />
              <Typography
                variant="h3"
                component="span"
                sx={{
                  ml: 2,
                  fontWeight: 600,
                  display: { xs: "none", sm: "block" },
                }}
              >
                {productName}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                component={RouterLink}
                to="/login"
                variant="contained"
                color="primary"
                sx={{ mr: 2 }}
              >
                {t("landingPage.header.signIn")}
              </Button>
              <Button component={RouterLink} to="/signup" variant="outlined" color="primary">
                {t("landingPage.header.signUp")}
              </Button>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="landing-language-label">{t("profile.language.label")}</InputLabel>
                <Select
                  labelId="landing-language-label"
                  value={selectedLanguage}
                  label={t("profile.language.label")}
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
          </Box>
        </Container>
      </Box>

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="h2" component="h1" gutterBottom>
              {t("landingPage.hero.title")}
            </Typography>
            <Typography variant="h5" color="text.secondary" paragraph>
              {t("landingPage.hero.subtitle")}
            </Typography>
            <Button
              component={RouterLink}
              to="/signup"
              variant="contained"
              color="primary"
              size="large"
              sx={{ mt: 2 }}
            >
              {t("landingPage.hero.cta")}
            </Button>
          </Grid>
          <Grid item xs={12} md={6}>
            <img src={logoSrc} alt={logoAlt} style={{ width: "100%", maxWidth: "320px" }} />
          </Grid>
        </Grid>
      </Container>

      {/* Features Section */}
      <Box sx={{ bgcolor: "background.paper", py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h3" component="h2" align="center" gutterBottom>
            {t("landingPage.features.heading")}
          </Typography>
          <Grid container spacing={4} sx={{ mt: 4 }}>
            {features.map((feature) => (
              <Grid item xs={12} sm={6} md={3} key={feature.key}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  {feature.icon}
                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                    {t(`landingPage.features.items.${feature.key}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(`landingPage.features.items.${feature.key}.description`)}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: "background.paper", py: 4, mt: 4 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="text.secondary">
                {t("landingPage.footer.copyright", {
                  year: currentYear,
                  productName,
                })}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} mb={3}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <Link
                  component={RouterLink}
                  to="/privacy-policy"
                  color="text.secondary"
                  sx={{ textDecoration: "none" }}
                >
                  {t("landingPage.footer.privacy")}
                </Link>
                <Link
                  component={RouterLink}
                  to="/delete-my-data"
                  color="text.secondary"
                  sx={{ textDecoration: "none" }}
                >
                  {t("landingPage.footer.dataDeletion")}
                </Link>
                <Link
                  component={RouterLink}
                  to="/terms-of-service"
                  color="text.secondary"
                  sx={{ textDecoration: "none" }}
                >
                  {t("landingPage.footer.terms")}
                </Link>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
