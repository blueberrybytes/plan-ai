import React, { useEffect, useState, useCallback } from "react";
import { Box, CircularProgress, Typography, Alert, Stack, Button } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { auth } from "../firebase/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useLazyGetDesktopTokenQuery } from "../store/apis/authApi";
import { useDispatch, useSelector } from "react-redux";
import {
  loginApple,
  loginGoogle,
  loginMicrosoft,
  clearSessionError,
} from "../store/slices/auth/authSlice";
import { selectErrorSession } from "../store/slices/auth/authSelector";

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

  // Make firebaseUser reactive to auth state changes so the component re-renders
  // after a popup OAuth flow completes successfully.
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
  }, []);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const dispatch = useDispatch();
  const errorSession = useSelector(selectErrorSession);
  const [hasStartedLogin, setHasStartedLogin] = useState(false);

  // Read local_port and provider from URL
  const localPort = new URLSearchParams(window.location.search).get("local_port");
  const provider = new URLSearchParams(window.location.search).get("provider");

  const [triggerGetDesktopToken, { data, error }] = useLazyGetDesktopTokenQuery();

  const cancelAuth = useCallback(() => {
    if (localPort) {
      navigator.sendBeacon(`http://localhost:${localPort}/auth-cancel`);
      window.close(); // Attempt to close if it's a popup or child window
    }
    setStatus("error");
    setErrorMsg("Authentication was cancelled.");
  }, [localPort]);

  // If OAuth gets manually closed by the user or an error occurs during this attempt
  useEffect(() => {
    // Only cancel if an error arrives AFTER we actually started the login attempt
    if (hasStartedLogin && errorSession && localPort) {
      console.error(
        "[DesktopCallback] Cancellation triggered by Redux sessionError:",
        errorSession,
      );
      cancelAuth();
    }
  }, [cancelAuth, errorSession, localPort, hasStartedLogin]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_POPUP_CLOSED") {
        setTimeout(() => {
          // If the popup closed but Firebase successfully authenticated the user,
          // do not trigger the cancellation fallback! Wait for the custom token fetch.
          if (auth.currentUser) {
            console.log(
              "[DesktopCallback] Popup closed on SUCCESS (auth.currentUser found). Will not cancel.",
            );
            return;
          }

          console.log("[DesktopCallback] Popup closed and no user found. Cancelling auth flow.");
          setStatus((currentStatus) => {
            if (currentStatus === "loading") {
              if (localPort) {
                navigator.sendBeacon(`http://localhost:${localPort}/auth-cancel`);
                window.close();
              }
              setErrorMsg("Authentication was cancelled.");
              return "error";
            }
            return currentStatus;
          });
        }, 3000);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [localPort]);

  useEffect(() => {
    if (!isAuthInitialized) return;

    // Force sign out if the requested provider doesn't match current user's provider
    if (firebaseUser && provider) {
      const userProviderIds = firebaseUser.providerData.map((p) => p.providerId);
      if (!userProviderIds.some((id) => id.includes(provider))) {
        signOut(auth);
        return; // Wait for logout
      }
    }

    if (!firebaseUser) {
      if (provider) {
        setHasStartedLogin(true);
        dispatch(clearSessionError()); // wipe the slate clean immediately

        if (provider === "apple") dispatch(loginApple());
        else if (provider === "google") dispatch(loginGoogle());
        else if (provider === "microsoft") dispatch(loginMicrosoft());
        return; // wait for login to complete
      }

      // If no provider is in the URL, this shouldn't be loaded without a session.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      return;
    }

    // If authenticated, trigger the token fetch
    console.log("[DesktopCallback] Triggering token fetch for user:", firebaseUser.uid);
    triggerGetDesktopToken();
  }, [isAuthInitialized, firebaseUser, triggerGetDesktopToken, provider, dispatch]);

  useEffect(() => {
    console.log("[DesktopCallback] Token Fetch Data Updated:", {
      hasData: !!data,
      hasToken: !!data?.data?.customToken,
      localPort,
    });
    if (!data?.data?.customToken) return;

    const token = data.data.customToken;

    if (localPort) {
      // Dev mode: deliver token via local HTTP server — bypass unreliable OS protocol dispatch
      const url = `http://localhost:${localPort}/auth?token=${encodeURIComponent(token)}`;
      console.log("[DesktopCallback] Attempting to navigate to local port URL:", url);
      // Change the browser location so Electron catches the 'will-navigate' event
      // This solves the CORS/Mixed Content block that happens if we use fetch() or Image()
      try {
        window.location.href = url;
        console.log("[DesktopCallback] Successfully executed window.location.href");
      } catch (e) {
        console.error("[DesktopCallback] Failed to execute window.location.href:", e);
      }
    } else {
      // Prod mode: use custom protocol
      console.log("[DesktopCallback] Attempting to navigate to custom protocol");
      try {
        window.location.href = `blueberrybytes-recorder://auth?token=${encodeURIComponent(token)}`;
        setStatus("success");
      } catch (e) {
        console.error("[DesktopCallback] Failed to execute custom protocol redirect:", e);
      }
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
            {localPort && provider && (
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
