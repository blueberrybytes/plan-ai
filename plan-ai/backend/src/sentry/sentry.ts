import * as Sentry from "@sentry/node";

const sentryEnabled = process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN;
console.log("Sentry enabled:", sentryEnabled);

// Error reports go to a third party (Sentry, US region). They carry the user
// id and the route, never request bodies (chat messages, transcripts),
// cookies, auth headers, emails or IP addresses.
const SENSITIVE_HEADERS = ["authorization", "cookie", "x-admin-key", "x-api-key"];
const MAX_EXCEPTION_MESSAGE = 1000;

/**
 * A Prisma error message prints the query's arguments, which can be a note,
 * a transcript or a tracker entry. Keep the first line (which call failed)
 * and the last one (why), and drop what is in between.
 */
export function scrubExceptionMessage(type: string | undefined, value: string): string {
  let out = value;
  if (type?.startsWith("PrismaClient") || /Invalid `prisma\./.test(value)) {
    const lines = value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    out = lines.length > 2 ? `${lines[0]} [arguments removed] ${lines[lines.length - 1]}` : value;
  }
  return out.length > MAX_EXCEPTION_MESSAGE ? `${out.slice(0, MAX_EXCEPTION_MESSAGE)}...` : out;
}

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
    for (const ex of event.exception?.values ?? []) {
      if (typeof ex.value === "string") ex.value = scrubExceptionMessage(ex.type, ex.value);
    }
    if (typeof event.message === "string") {
      event.message = scrubExceptionMessage(undefined, event.message);
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    // Console breadcrumbs can hold meeting text logged by a worker.
    return breadcrumb.category === "console" ? null : breadcrumb;
  },
});
