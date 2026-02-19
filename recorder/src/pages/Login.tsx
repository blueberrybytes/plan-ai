import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  TextField,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useAuth } from "../hooks/useAuth";

const Login: React.FC = () => {
  const { signInWithEmail, signInWithDesktopBrowser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
    setGoogleLoading(true);
    try {
      // Opens plan-ai.blueberrybytes.com/auth/desktop in the system browser.
      // After login there, the web app redirects to planai-recorder://auth?token=...
      // which triggers signInWithCustomToken in useAuth.tsx automatically.
      await signInWithDesktopBrowser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open browser.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        pt: "28px",
      }}
    >
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

        {/* Google via system browser — the right Electron pattern */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={
            googleLoading ? <CircularProgress size={16} color="inherit" /> : <GoogleIcon />
          }
          onClick={handleGoogleBrowser}
          disabled={googleLoading}
          sx={{ mb: 2, py: 1.2 }}
        >
          Continue with Google
        </Button>

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
            <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ py: 1.2 }}>
              {loading ? <CircularProgress size={20} color="inherit" /> : "Sign In with Email"}
            </Button>
          </Stack>
        </form>

        <Typography
          variant="caption"
          color="text.secondary"
          textAlign="center"
          display="block"
          sx={{ mt: 2 }}
        >
          Google sign-in opens your browser — no popup needed.
        </Typography>
      </Box>
    </Box>
  );
};

export default Login;
