import React from "react";
import { Box, Button, Typography, Paper } from "@mui/material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { clientLogger } from "../utils/clientLogger";

const SentryTest: React.FC = () => {
  const handleClientLoggerError = () => {
    clientLogger.error(
      "Test error from /sentry-error via clientLogger",
      new Error("ClientLogger Manual Test Error"),
    );
  };

  const handleRuntimeError = () => {
    // Intentionally cause a runtime error
    throw new Error("Test runtime error from /sentry-error (Uncaught Exception)");
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: 4, maxWidth: 800, margin: "0 auto", width: "100%" }}>
        <Typography variant="h4" gutterBottom>
          Sentry Integration Test
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Use the buttons below to intentionally trigger errors. You should verify that these errors
          appear in your Sentry dashboard.
        </Typography>

        <Paper sx={{ p: 3, display: "flex", flexDirection: "column", gap: 3 }}>
          <Box>
            <Typography variant="h6" gutterBottom>
              1. Handled Error (clientLogger)
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This tests our custom integration where `clientLogger.error()` captures and forwards
              the error explicitly to Sentry. The app goes on working perfectly.
            </Typography>
            <Button variant="contained" color="warning" onClick={handleClientLoggerError}>
              Trigger clientLogger Error
            </Button>
          </Box>

          <Box>
            <Typography variant="h6" gutterBottom>
              2. Unhandled Runtime Crash
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This simulates an unexpected crash during rendering or an event hook. It should be
              caught by Sentry&apos;s automated global listener and your React ErrorBoundary.
            </Typography>
            <Button variant="contained" color="error" onClick={handleRuntimeError}>
              Trigger Runtime Crash
            </Button>
          </Box>
        </Paper>
      </Box>
    </SidebarLayout>
  );
};

export default SentryTest;
