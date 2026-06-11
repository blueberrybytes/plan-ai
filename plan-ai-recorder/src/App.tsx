import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Recording from "./pages/Recording";
import TranscriptView from "./pages/TranscriptView";
import Profile from "./pages/Profile";
import Debug from "./pages/Debug";
import {
  CircularProgress,
  Box,
  Snackbar,
  Alert,
  Button,
  Typography,
} from "@mui/material";
import { useAutoUpdater } from "./hooks/useAutoUpdater";

const WEB_APP_URL =
  import.meta.env.VITE_PLAN_AI_WEB_URL || "http://localhost:3000";

const GateActions: React.FC<{
  dashboardPath?: string;
  onSignOut: () => void;
  onRefetch: () => Promise<void>;
}> = ({ dashboardPath = "", onSignOut, onRefetch }) => {
  const [refreshing, setRefreshing] = React.useState(false);
  const [showStillPending, setShowStillPending] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    setShowStillPending(false);
    try {
      await onRefetch();
      // If the component is still mounted after refetch, the gate condition
      // is still true — setup wasn't completed. Show feedback.
      setShowStillPending(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenDashboard = () => {
    const url = `${WEB_APP_URL}${dashboardPath}`;
    window.electron?.openExternalUrl?.(url) ?? window.open(url, "_blank");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        mt: 4,
        width: "100%",
        maxWidth: 240,
      }}
    >
      <Button variant="contained" onClick={handleOpenDashboard}>
        Open Dashboard
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
      {showStillPending && (
        <Typography
          variant="body2"
          color="warning.main"
          sx={{ textAlign: "center", mt: 0.5 }}
        >
          Setup is still incomplete. Please finish the configuration on the web
          dashboard and try again.
        </Typography>
      )}
      <Button variant="text" color="inherit" onClick={onSignOut} sx={{ mt: 1 }}>
        Log Out
      </Button>
    </Box>
  );
};

