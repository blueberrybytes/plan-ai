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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefetch();
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
  } = useAuth();
  const refetchAll = React.useCallback(async () => {
    await Promise.all([refetchDbUser(), refetchWorkspaces()]);
  }, [refetchDbUser, refetchWorkspaces]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const isMissingKeys =
    activeWorkspace &&
    !activeWorkspace.isCourtesy &&
    activeWorkspace.role === "OWNER" &&
    (!activeWorkspace.openRouterKey || !activeWorkspace.deepgramKey);

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
          Your workspace "{activeWorkspace.name}" is missing required API keys.
          Configure them on the web dashboard, then tap "I've Completed Setup"
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
  const { masUpdate, otaAvailable, otaDownloaded, handleMasUpdate } =
    useAutoUpdater();

  return (
    <HashRouter>
      <AppRoutes />

      {/* Update Snackbars */}
      <Snackbar
        open={!!masUpdate}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity="warning"
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
      >
        <Alert severity="success">
          Update downloaded! Restart the application to install.
        </Alert>
      </Snackbar>
    </HashRouter>
  );
};

export default App;
