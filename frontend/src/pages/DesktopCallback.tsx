import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Typography, Alert, Stack } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { auth } from "../firebase/firebase";
import { useGetDesktopTokenQuery } from "../store/apis/sessionApi";

/**
 * /auth/desktop — opened by the Plan AI Recorder (Electron app) via shell.openExternal().
 *
 * Flow:
 *  1. User clicks "Sign in with Google" in the Electron app.
 *  2. Electron opens this URL in the system browser.
 *  3. If already logged in → fetch custom token → redirect to planai-recorder://auth?token=...
 *  4. If not logged in → redirect to /login?next=/auth/desktop
 */
const DesktopCallback: React.FC = () => {
  const { isAuthInitialized } = useAuth();
  const firebaseUser = auth.currentUser;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const { data, error } = useGetDesktopTokenQuery(undefined, {
    skip: !firebaseUser || !isAuthInitialized,
  });

  useEffect(() => {
    if (!isAuthInitialized) return;
    if (!firebaseUser) {
      window.location.href = `/login?next=${encodeURIComponent("/auth/desktop")}`;
    }
  }, [isAuthInitialized, firebaseUser]);

  useEffect(() => {
    if (data?.data?.customToken) {
      setStatus("success");
      window.location.href = `blueberrybytes-recorder://auth?token=${encodeURIComponent(data.data.customToken)}`;
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      setStatus("error");
      setErrorMsg("Failed to generate desktop auth token. Please try again.");
    }
  }, [error]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 360, textAlign: "center", px: 3 }}>
        {status === "loading" && (
          <>
            <CircularProgress />
            <Typography variant="h6">Connecting to Plan AI Recorder…</Typography>
            <Typography variant="body2" color="text.secondary">
              Signing you in to the desktop app. You can close this tab once done.
            </Typography>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: "success.main" }} />
            <Typography variant="h6">You&apos;re signed in!</Typography>
            <Typography variant="body2" color="text.secondary">
              Return to the Plan AI Recorder app. You can close this tab.
            </Typography>
          </>
        )}
        {status === "error" && <Alert severity="error">{errorMsg}</Alert>}
      </Stack>
    </Box>
  );
};

export default DesktopCallback;
