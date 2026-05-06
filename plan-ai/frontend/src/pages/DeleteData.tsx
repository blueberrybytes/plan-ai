import React from "react";
import { Container, Box, Typography, Button, Paper } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

export default function DeleteData() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { productName, companyName, logoSrc, logoAlt } = useBrandIdentity();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          py: 2,
          px: 3,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <RouterLink to="/" style={{ textDecoration: "none" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <img src={logoSrc} alt={logoAlt} style={{ height: "32px" }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
              {productName}
            </Typography>
          </Box>
        </RouterLink>
      </Box>

      <Container maxWidth="md" sx={{ py: 8, flexGrow: 1 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: "24px",
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.paper,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "12px",
                bgcolor: "error.main",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
              }}
            >
              <DeleteForeverIcon fontSize="medium" />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {t("landingPage.footer.dataDeletion", "Data Deletion")}
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ color: "text.secondary", mb: 4, lineHeight: 1.7 }}>
            At <strong>{companyName}</strong>, we respect your privacy and give you full control
            over your data.
          </Typography>

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            How to delete your account & data
          </Typography>

          <Typography variant="body1" sx={{ color: "text.secondary", mb: 3, lineHeight: 1.7 }}>
            The fastest and most transparent way to delete all your account data, transcripts, and
            personal information is directly inside the <strong>{productName}</strong> app:
          </Typography>

          <Box
            component="ol"
            sx={{
              color: "text.secondary",
              mb: 5,
              "& li": { mb: 1, lineHeight: 1.7 },
            }}
          >
            <li>
              Log in to your <strong>{productName}</strong> account.
            </li>
            <li>Click on your avatar in the top right corner to access your settings.</li>
            <li>
              Select <strong>Profile</strong>.
            </li>
            <li>
              Scroll to the bottom of the page and click <strong>Delete Account</strong>.
            </li>
            <li>Confirm your action. Your data will be permanently purged from our servers.</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Manual Requests
          </Typography>

          <Typography variant="body1" sx={{ color: "text.secondary", mb: 3, lineHeight: 1.7 }}>
            If you no longer have access to your account or prefer us to manually process your data
            deletion, please send an email from your registered account address to{" "}
            <strong>projects@blueberrybytes.com</strong> with the
            subject line <em>&quot;Data Deletion Request&quot;</em>.
          </Typography>

          <Box sx={{ mt: 6, display: "flex", gap: 2 }}>
            <Button
              component={RouterLink}
              to="/login"
              variant="contained"
              size="large"
              color="primary"
            >
              Log In to Delete Data
            </Button>
            <Button component={RouterLink} to="/" variant="outlined" size="large">
              Back to Home
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
