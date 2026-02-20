import React, { useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  Article as TranscriptIcon,
  Dashboard as BoardIcon,
  Slideshow as SlideshowIcon,
  Chat as ChatIcon,
  ArrowForward as ArrowForwardIcon,
  CheckCircleOutline as CheckIcon,
  Bolt as BoltIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { useTranslation } from "react-i18next";

export default function LandingPage() {
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

  const currentYear = new Date().getFullYear();

  if (user) {
    return null;
  }

  const features = [
    {
      icon: <TranscriptIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.transcript.title"),
      description: t("landingPage.features.items.transcript.description"),
      color: "#4361EE",
    },
    {
      icon: <AutoAwesomeIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.tasks.title"),
      description: t("landingPage.features.items.tasks.description"),
      color: "#a78bfa",
    },
    {
      icon: <BoardIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.boards.title"),
      description: t("landingPage.features.items.boards.description"),
      color: "#10B981",
    },
    {
      icon: <SlideshowIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.slides.title"),
      description: t("landingPage.features.items.slides.description"),
      color: "#F59E0B",
    },
    {
      icon: <ChatIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.chat.title"),
      description: t("landingPage.features.items.chat.description"),
      color: "#3B82F6",
    },
    {
      icon: <BoltIcon sx={{ fontSize: 28 }} />,
      title: t("landingPage.features.items.insights.title"),
      description: t("landingPage.features.items.insights.description"),
      color: "#EF4444",
    },
  ];

  const stats = [
    { value: "10×", label: t("landingPage.stats.faster") },
    { value: "100%", label: t("landingPage.stats.aiPowered") },
    { value: "0", label: t("landingPage.stats.manualWork") },
  ];

  const checklistItems = [
    t("landingPage.checklist.noSetup"),
    t("landingPage.checklist.googleLogin"),
    t("landingPage.checklist.freeTier"),
    t("landingPage.checklist.allInOne"),
  ];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0b0d11", overflow: "hidden" }}>
      {/* Header */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          bgcolor: "rgba(11, 13, 17, 0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          py: 1.5,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <img src={logoSrc} alt={logoAlt} style={{ height: "32px" }} />
              <Typography
                variant="h6"
                component="span"
                sx={{ fontWeight: 700, display: { xs: "none", sm: "block" } }}
              >
                {productName}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Button component={RouterLink} to="/login" variant="outlined" size="small">
                {t("landingPage.header.signIn")}
              </Button>
              <Button component={RouterLink} to="/signup" variant="contained" size="small">
                {t("landingPage.header.signUp")}
              </Button>
              <FormControl size="small" sx={{ minWidth: 110 }}>
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
      <Box
        sx={{
          position: "relative",
          pt: { xs: 10, md: 16 },
          pb: { xs: 8, md: 14 },
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "-30%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "900px",
            height: "900px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(67,97,238,0.18) 0%, rgba(167,139,250,0.10) 40%, transparent 70%)",
            pointerEvents: "none",
          },
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: "center" }}>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: "14px !important" }} />}
              label={t("landingPage.hero.badge")}
              size="small"
              sx={{
                mb: 3,
                bgcolor: "rgba(167,139,250,0.12)",
                color: "#a78bfa",
                border: "1px solid rgba(167,139,250,0.25)",
                fontWeight: 600,
                fontSize: "0.75rem",
              }}
            />
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "2.5rem", sm: "3.5rem", md: "4.25rem" },
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                mb: 3,
                background: "linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #4361EE 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {t("landingPage.hero.title")}
            </Typography>
            <Typography
              sx={{
                color: "#94a3b8",
                maxWidth: "620px",
                mx: "auto",
                mb: 5,
                fontWeight: 400,
                lineHeight: 1.7,
                fontSize: { xs: "1rem", md: "1.2rem" },
              }}
            >
              {t("landingPage.hero.subtitle")}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
              <Button
                component={RouterLink}
                to="/signup"
                variant="contained"
                size="large"
                endIcon={<ArrowForwardIcon />}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: "1rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #4361EE 0%, #a78bfa 100%)",
                  boxShadow: "0 0 32px rgba(67,97,238,0.4)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #5472f5 0%, #b89ffc 100%)",
                    boxShadow: "0 0 48px rgba(67,97,238,0.6)",
                    transform: "translateY(-2px)",
                  },
                }}
              >
                {t("landingPage.hero.cta")}
              </Button>
              <Button
                component={RouterLink}
                to="/login"
                variant="outlined"
                size="large"
                sx={{ px: 4, py: 1.5, fontSize: "1rem" }}
              >
                {t("landingPage.hero.ctaSecondary")}
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Stats Bar */}
      <Box
        sx={{
          py: 5,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          bgcolor: "rgba(22,25,32,0.5)",
        }}
      >
        <Container maxWidth="md">
          <Grid container spacing={2} justifyContent="center">
            {stats.map((stat, i) => (
              <Grid item xs={4} key={i} sx={{ textAlign: "center" }}>
                <Typography
                  sx={{
                    fontSize: { xs: "2rem", md: "2.75rem" },
                    fontWeight: 800,
                    background: "linear-gradient(135deg, #4361EE, #a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    lineHeight: 1,
                    mb: 0.5,
                  }}
                >
                  {stat.value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {stat.label}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Features Grid */}
      <Box sx={{ py: { xs: 8, md: 14 } }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 8 }}>
            <Typography
              variant="h2"
              component="h2"
              sx={{ fontWeight: 700, mb: 2, fontSize: { xs: "1.75rem", md: "2.5rem" } }}
            >
              {t("landingPage.features.heading")}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520, mx: "auto" }}>
              {t("landingPage.features.subheading")}
            </Typography>
          </Box>
          <Grid container spacing={3}>
            {features.map((feature, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Box
                  sx={{
                    p: 3.5,
                    height: "100%",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    bgcolor: "rgba(22,25,32,0.6)",
                    backdropFilter: "blur(8px)",
                    transition: "all 0.3s ease",
                    cursor: "default",
                    "&:hover": {
                      borderColor: `${feature.color}40`,
                      bgcolor: "rgba(22,25,32,0.9)",
                      transform: "translateY(-4px)",
                      boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 0 1px ${feature.color}25`,
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      borderRadius: "14px",
                      bgcolor: `${feature.color}18`,
                      border: `1px solid ${feature.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: feature.color,
                      mb: 2.5,
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: "#f1f5f9" }}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {feature.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* How it works */}
      <Box
        sx={{
          py: { xs: 8, md: 14 },
          bgcolor: "rgba(22,25,32,0.4)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 8 }}>
            <Typography
              variant="h2"
              component="h2"
              sx={{ fontWeight: 700, mb: 2, fontSize: { xs: "1.75rem", md: "2.5rem" } }}
            >
              {t("landingPage.howItWorks.heading")}
            </Typography>
          </Box>
          <Grid container spacing={4} justifyContent="center">
            {[1, 2, 3].map((step) => (
              <Grid item xs={12} md={4} key={step}>
                <Box sx={{ textAlign: "center", px: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #4361EE, #a78bfa)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mx: "auto",
                      mb: 2.5,
                      fontSize: "1.25rem",
                      fontWeight: 800,
                      color: "#fff",
                      boxShadow: "0 0 24px rgba(67,97,238,0.4)",
                    }}
                  >
                    {step}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                    {t(`landingPage.howItWorks.steps.${step}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {t(`landingPage.howItWorks.steps.${step}.description`)}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 10, md: 16 }, position: "relative", overflow: "hidden" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(67,97,238,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <Container maxWidth="md">
          <Box
            sx={{
              textAlign: "center",
              p: { xs: 4, md: 7 },
              borderRadius: "24px",
              border: "1px solid rgba(67,97,238,0.25)",
              bgcolor: "rgba(22,25,32,0.7)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 0 80px rgba(67,97,238,0.12)",
            }}
          >
            <GroupsIcon sx={{ fontSize: 44, color: "#a78bfa", mb: 2 }} />
            <Typography
              variant="h2"
              sx={{ fontWeight: 800, mb: 2, fontSize: { xs: "1.75rem", md: "2.25rem" } }}
            >
              {t("landingPage.cta.title")}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 480, mx: "auto" }}
            >
              {t("landingPage.cta.subtitle")}
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                justifyContent: "center",
                mb: 4,
              }}
            >
              {checklistItems.map((item, i) => (
                <Box
                  key={i}
                  sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "#94a3b8" }}
                >
                  <CheckIcon sx={{ fontSize: 16, color: "#10B981" }} />
                  <Typography variant="body2">{item}</Typography>
                </Box>
              ))}
            </Box>
            <Button
              component={RouterLink}
              to="/signup"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              sx={{
                px: 5,
                py: 1.75,
                fontSize: "1.05rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #4361EE 0%, #a78bfa 100%)",
                boxShadow: "0 0 32px rgba(67,97,238,0.45)",
                "&:hover": {
                  background: "linear-gradient(135deg, #5472f5 0%, #b89ffc 100%)",
                  boxShadow: "0 0 48px rgba(67,97,238,0.65)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              {t("landingPage.cta.button")}
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          py: 4,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          bgcolor: "rgba(11,13,17,0.8)",
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {t("landingPage.footer.copyright", { year: currentYear, productName })}
            </Typography>
            <Box sx={{ display: "flex", gap: 3 }}>
              {[
                { to: "/privacy-policy", label: t("landingPage.footer.privacy") },
                { to: "/terms-of-service", label: t("landingPage.footer.terms") },
                { to: "/delete-my-data", label: t("landingPage.footer.dataDeletion") },
              ].map((link) => (
                <RouterLink
                  key={link.to}
                  to={link.to}
                  style={{ color: "#64748b", textDecoration: "none", fontSize: "0.875rem" }}
                >
                  {link.label}
                </RouterLink>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
