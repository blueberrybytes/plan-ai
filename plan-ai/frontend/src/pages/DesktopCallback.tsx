import React, { useEffect, useState, useCallback } from "react";
import { Box, CircularProgress, Typography, Alert, Stack, Button } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useAuth } from "../providers/FirebaseAuthProvider";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import axios from "axios";
import { useGetDesktopTokenMutation } from "../store/apis/authApi";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { clientLogger } from "../utils/clientLogger";

/**
 * /auth/desktop?state=...&local_port=4321 — opened by the Plan AI Recorder
 * (Electron app), in the system browser or in its Apple sign-in window.
 *
 * This acts strictly as a silent bridge. If the user is not signed in yet, it
 * sends them to /login, which comes back here once they are.
 *
 * Flow:
 *  1. We keep the recorder's `state` in sessionStorage (it survives /login)
 *  2. We wait for `firebaseUser` to hydrate in the state
 *  3. We fetch a one-time desktop code from the backend
 *  4. We hand code AND state to the recorder, via the deep link, or via
 *     http://localhost:<local_port>/auth in development
 *
 * Recorders up to 4.4.0 send no state. They get the code alone, as before,
 * until that version is gone; a recorder that sends a state always gets it back.
 * The recorder accepts a code only with the state of the login it started, so
 * a page cannot sign the recorder into another account (login CSRF).
 */
const DESKTOP_STATE_KEY = "desktop_auth_state";
// The recorder sends 32 random bytes in base64url (43 characters).
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
// A bare port number. Anything else could turn "http://localhost:<port>" into
// a URL on another host, which would receive the code.
const PORT_PATTERN = /^[0-9]{2,5}$/;

function readDesktopState(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("state");
  if (fromUrl && STATE_PATTERN.test(fromUrl)) {
    sessionStorage.setItem(DESKTOP_STATE_KEY, fromUrl);
    return fromUrl;
  }
  const stored = sessionStorage.getItem(DESKTOP_STATE_KEY);
  return stored && STATE_PATTERN.test(stored) ? stored : null;
}

