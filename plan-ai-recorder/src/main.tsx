import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme";
import { AuthProvider } from "./hooks/AuthProvider";
import App from "./App";
import * as Sentry from "@sentry/electron/renderer";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
// Using the same environment-based check so it stays silent in dev mode
if (sentryDsn && import.meta.env.PROD) {
  Sentry.init({ dsn: sentryDsn });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
