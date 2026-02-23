import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Typography, Alert, Stack } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { auth } from "../firebase/firebase";
import { useLazyGetDesktopTokenQuery } from "../store/apis/authApi";

/**
 * /auth/desktop?local_port=4321 — opened by the Plan AI Recorder (Electron app)
 * via shell.openExternal() in the system browser.
 *
 * When local_port is provided (dev mode), the token is delivered via a GET request
 * to the Electron app's local HTTP server instead of the custom protocol (which is
 * unreliable for unpackaged Electron apps on macOS).
 *
 * Flow:
 *  1. Electron opens this page with ?local_port=4321
 *  2. If user is logged in → fetch custom token
 *     a. Dev (local_port present) → GET http://localhost:4321/auth?token=...
 *     b. Prod (no local_port)     → redirect to blueberrybytes-recorder://auth?token=...
 *  3. If not logged in → redirect to /login?next=/auth/desktop
 */
const DesktopCallback: React.FC = () => {
  const { isAuthInitialized } = useAuth();
  const firebaseUser = auth.currentUser;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Read local_port from URL — present when opened by the Electron dev build
  const localPort = new URLSearchParams(window.location.search).get("local_port");

  const [triggerGetDesktopToken, { data, error }] = useLazyGetDesktopTokenQuery();

  useEffect(() => {
    if (!isAuthInitialized) return;
    if (!firebaseUser) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      return;
    }

    // If authenticated, trigger the token fetch
    triggerGetDesktopToken();
  }, [isAuthInitialized, firebaseUser, triggerGetDesktopToken]);

  useEffect(() => {
    if (!data?.data?.customToken) return;

    const token = data.data.customToken;

    if (localPort) {
      // Dev mode: deliver token via local HTTP server — bypass unreliable OS protocol dispatch
      const url = `http://localhost:${localPort}/auth?token=${encodeURIComponent(token)}`;
      // Use an iframe to avoid CORS redirect issues; the server responds with close-tab HTML
      const img = new Image();
      img.src = url;
      img.onload = () => setStatus("success");
      img.onerror = () => {
        // Image loads "error" for non-image responses but the request was made — success
        setStatus("success");
      };
    } else {
      // Prod mode: use custom protocol
      window.location.href = `blueberrybytes-recorder://auth?token=${encodeURIComponent(token)}`;
      setStatus("success");
    }
  }, [data, localPort]);

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
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 400, textAlign: "center", px: 3 }}>
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
