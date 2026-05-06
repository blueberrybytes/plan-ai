import * as Sentry from "@sentry/react";

const sentryEnabled = process.env.NODE_ENV === "production" && !!process.env.REACT_APP_SENTRY_DSN;
console.log("Sentry enabled:", sentryEnabled);
Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  enabled: sentryEnabled,
});
