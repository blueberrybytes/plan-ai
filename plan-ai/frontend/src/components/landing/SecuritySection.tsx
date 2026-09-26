import React from "react";
import { Box, Button, Container, Grid, Typography, alpha, useTheme } from "@mui/material";
import {
  Dns as ServerIcon,
  Lock as LockIcon,
  LinkOff as LinkOffIcon,
  Key as KeyIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

const SECURITY_DOCS_URL = "https://docs.plan-ai.blueberrybytes.com/security/overview";

/**
 * What happens to a customer's meetings, in plain words. Every point here is
 * backed by the product as it ships; docs/src/security/overview.md has the
 * detail. Keep the two in step.
 */
const SecuritySection: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const points = [
    { key: "ownServers", icon: <ServerIcon /> },
    { key: "privateFiles", icon: <LockIcon /> },
    { key: "sharing", icon: <LinkOffIcon /> },
    { key: "ownKeys", icon: <KeyIcon /> },
  ];

  return (
    <Box id="security" sx={{ py: { xs: 8, md: 14 } }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: "center", mb: 8 }}>
          <Typography
            variant="h2"
            component="h2"
            sx={{ fontWeight: 700, mb: 2, fontSize: { xs: "1.75rem", md: "2.5rem" } }}
          >
            {t("landingPage.security.heading")}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 620, mx: "auto" }}>
            {t("landingPage.security.subheading")}
          </Typography>
        </Box>
        <Grid container spacing={3}>
          {points.map((point) => (
            <Grid item xs={12} sm={6} key={point.key}>
              <Box
                sx={{
                  p: 3.5,
                  height: "100%",
                  display: "flex",
                  gap: 2.5,
                  borderRadius: "16px",
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: "background.paper",
                }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: 48,
                    height: 48,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "primary.main",
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                  }}
                >
                  {point.icon}
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                    {t(`landingPage.security.points.${point.key}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {t(`landingPage.security.points.${point.key}.description`)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ textAlign: "center", mt: 5 }}>
          <Button
            href={SECURITY_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<ArrowForwardIcon />}
            sx={{ fontWeight: 600 }}
          >
            {t("landingPage.security.cta")}
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SecuritySection;
