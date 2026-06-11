import React, { useState } from "react";
import { Box, Typography, Button, CircularProgress } from "@mui/material";
import { useAuth } from "../hooks/useAuth";

const WEB_APP_URL = import.meta.env.VITE_PLAN_AI_WEB_URL || "http://localhost:3000";

const Pending: React.FC = () => {
  const { signOut, refetchDbUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchDbUser();
    setRefreshing(false);
  };

  const handleOpenOnboarding = () => {
    window.electron?.openExternalUrl?.(`${WEB_APP_URL}/onboarding`) ??
      window.open(`${WEB_APP_URL}/onboarding`, "_blank");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        bgcolor: "background.default",
        p: 4,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" sx={{ mb: 2, fontWeight: "bold" }}>
        Complete Your Setup
      </Typography>
      <Typography
        variant="body1"
        sx={{ color: "text.secondary", mb: 1, maxWidth: 400 }}
      >
        To use the Desktop Recorder, please complete your account setup on the
        web app first.
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", mb: 4, maxWidth: 400 }}
      >
        You&apos;ll choose your workspace name and preferences, then come back
        here.
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          width: "100%",
          maxWidth: 240,
        }}
      >
        <Button
          variant="contained"
          onClick={handleOpenOnboarding}
        >
          Open Web Onboarding
        </Button>

        <Button
          variant="outlined"
          onClick={handleRefresh}
          disabled={refreshing}
          startIcon={
            refreshing ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          {refreshing ? "Checking..." : "I've Completed Setup"}
        </Button>

        <Button variant="text" color="inherit" onClick={signOut} sx={{ mt: 1 }}>
          Logout
        </Button>
      </Box>
    </Box>
  );
};

export default Pending;
