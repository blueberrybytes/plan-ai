import React, { useState, useEffect } from "react";
import { Box, Button, Container, Grid, Paper, TextField, Typography, Alert } from "@mui/material";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { forgotPassword, setIsLoading } from "../store/slices/auth/authSlice";
import { selectErrorSession, selectIsLoading } from "../store/slices/auth/authSelector";
import { EMAIL_REGEX } from "../utils/regex";
import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { useTranslation } from "react-i18next";

export default function ForgotPassword() {
  // We'll use navigate later when implementing redirect after password reset
  const dispatch = useDispatch();
  const { productName } = useBrandIdentity();
  const { t } = useTranslation();

  // Redux state
  const isLoading = useSelector(selectIsLoading);
  const errorSession = useSelector(selectErrorSession);

  // Form state
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset loading state when component mounts
  useEffect(() => {
    dispatch(setIsLoading(false));
  }, [dispatch]);

  // Handle error from Redux
  useEffect(() => {
    if (errorSession?.message) {
      setError(errorSession.message);
      setSuccessMessage(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const isEmailValid = validateEmail(email);

    if (!isEmailValid) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    // Dispatch forgot password action to Redux
    dispatch(forgotPassword(email));

    // Show success message
    setSuccessMessage(t("forgotPassword.success"));

    // Clear form
    setEmail("");
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
          <Typography variant="h4" component="h1" align="center" gutterBottom>
            {t("forgotPassword.heading", { productName })}
          </Typography>

          <Typography variant="body1" align="center" sx={{ mb: 3 }}>
            {t("forgotPassword.description")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 3 }}>
              {successMessage}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
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

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isLoading}
            >
              {isLoading
                ? t("forgotPassword.buttons.submitting")
                : t("forgotPassword.buttons.submit")}
            </Button>
          </form>

          <Grid container justifyContent="center" sx={{ mt: 3 }}>
            <Grid item>
              <Typography
                variant="body2"
                component={Link}
                to="/login"
                color="primary"
                sx={{ textDecoration: "none" }}
              >
                {t("forgotPassword.links.backToSignIn")}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
}
