import React, { useEffect, useState, useCallback } from "react";
import { Box, CircularProgress, Typography, Alert, Stack, Button } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useLazyGetDesktopTokenQuery } from "../store/apis/authApi";

/**
 * /auth/desktop?local_port=4321 — opened by the Plan AI Recorder (Electron app)
 * via shell.openExternal() in the system browser.
 *
 * This acts strictly as a silent bridge. By the time the user arrives here, they
 * have already authenticated on the main /login page.
 *
 * Flow:
 *  1. Login.tsx successfully authenticates via Popup/Email -> redirects here
 *  2. We wait for `firebaseUser` to hydrate in the state
 *  3. We wait for `userDb` to populate (guarantees backend registration is complete)
 *  4. We fetch the Custom Firebase Desktop Token from the backend
 *  5. We safely deliver the token to Electron via http://localhost:4321/auth?token=...
 */
const DesktopCallback: React.FC = () => {
  const { isAuthInitialized } = useAuth();

  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
  }, []);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const localPort = new URLSearchParams(window.location.search).get("local_port");

  const [triggerGetDesktopToken, { data, error }] = useLazyGetDesktopTokenQuery();

  const cancelAuth = useCallback(() => {
    if (localPort) {
      navigator.sendBeacon(`http://localhost:${localPort}/auth-cancel`);
      window.setTimeout(() => window.close(), 100);
    }
    setStatus("error");
    setErrorMsg("Authentication was cancelled.");
  }, [localPort]);

  useEffect(() => {
    if (!isAuthInitialized) {
      console.log("[DesktopCallback] Waiting for auth to initialize...");
      return;
    }
    if (status !== "loading") {
      console.log("[DesktopCallback] Status is not loading, skipping...");
      return;
    }

    if (!firebaseUser) {
      console.log("[DesktopCallback] No firebase user found, redirecting to login...");
      // If we landed here without an active session somehow, bump them back to the login screen
      if (localPort) {
        console.log("[DesktopCallback] Redirecting to login with local port...");
        window.location.href = `/login?desktop_auth=true&local_port=${localPort}`;
      } else {
        console.log("[DesktopCallback] Redirecting to login...");
        window.location.href = `/login`;
      }
      return;
    }

    // Use a resilient async polling loop.
    // If the user just logged in via Google Popup, sessionSaga is still concurrently creating them
    // in the backend postgres DB. The /desktop-token endpoint requires that DB record to exist.
    // So we poll up to 10 seconds to give sessionSaga time to finish.
    // If the user was ALREADY logged in from hours ago, this will succeed on the 1st attempt.
    const attemptFetch = async () => {
      console.log("[DesktopCallback] Triggering token fetch for user:", firebaseUser.uid);
      for (let i = 0; i < 10; i++) {
        try {
          // Unwrapping allows us to catch the RTK Query error properly
          await triggerGetDesktopToken().unwrap();
          return; // Success! The data useEffect below will handle the rest.
        } catch (err) {
          console.warn(
            `[DesktopCallback] Token fetch attempt ${i + 1} failed (waiting for backend DB sync). Retrying...`,
            err,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      console.log("[DesktopCallback] Failed to generate desktop auth token. Backend sync timeout.");
      setStatus("error");
      setErrorMsg("Failed to generate desktop auth token. Backend sync timeout.");
    };

    attemptFetch();
  }, [isAuthInitialized, firebaseUser, triggerGetDesktopToken, localPort, status]);

  useEffect(() => {
    if (!data?.data?.customToken) {
      console.log("[DesktopCallback] No custom token received, waiting...");
      return;
    }

    const token = data.data.customToken;

    if (localPort) {
      console.log("[DesktopCallback] Delivering token via local HTTP server...");
      // Dev mode: deliver token via local HTTP server
      const url = `http://localhost:${localPort}/auth?token=${encodeURIComponent(token)}`;
      try {
        window.location.href = url;
        setStatus("success");
        console.log("[DesktopCallback] Token delivered successfully.");
      } catch (e) {
        console.error("[DesktopCallback] Failed to execute window.location.href:", e);
      }
    } else {
      // Prod mode: deliver via custom protocol handler
      try {
        console.log("[DesktopCallback] Delivering token via custom protocol handler...");
        window.location.href = `blueberrybytes-recorder://auth?token=${encodeURIComponent(token)}`;
        setStatus("success");
      } catch (e) {
        console.error("[DesktopCallback] Failed to execute custom protocol redirect:", e);
      }
    }
  }, [data, localPort]);

  useEffect(() => {
    if (error) {
      console.log("[DesktopCallback] Error generating desktop auth token:", error);
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
              Handing off your credentials securely to the desktop app. You can close this tab once
              done.
            </Typography>
            {localPort && (
              <Button variant="text" color="error" onClick={cancelAuth} sx={{ mt: 2 }}>
                Cancel
              </Button>
            )}
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: "success.main" }} />
            <Typography variant="h6">You&apos;re signed in!</Typography>
            <Typography variant="body2" color="text.secondary">
              Return to the Plan AI Recorder app. You can close this tab safely.
            </Typography>
          </>
        )}
        {status === "error" && <Alert severity="error">{errorMsg}</Alert>}
      </Stack>
    </Box>
  );
};

export default DesktopCallback;
