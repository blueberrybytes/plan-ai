import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Container, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Home as HomeIcon } from "@mui/icons-material";

const NotFound: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("notFound.title")} | Plan AI</title>
      </Helmet>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.default",
          p: 3,
        }}
      >
        <Container maxWidth="sm" sx={{ textAlign: "center" }}>
          <Typography variant="h1" sx={{ fontWeight: 800, color: "primary.main", mb: 2 }}>
            404
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            {t("notFound.heading")}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontSize: "1.1rem" }}>
            {t("notFound.description")}
          </Typography>
          <Button
            component={RouterLink}
            to="/"
            variant="contained"
            size="large"
            startIcon={<HomeIcon />}
            sx={{ px: 4, py: 1.5, borderRadius: 2 }}
          >
            {t("notFound.backToHome")}
          </Button>
        </Container>
      </Box>
    </>
  );
};

export default NotFound;
