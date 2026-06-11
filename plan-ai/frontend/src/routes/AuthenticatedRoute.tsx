import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Box, CircularProgress } from "@mui/material";
import { selectUser } from "../store/slices/auth/authSelector";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { useGetCurrentUserQuery } from "../store/apis/authApi";
import * as Sentry from "@sentry/react";

const AuthenticatedRoute: React.FC = () => {
  const user = useSelector(selectUser);
  const location = useLocation();
  const { isAuthInitialized } = useAuth();

  // Always query fresh user data — routing decisions must never rely on stale persist values
  const {
    data: currentUserData,
    isLoading,
    isUninitialized,
    isFetching,
    isError,
  } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthInitialized || !user,
  });

  if (!user || !user.emailVerified) {
    return <Navigate to="/" replace />;
  }

  // Spinner while Firebase is initializing or the user profile hasn't arrived yet
  if (
    !isAuthInitialized ||
    isLoading ||
    isUninitialized ||
    (!currentUserData && (isFetching || isError))
  ) {
    if (isError && !isFetching) {
      console.warn("[AuthRoute] Trapped in retry wrapper due to backend error consistency problem");
      Sentry.captureMessage(
        "AuthRoute spinning due to missing currentUserData and active isError state. Backend sync failed.",
        { level: "error" },
      );
    }

    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const role = currentUserData?.data?.role;
  const hasCompletedOnboarding = currentUserData?.data?.hasCompletedOnboarding === true;
  const isPending = role === "PENDING";

  // ANY ROLE + hasn't completed onboarding → wizard
  if (!hasCompletedOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // Approved users cannot revisit onboarding
  if (hasCompletedOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
};

export default AuthenticatedRoute;