const DesktopCallback: React.FC = () => {
  const { isAuthInitialized } = useAuth();
  const { deepLinkScheme } = useBrandIdentity();

  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
  }, []);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const rawLocalPort =
    new URLSearchParams(window.location.search).get("local_port") ||
    sessionStorage.getItem("local_port");
  const localPortValid = !rawLocalPort || PORT_PATTERN.test(rawLocalPort);
  const localPort = rawLocalPort && localPortValid ? rawLocalPort : null;
  const autoTrigger = new URLSearchParams(window.location.search).get("auto_trigger");
  const [desktopState] = useState<string | null>(() => readDesktopState());

  console.log("[DesktopCallback] === INIT ===");
  console.log("[DesktopCallback] local_port:", localPort, "valid:", localPortValid);
  console.log("[DesktopCallback] state present:", !!desktopState);

  const [triggerGetDesktopToken] = useGetDesktopTokenMutation();

  const cancelAuth = useCallback(() => {
    if (localPort) {
      navigator.sendBeacon(
        desktopState
          ? `http://localhost:${localPort}/auth-cancel?state=${encodeURIComponent(desktopState)}`
          : `http://localhost:${localPort}/auth-cancel`,
      );
      window.setTimeout(() => window.close(), 100);
    }
    setStatus("error");
    setErrorMsg("Authentication was cancelled.");
  }, [localPort, desktopState]);

  useEffect(() => {
    if (!isAuthInitialized) {
      console.log("[DesktopCallback] Waiting for auth to initialize...");
      return;
    }
    if (status !== "loading") {
      console.log("[DesktopCallback] Status is not loading, skipping...");
      return;
    }

    // Refuse before any code exists: a code must only ever travel with the
    // state of the recorder that asked for it, to the recorder itself.
    if (!localPortValid) {
      setStatus("error");
      setErrorMsg("This sign-in link is not valid. Start the sign-in again from Plan AI Recorder.");
      return;
    }

    if (!firebaseUser) {
      console.log("[DesktopCallback] No firebase user found, redirecting to login...");
      // The state stays in sessionStorage; /login brings the user back here.
      const params = new URLSearchParams({ desktop_auth: "true" });
      if (localPort) params.set("local_port", localPort);
      if (autoTrigger === "apple") params.set("auto_trigger", "apple");
      window.location.href = `/login?${params.toString()}`;
      return;
    }

    // Use a resilient async polling loop.
    // If the user just logged in via Google Popup, sessionSaga is still concurrently creating them
    // in the backend postgres DB. The /desktop-token endpoint requires that DB record to exist.
    // So we poll up to 10 seconds to give sessionSaga time to finish.
    // If the user was ALREADY logged in from hours ago, this will succeed on the 1st attempt.
    const attemptFetch = async () => {
      console.log("[DesktopCallback] Triggering token fetch for user:", firebaseUser.uid);

      // CRITICAL FIX: Because Apple Auth can trigger a full page redirect in Electron,
      // the Redux Sagas that normally perform PostgreSQL registration might be killed!
      // To prevent 'User not found' crashes strictly enforce Database existence right here:
      try {
        const idToken = await firebaseUser.getIdToken();
        const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/+$/, "");
        const apiUrl = `${baseUrl}/api/session/login`;
        console.log("[DesktopCallback] Bootstrapping Postgres Identity synchronization...");
        await axios.post(apiUrl, { token: idToken, uuid: firebaseUser.uid });
        console.log("[DesktopCallback] Postgres Identity successfully synced!");
      } catch (syncErr) {
        console.warn("[DesktopCallback] Postgres sync non-fatal error:", syncErr);
      }

      let lastError: unknown = null;
      for (let i = 0; i < 10; i++) {
        try {
          // Unwrapping allows us to catch the RTK Query error properly
          const fetchResponse = await triggerGetDesktopToken().unwrap();

          if (!fetchResponse?.data?.code) {
            throw new Error("No authorization code in response");
          }

          const authCode = fetchResponse.data.code;
          // A recorder up to 4.4.0 sends no state and reads only the code.
          const query = desktopState
            ? `code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(desktopState)}`
            : `code=${encodeURIComponent(authCode)}`;
          // One login, one hand-off: a reload of this tab must not reuse it.
          sessionStorage.removeItem(DESKTOP_STATE_KEY);

          if (localPort) {
            console.log("[DesktopCallback] Delivering code via local HTTP server...");
            // Dev mode: deliver code via local HTTP server
            window.location.href = `http://localhost:${localPort}/auth?${query}`;
            setStatus("success");
            console.log("[DesktopCallback] Code delivered successfully.");
          } else {
            // Prod mode: deliver via custom protocol handler
            console.log("[DesktopCallback] Delivering code via custom protocol handler...");
            window.location.href = `${deepLinkScheme}://auth?${query}`;
            setStatus("success");
          }
          return; // Success! Loop ends.
        } catch (err) {
          lastError = err;
          console.warn(
            `[DesktopCallback] Token fetch attempt ${i + 1} failed (waiting for backend DB sync). Retrying...`,
            err,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      console.log("[DesktopCallback] Failed to generate desktop auth token. Backend sync timeout.");
      // Ten failures in a row is not an expected outcome, unless the browser is offline.
      // Only the status of the last try is sent: never the code or the state.
      if (navigator.onLine !== false) {
        const lastStatus = (lastError as { status?: unknown } | null)?.status;
        clientLogger.error(
          "Desktop sign-in could not get a code",
          lastError instanceof Error ? lastError : undefined,
          {
            feature: "desktopAuth",
            attempts: 10,
            status:
              typeof lastStatus === "number" || typeof lastStatus === "string" ? lastStatus : null,
          },
        );
      }
      setStatus("error");
      setErrorMsg("Failed to generate desktop auth token. Backend sync timeout.");
    };

    attemptFetch();
  }, [
    isAuthInitialized,
    firebaseUser,
    triggerGetDesktopToken,
    localPort,
    localPortValid,
    autoTrigger,
    desktopState,
    status,
    deepLinkScheme,
  ]);

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
              Return to the Plan AI Recorder app.
            </Typography>
            <Button variant="contained" onClick={() => window.close()} sx={{ mt: 1 }}>
              Close Tab
            </Button>
            <Typography variant="caption" color="text.secondary">
              Or press <kbd>⌘ W</kbd> to close this tab.
            </Typography>
          </>
        )}
        {status === "error" && <Alert severity="error">{errorMsg}</Alert>}
      </Stack>
    </Box>
  );
};

export default DesktopCallback;
