import React from "react";
import { Box, Typography, Button, Container, Card, CircularProgress } from "@mui/material";
import {
  HourglassEmpty as HourglassIcon,
  Mail as MailIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { logout } from "../store/slices/auth/authSlice";
import { useGetCurrentUserQuery } from "../store/apis/authApi";
import * as Sentry from "@sentry/react";

const PendingReview: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  // Refetching the user state will cause App.tsx to update userDb, moving the route if approved
  const { refetch, isFetching } = useGetCurrentUserQuery();

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleRefresh = async () => {
    try {
      const result = await refetch();
      if (result.isError) {
        console.warn("[PendingReview] Refetch resulted in error:", result.error);
        Sentry.captureMessage("PendingReview manual refetch failed to get valid user context", {
          level: "warning",
          extra: { error: result.error },
        });
      }
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#0b0d11",
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Card
          sx={{
            p: { xs: 4, md: 6 },
            textAlign: "center",
            bgcolor: "rgba(22,25,32,0.8)",
            border: "1px solid rgba(167,139,250,0.2)",
            borderRadius: "24px",
            boxShadow: "0 0 80px rgba(67,97,238,0.1)",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              bgcolor: "rgba(167,139,250,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 4,
            }}
          >
            <HourglassIcon sx={{ fontSize: 40, color: "#a78bfa" }} />
          </Box>

          <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: "#f8fafc" }}>
            {t("pending.title")}
          </Typography>

          <Typography variant="body1" sx={{ color: "#94a3b8", mb: 4, lineHeight: 1.7 }}>
            {t("pending.description")}
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
            <Button
              variant="contained"
              onClick={handleRefresh}
              disabled={isFetching}
              startIcon={
                isFetching ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />
              }
              sx={{
                px: 4,
                py: 1.5,
                background: "linear-gradient(135deg, #4361EE 0%, #a78bfa 100%)",
                fontWeight: 600,
                width: "100%",
                maxWidth: 240,
                "&:hover": {
                  background: "linear-gradient(135deg, #5472f5 0%, #b89ffc 100%)",
                },
              }}
            >
              Refresh Status
            </Button>

            <Button
              variant="outlined"
              href="mailto:projects@blueberrybytes.com"
              startIcon={<MailIcon />}
              sx={{
                px: 4,
                py: 1.5,
                fontWeight: 600,
                width: "100%",
                maxWidth: 240,
                borderColor: "rgba(167,139,250,0.5)",
                color: "#a78bfa",
                fontSize: "0.8rem",
                "&:hover": {
                  borderColor: "#a78bfa",
                  bgcolor: "rgba(167,139,250,0.05)",
                },
              }}
            >
              projects@blueberrybytes.com
            </Button>

            <Button
              variant="text"
              onClick={handleLogout}
              sx={{ color: "#64748b", "&:hover": { color: "#f8fafc" }, mt: 1 }}
            >
              {t("pending.logout")}
            </Button>
          </Box>
        </Card>
      </Container>
    </Box>
  );
};

export default PendingReview;
