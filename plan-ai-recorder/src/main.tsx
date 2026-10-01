import React from "react";
import ReactDOM from "react-dom/client";
import { ThemePresetProvider } from "./hooks/ThemePresetProvider";
import { AuthProvider } from "./hooks/AuthProvider";
import App from "./App";
import * as Sentry from "@sentry/electron/renderer";
import { scrubBreadcrumb, scrubEvent } from "./utils/errorReporting";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
// Using the same environment-based check so it stays silent in dev mode
if (sentryDsn && import.meta.env.PROD) {
  Sentry.init({
    dsn: sentryDsn,
    // No transcript text, chat, file names or emails: see errorReporting.ts.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemePresetProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemePresetProvider>
  </React.StrictMode>,
);