const AppRoutes: React.FC = () => {
  const {
    user,
    dbUser,
    loading,
    workspaces,
    activeWorkspaceId,
    signOut,
    refetchDbUser,
    refetchWorkspaces,
    api,
  } = useAuth();

  // Subscription gate state. Loaded lazily once we have a workspace.
  // null = not loaded yet, undefined-active = OSS / pre-load
  const [subscription, setSubscription] = React.useState<{
    active: boolean;
    configured: boolean;
    reason?: string;
    track?: string | null;
  } | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = React.useState(false);

  const loadSubscription = React.useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const sub = await api.getSubscription();
      setSubscription({
        active: sub.active,
        configured: sub.configured,
        reason: sub.reason,
        track: sub.track,
      });
    } catch (err) {
      // If the call itself fails, fail open — don't block the user from
      // recording over a billing-API hiccup. Backend endpoints will still
      // enforce the guard.
      console.warn("[recorder] Failed to load subscription state", err);
      setSubscription({ active: true, configured: false, track: null });
    } finally {
      setSubscriptionLoaded(true);
    }
  }, [activeWorkspaceId, api]);

  React.useEffect(() => {
    if (user && activeWorkspaceId) {
      void loadSubscription();
    }
  }, [user, activeWorkspaceId, loadSubscription]);

  const refetchAll = React.useCallback(async () => {
    await Promise.all([
      refetchDbUser(),
      refetchWorkspaces(),
      loadSubscription(),
    ]);
  }, [refetchDbUser, refetchWorkspaces, loadSubscription]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Only BYOK workspaces need user-provided API keys. Managed plans get
  // platform-provided AI, courtesy workspaces use global fallback keys,
  // and workspaces without a plan yet are handled by the subscription gate.
  const isByok = subscription?.track === "BYOK";
  const isMissingKeys =
    activeWorkspace &&
    !activeWorkspace.isCourtesy &&
    isByok &&
    activeWorkspace.role === "OWNER" &&
    (!activeWorkspace.openRouterKey || !activeWorkspace.deepgramKey);

  // Subscription required gate — blocks every page except Login. The recorder
  // is paid-only, so without a sub there's nothing meaningful to do.
  // Bypassed for self-host instances (`configured: false`) and for active subs.
  const needsSubscription =
    subscriptionLoaded &&
    subscription !== null &&
    subscription.configured &&
    !subscription.active;

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (user && dbUser && !dbUser.hasCompletedOnboarding) {
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
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Almost there!
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 400 }}>
          Please log into the Web Dashboard to complete your Workspace and API
          Key setup, then come back and tap "I've Completed Setup".
        </Typography>
        <GateActions
          dashboardPath="/onboarding"
          onSignOut={signOut}
          onRefetch={refetchAll}
        />
      </Box>
    );
  }

  if (user && dbUser && isMissingKeys) {
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
        <Typography
          variant="h5"
          fontWeight="bold"
          color="error.main"
          gutterBottom
        >
          API Keys Required
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 400 }}>
          Your workspace "{activeWorkspace.name}" uses Bring Your Own Key
          (BYOK) mode and is missing API keys. Configure your OpenRouter and
          Deepgram keys on the web dashboard, then tap "I've Completed Setup"
          to continue.
        </Typography>
        <GateActions
          dashboardPath="/team"
          onSignOut={signOut}
          onRefetch={refetchAll}
        />
      </Box>
    );
  }

  if (user && dbUser && needsSubscription && subscription) {
    // `over_quota` = subscription is active and paid, but the workspace has
    // more members than purchased seats. Different copy + different deep-link
    // (Web /team to remove members or open seat management) than the
    // generic "no subscription" gate.
    const isOverQuota = subscription.reason === "over_quota";
    const canSubscribe = activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";

    const reasonCopy = isOverQuota
      ? "Your team has more members than paid seats. Remove members or add more seats in the Web Dashboard to keep recording."
      : subscription.reason === "expired"
        ? "Your subscription has lapsed. Update your payment method in the Web Dashboard to keep recording."
        : subscription.reason === "canceled"
          ? "Your subscription has been canceled. Re-subscribe in the Web Dashboard to keep recording."
          : subscription.reason === "incomplete"
            ? "Your last payment is incomplete. Finish checkout in the Web Dashboard to activate your subscription."
            : "Your workspace doesn't have an active subscription yet. Choose a plan in the Web Dashboard to start recording.";

    const memberCopy = isOverQuota
      ? "This workspace has more members than paid seats. Ask your admin to remove members or add more seats."
      : "This workspace doesn't have an active subscription. Ask your workspace admin to choose a plan in the Web Dashboard.";

    const dashboardPath = canSubscribe ? (isOverQuota ? "/team" : "/billing") : "/home";
    const title = isOverQuota ? "Too Many Seats In Use" : "Subscription Required";

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
        <Typography variant="h5" fontWeight="bold" color="warning.main" gutterBottom>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
          {canSubscribe ? reasonCopy : memberCopy}
        </Typography>
        <GateActions
          dashboardPath={dashboardPath}
          onSignOut={signOut}
          onRefetch={refetchAll}
        />
      </Box>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={user ? <Home /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/recording"
          element={user ? <Recording /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/profile"
          element={user ? <Profile /> : <Navigate to="/login" replace />}
        />
        <Route path="/debug" element={<Debug />} />
        <Route
          path="/transcript/:id"
          element={user ? <TranscriptView /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

const App: React.FC = () => {
  const { 
    masUpdate, 
    otaAvailable, 
    otaDownloaded, 
    handleMasUpdate,
    handleOtaRestart,
    dismissMasUpdate,
    dismissOtaDownloaded
  } = useAutoUpdater();

  return (
    <HashRouter>
      <AppRoutes />

      {/* Update Snackbars */}
      <Snackbar
        open={!!masUpdate}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        onClose={dismissMasUpdate}
      >
        <Alert
          severity="warning"
          onClose={dismissMasUpdate}
          action={
            <Button color="inherit" size="small" onClick={handleMasUpdate}>
              UPDATE NOW
            </Button>
          }
        >
          A new version ({masUpdate?.version}) is available on the Mac App
          Store!
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!otaAvailable && !otaDownloaded}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="warning">
          Downloading an update in the background...
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!otaDownloaded}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        onClose={dismissOtaDownloaded}
      >
        <Alert 
          severity="success" 
          onClose={dismissOtaDownloaded}
          action={
            <Button color="inherit" size="small" onClick={handleOtaRestart}>
              RESTART & INSTALL
            </Button>
          }
        >
          Update downloaded! Restart the application to install.
        </Alert>
      </Snackbar>
    </HashRouter>
  );
};

export default App;
