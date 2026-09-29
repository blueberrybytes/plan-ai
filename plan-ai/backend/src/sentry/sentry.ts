import * as Sentry from "@sentry/node";

const sentryEnabled = process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN;
console.log("Sentry enabled:", sentryEnabled);

// Error reports go to a third party (Sentry, US region). They carry the user
// id and the route, never request bodies (chat messages, transcripts),
// cookies, auth headers, emails or IP addresses.
const SENSITIVE_HEADERS = ["authorization", "cookie", "x-admin-key", "x-api-key"];

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: false,
  enabled: sentryEnabled,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.query_string;
      if (event.request.headers) {
        for (const h of Object.keys(event.request.headers)) {
          if (SENSITIVE_HEADERS.includes(h.toLowerCase())) delete event.request.headers[h];
        }
      }
    }
    if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    // Console breadcrumbs can hold meeting text logged by a worker.
    return breadcrumb.category === "console" ? null : breadcrumb;
  },
});
