import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  TextField,
  Typography,
  Alert,
  Stack,
  Tooltip,
  IconButton,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import AppleIcon from "@mui/icons-material/Apple";
import BugIcon from "@mui/icons-material/BugReport";
import { useAuth } from "../hooks/useAuth";
import MicrosoftIcon from "../components/MicrosoftIcon";

const Login: React.FC = () => {
  const { signInWithEmail, signInWithDesktopBrowser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitingProvider, setWaitingProvider] = useState<"google" | "microsoft" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleBrowser = async () => {
    setError(null);
    setWaitingProvider("google");
    try {
      await signInWithDesktopBrowser("google");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open browser.");
      setWaitingProvider(null);
    }
  };

  const handleMicrosoftBrowser = async () => {
    setError(null);
    setWaitingProvider("microsoft");
    try {
      await signInWithDesktopBrowser("microsoft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open browser.");
      setWaitingProvider(null);
    }
  };

  const handleAppleBrowser = async () => {
    setError(null);
    setWaitingProvider("apple");
    try {
      await signInWithDesktopBrowser("apple");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open browser.");
      setWaitingProvider(null);
    }
  };

  useEffect(() => {
    const unsubscribe = window.electron.onDesktopAuthCancelled(() => {
      setWaitingProvider(null);
    });
    return unsubscribe;
  }, []);

  const showBug =
    String(import.meta.env.VITE_LOGIN_BUG).toLowerCase() === "true";

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        pt: "28px",
        position: "relative",
      }}
    >
      {showBug && (
        <Box sx={{ position: "absolute", top: 32, right: 16 }}>
          <Tooltip title="Admin Debug Panel">
            <IconButton
              size="small"
              onClick={() => {
                console.log("Admin Debug Panel clicked");
                window.location.href = "#/debug";
              }}
              sx={{ opacity: 0.2, "&:hover": { opacity: 1 } }}
            >
              <BugIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Box sx={{ width: "100%", maxWidth: 360, px: 3 }}>
        <Stack spacing={1} alignItems="center" sx={{ mb: 4 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              background: "linear-gradient(135deg, #4361EE 0%, #7c9fff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Plan AI Recorder
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Sign in to capture meetings and generate tasks automatically.
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {waitingProvider ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress sx={{ mb: 3 }} />
            <Typography variant="h6" gutterBottom>
              Check your browser
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {waitingProvider === "apple" 
                ? "Please complete sign in with Apple in the popup window."
                : `We've opened your default browser to continue with ${
                    waitingProvider === "google" ? "Google" : "Microsoft"
                  }.`}
            </Typography>
            
            {waitingProvider !== "apple" && (
              <Alert severity="info" sx={{ mb: 3, textAlign: "left" }}>
                Opened the wrong browser? <br/>
                <Button 
                  size="small" 
                  onClick={() => {
                    const baseUrl = import.meta.env.VITE_PLAN_AI_WEB_URL || "http://localhost:3000";
                    const authUrl = `${baseUrl.replace(/\/+$/, "")}/login?desktop_auth=true`;
                    navigator.clipboard.writeText(authUrl);
                  }}
                  sx={{ p: 0, minWidth: 'auto', textTransform: 'none', mt: 0.5 }}
                >
                  Copy Auth Link
                </Button>
                {" "}to paste in your preferred one.
              </Alert>
            )}

            <Button 
              variant="text" 
              color="inherit" 
              onClick={() => setWaitingProvider(null)}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <>
            {/* Google via system browser — the right Electron pattern */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleBrowser}
              disabled={loading}
              sx={{ mb: 2, py: 1.2 }}
            >
              Continue with Google
            </Button>

            {/* Microsoft via internal browser window */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<MicrosoftIcon />}
              onClick={handleMicrosoftBrowser}
              disabled={loading}
              sx={{ mb: 2, py: 1.2 }}
            >
              Continue with Microsoft
            </Button>

            {/* Apple via internal browser window */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AppleIcon />}
              onClick={handleAppleBrowser}
              disabled={loading}
              sx={{
                mb: 2,
                py: 1.2,
                bgcolor: "#fff",
                color: "#000",
                borderColor: "#000",
                "&:hover": { bgcolor: "#f5f5f5", borderColor: "#000" },
              }}
            >
              Continue with Apple
            </Button>
          </>
        )}

        <Divider sx={{ mb: 2, opacity: 0.4 }}>
          <Typography variant="caption" color="text.secondary">
            or
          </Typography>
        </Divider>

        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="email"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ py: 1.2 }}
            >
              {loading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Sign In with Email"
              )}
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

export default Login;
