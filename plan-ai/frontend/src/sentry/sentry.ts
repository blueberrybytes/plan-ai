import * as Sentry from "@sentry/react";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

const sentryEnabled = process.env.NODE_ENV === "production" && !!process.env.REACT_APP_SENTRY_DSN;
console.log("Sentry enabled:", sentryEnabled);

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-workspace-id"]);

/**
 * Drops the query string and hash of a URL. They can hold search text, sign-in
 * states or one-time codes. The path is kept: it holds ids only.
 */
export const stripQuery = (url: string): string => url.split(/[?#]/)[0];

/**
 * Removes personal data before an error report leaves the browser.
 * Request bodies can hold meeting content, so they are never sent. The user is
 * reported by id only: no email, no username, no IP address.
 */
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
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

/**
 * Keeps breadcrumbs free of user content. Console output is dropped: our logs
 * print emails and error bodies. Request and navigation URLs lose their query
 * string (note search text travels there).
 */
export const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb | null => {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data) {
    const data = { ...breadcrumb.data };
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = stripQuery(data[key]);
    }
    return { ...breadcrumb, data };
  }
  return breadcrumb;
};

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  // No automatic PII: no IP address, cookies or request bodies.
  sendDefaultPii: false,
  enabled: sentryEnabled,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
