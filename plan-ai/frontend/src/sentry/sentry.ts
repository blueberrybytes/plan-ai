import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";

const sentryEnabled = process.env.NODE_ENV === "production" && !!process.env.REACT_APP_SENTRY_DSN;
console.log("Sentry enabled:", sentryEnabled);

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-workspace-id"]);

/**
 * Removes personal data before an error report leaves the browser.
 * Request bodies can hold meeting content, so they are never sent. The user is
 * reported by id only: no email, no username, no IP address.
 */
const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(
          ([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }

  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  return event;
};

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  // No automatic PII: no IP address, cookies or request bodies.
  sendDefaultPii: false,
  enabled: sentryEnabled,
  beforeSend: scrubEvent,
});
