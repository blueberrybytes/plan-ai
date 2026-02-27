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
import GoogleIcon from "../components/icons/GoogleIcon";
import MicrosoftIcon from "../components/icons/MicrosoftIcon";
import AppleIcon from "@mui/icons-material/Apple";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  signupEmail,
  loginGoogle,
  loginMicrosoft,
  loginApple,
  setIsLoading,
} from "../store/slices/auth/authSlice";
import { selectErrorSession, selectIsLoading, selectUser } from "../store/slices/auth/authSelector";
import { EMAIL_REGEX } from "../utils/regex";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { useTranslation } from "react-i18next";

export default function SignUp() {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { logoSrc, logoAlt, productName } = useBrandIdentity();
  const { t } = useTranslation();

  // Redux state
  const isLoading = useSelector(selectIsLoading);
  const user = useSelector(selectUser);
  const errorSession = useSelector(selectErrorSession);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form validation
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset loading state when component mounts
  useEffect(() => {
    dispatch(setIsLoading(false));
  }, [dispatch]);

  // Redirect if user is already logged in
  useEffect(() => {
    if (user?.emailVerified) {
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

  const validateConfirmPassword = (confirmPassword: string) => {
    if (!confirmPassword) {
      setConfirmPasswordError(t("signUp.errors.confirmRequired"));
      return false;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError(t("signUp.errors.confirmMismatch"));
      return false;
    }
    setConfirmPasswordError(null);
    return true;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

    if (!isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }

    setError(null);

    // Dispatch signup action to Redux
    dispatch(signupEmail({ email, password }));
  };

  const handleGoogleSignUp = () => {
    setError(null);

    // Dispatch Google login action to Redux
    dispatch(loginGoogle());
  };

  const handleMicrosoftSignUp = () => {
    setError(null);

    // Dispatch Microsoft login action to Redux
    dispatch(loginMicrosoft());
  };

  const handleAppleSignUp = () => {
    setError(null);
    dispatch(loginApple());
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
            {t("signUp.title", { productName })}
          </Typography>
          <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 3 }}>
            {t("signUp.subtitle")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSignUp}>
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
              autoComplete="new-password"
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
                      aria-label={t("signUp.form.showPasswordAria")}
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label={t("signUp.form.confirmPasswordLabel")}
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => validateConfirmPassword(confirmPassword)}
              error={!!confirmPasswordError}
              helperText={confirmPasswordError}
              disabled={isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
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
              {isLoading ? t("signUp.buttons.creating") : t("signUp.buttons.submit")}
            </Button>
          </form>

          <Divider sx={{ my: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("signUp.divider")}
            </Typography>
          </Divider>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleSignUp}
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
            onClick={handleMicrosoftSignUp}
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

          <Button
            fullWidth
            variant="outlined"
            startIcon={<AppleIcon />}
            onClick={handleAppleSignUp}
            disabled={isLoading}
            sx={{
              mt: 1.5,
              borderColor: "#000",
              color: "#000",
              backgroundColor: "#fff",
              "&:hover": {
                borderColor: "#000",
                backgroundColor: "#f5f5f5",
              },
            }}
          >
            {t("login.oauth.apple", "Continue with Apple")}
          </Button>

          <Grid container justifyContent="center" sx={{ mt: 3 }}>
            <Grid item>
              <Typography
                variant="body2"
                component={Link}
                to="/login"
                color="primary"
                sx={{ textDecoration: "none" }}
              >
                {t("signUp.links.loginPrompt")}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
}
