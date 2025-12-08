import React from "react";
import { FallbackProps } from "react-error-boundary";
import { Box, Typography, Button, Container } from "@mui/material";
import { useTranslation } from "react-i18next";

const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const { t } = useTranslation();

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="50vh"
        textAlign="center"
        p={4}
        borderRadius={2}
        boxShadow={3}
        bgcolor="background.paper"
      >
        <Typography variant="h5" color="error" gutterBottom>
          {t("errorFallback.title")}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {error.message}
        </Typography>
        <Button variant="contained" color="primary" onClick={resetErrorBoundary} sx={{ mt: 2 }}>
          {t("errorFallback.reload")}
        </Button>
      </Box>
    </Container>
  );
};

export default ErrorFallback;
