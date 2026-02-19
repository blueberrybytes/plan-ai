import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
  TextField,
  Typography,
  useTheme,
  IconButton,
  InputAdornment,
  Alert,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  loginEmail,
  loginGoogle,
  loginMicrosoft,
  setIsLoading,
} from "../store/slices/session/sessionSlice";
import { ErrorCause } from "../types/ErrorTypes";
import {
  selectErrorSession,
  selectIsLoading,
  selectUser,
} from "../store/slices/session/sessionSelector";
import { EMAIL_REGEX } from "../utils/regex";
import GoogleIcon from "../components/icons/GoogleIcon";
import MicrosoftIcon from "../components/icons/MicrosoftIcon";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { useTranslation } from "react-i18next";

export default function Login() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { logoSrc, logoAlt, productName } = useBrandIdentity();

  // Redux state
  const isLoading = useSelector(selectIsLoading);
  const user = useSelector(selectUser);
  const errorSession = useSelector(selectErrorSession);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form validation
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verificationNeeded = errorSession?.cause === ErrorCause.EMAIL_VERIFICATION_NEEDED;

  // In your Login component
  useEffect(() => {
    // Reset loading state when component mounts
    dispatch(setIsLoading(false));
  }, [dispatch]);

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      navigate("/home");
    }
  }, [user, navigate]);

  // Handle error from Redux
  useEffect(() => {
    if (errorSession?.message) {
      setError(errorSession.message);
    } else {
      setError(null);
    }
  }, [errorSession]);

  const validateEmail = (email: string) => {
    if (!email) {
      setEmailError(t("login.errors.emailRequired"));
      return false;
    } else if (!EMAIL_REGEX.test(email)) {
      setEmailError(t("login.errors.emailInvalid"));
      return false;
    }
    setEmailError(null);
    return true;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError(t("login.errors.passwordRequired"));
      return false;
    } else if (password.length < 6) {
      setPasswordError(t("login.errors.passwordLength"));
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setError(null);

    // Dispatch login action to Redux
    dispatch(loginEmail({ email, password }));
  };

  const handleGoogleLogin = () => {
    setError(null);
    // Reset form validation errors when using Google login
    setEmailError(null);
    setPasswordError(null);

    // Dispatch Google login action to Redux
    dispatch(loginGoogle());
  };

  const handleMicrosoftLogin = () => {
    setError(null);
    // Reset form validation errors when using Microsoft login
    setEmailError(null);
    setPasswordError(null);

    // Dispatch Microsoft login action to Redux
    dispatch(loginMicrosoft());
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          py: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: "100%",
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
            <img src={logoSrc} alt={logoAlt} style={{ height: "56px" }} />
          </Box>

          <Typography variant="h4" component="h1" align="center" gutterBottom>
            {t("login.title", { productName })}
          </Typography>
          <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 3 }}>
            {t("login.subtitle")}
          </Typography>

          {error && (
            <Alert severity={verificationNeeded ? "warning" : "error"} sx={{ mb: 3 }}>
              {verificationNeeded ? (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {t("login.alerts.verificationTitle")}
                  </Typography>
                  <Typography variant="body2">
                    {t("login.alerts.verificationBody", {
                      email: email || t("login.alerts.defaultEmailPlaceholder"),
                    })}
                  </Typography>
                </>
              ) : (
                error
              )}
            </Alert>
          )}

          <form onSubmit={handleEmailLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={t("login.form.emailLabel")}
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => validateEmail(email)}
              error={!!emailError}
              helperText={emailError}
              disabled={isLoading}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label={t("login.form.passwordLabel")}
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => validatePassword(password)}
              error={!!passwordError}
              helperText={passwordError}
              disabled={isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ mt: 3, mb: 2 }}
              disabled={isLoading}
            >
              {isLoading ? t("login.form.signingIn") : t("login.form.signIn")}
            </Button>
          </form>

          <Divider sx={{ my: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("login.oauth.divider")}
            </Typography>
          </Divider>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            disabled={isLoading}
            sx={{
              borderColor: theme.palette.grey[300],
              color: theme.palette.text.primary,
              "&:hover": {
                borderColor: theme.palette.grey[400],
                backgroundColor: theme.palette.grey[50],
              },
            }}
          >
            {t("login.oauth.google")}
          </Button>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<MicrosoftIcon />}
            onClick={handleMicrosoftLogin}
            disabled={isLoading}
            sx={{
              mt: 1.5,
              borderColor: theme.palette.grey[300],
              color: theme.palette.text.primary,
              "&:hover": {
                borderColor: theme.palette.grey[400],
                backgroundColor: theme.palette.grey[50],
              },
            }}
          >
            {t("login.oauth.microsoft")}
          </Button>

          <Grid container justifyContent="space-between" sx={{ mt: 3 }}>
            <Grid item>
              <Typography
                variant="body2"
                component={Link}
                to="/forgot-password"
                color="primary"
                sx={{ textDecoration: "none" }}
              >
                {t("login.links.forgotPassword")}
              </Typography>
            </Grid>
            <Grid item>
              <Typography
                variant="body2"
                component={Link}
                to="/signup"
                color="primary"
                sx={{ textDecoration: "none" }}
              >
                {t("login.links.signup")}
              </Typography>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("login.legal.agreePrefix")}{" "}
              <Link
                to="/terms-of-service"
                style={{
                  color: theme.palette.primary.main,
                  textDecoration: "none",
                }}
              >
                {t("login.legal.terms")}
              </Link>{" "}
              {t("login.legal.and")}{" "}
              <Link
                to="/privacy-policy"
                style={{
                  color: theme.palette.primary.main,
                  textDecoration: "none",
                }}
              >
                {t("login.legal.privacy")}
              </Link>{" "}
              {t("login.legal.and")}{" "}
              <Link
                to="/delete-my-data"
                style={{
                  color: theme.palette.primary.main,
                  textDecoration: "none",
                }}
              >
                {t("login.legal.dataDeletion")}
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
