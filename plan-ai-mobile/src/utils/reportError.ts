import * as Sentry from "@sentry/react-native";

/**
 * Sends unexpected failures to Sentry. Expected ones stay out: no network,
 * a refusal from the server (4xx) and a user who cancels.
 *
 * Only ids, status codes, error codes and feature names go in `extra`. Never
 * note text, titles, tracker values, food text or emails.
 */

export type ErrorFeature =
  | "notes"
  | "trackers"
  | "auth"
  | "tasks"
  | "links"
  | "mermaid"
  | "daily_report"
  | "api";

type Extra = Record<string, string | number | boolean | null | undefined>;

// Errors already sent, so a caller up the stack does not send them again.
const reported = new WeakSet<object>();

export function markReported(err: unknown): void {
  if (err && typeof err === "object") reported.add(err);
}

// HttpError and its subclasses (planAiApi.ts). Checked by name so this file
// does not import the API module. Their 5xx are reported where the answer is
// read, and the other statuses are expected.
const HTTP_ERROR_NAMES = new Set(["HttpError", "NoteConflictError", "TrackerApiError"]);

// Firebase codes and messages that mean no network or no signed in user.
const EXPECTED_FIREBASE_CODES = new Set([
  "auth/network-request-failed",
  "auth/no-current-user",
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/too-many-requests",
]);
const NETWORK_MESSAGE =
  /network request failed|network-request-failed|network error|internet connection|timed out|timeout|aborted|failed to fetch|no auth token available/i;

/** True for failures that are part of normal use and need no report. */
export function isExpectedFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (HTTP_ERROR_NAMES.has(err.name)) return true;
  if (err.name === "AbortError") return true;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && EXPECTED_FIREBASE_CODES.has(code)) return true;
  return NETWORK_MESSAGE.test(err.message);
}

/** Reports `err` unless it is expected or was already reported. */
export function reportUnexpected(
  err: unknown,
  feature: ErrorFeature,
  extra: Extra = {},
  level: "error" | "warning" = "error",
): void {
  if (err && typeof err === "object" && reported.has(err)) return;
  if (isExpectedFailure(err)) return;
  markReported(err);
  // A thrown string or object has no stack. Wrap it, keeping only its type.
  const error = err instanceof Error ? err : new Error(`Non-error thrown (${typeof err})`);
  Sentry.captureException(error, { level, tags: { feature }, extra });
}

/** Reports a failure that is not an exception, e.g. an unexpected status. */
export function reportMessage(
  message: string,
  feature: ErrorFeature,
  extra: Extra = {},
  level: "error" | "warning" = "warning",
): void {
  Sentry.captureMessage(message, { level, tags: { feature }, extra });
}

/** A URL without its query string, so search text never reaches Sentry. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** Feature tag for an API path. */
export function featureOfUrl(url: string): ErrorFeature {
  if (/\/api\/notes(\/|$|\?)/.test(url)) return "notes";
  if (/\/api\/(trackers|personal)(\/|$|\?)/.test(url)) return "trackers";
  return "api";
}
