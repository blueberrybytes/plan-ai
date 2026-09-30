import { clientLogger } from "./clientLogger";

/**
 * Sends unexpected failures to Sentry (through clientLogger.error) and ignores
 * the expected ones.
 *
 * Expected, never reported: no network, a user who cancels, and any RTK Query
 * error with an HTTP status. 4xx answers are normal outcomes (401, 403, 404, 409
 * version conflicts, 429, 400 validation). 5xx answers and responses that cannot
 * be parsed are already reported once by baseQuery.
 *
 * Unexpected, reported: exceptions thrown by our code or by a library, and 5xx
 * answers from plain fetch calls (see HttpStatusError).
 *
 * The report carries the feature name, the status and the error code only. The
 * context must hold ids and codes, never user text (note bodies, tracker values,
 * emails, file or workspace names).
 */

/** Ids, status codes and error codes. Never user text. */
export type ReportContext = Record<string, string | number | boolean | null | undefined>;

/** A failed answer from a plain fetch call (not RTK Query), with its HTTP status. */
export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Request failed with status ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

// Firebase Auth codes that are normal outcomes: no network, a popup the user
// closed, a session that ended, a wrong or late code, rate limits.
const EXPECTED_ERROR_CODES = new Set([
  "auth/network-request-failed",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/popup-blocked",
  "auth/user-cancelled",
  "auth/too-many-requests",
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/invalid-user-token",
  "auth/user-not-found",
  "auth/requires-recent-login",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/totp-challenge-timeout",
  "mfa/cancelled",
]);

// Messages browsers use when fetch fails for lack of network.
const NETWORK_MESSAGES = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "network request failed",
];

// Error codes are short identifiers. Anything else is not sent.
const CODE_PATTERN = /^[A-Za-z0-9_./-]{1,64}$/;

interface RtkQueryError {
  status: number | string;
  originalStatus?: number;
  data?: unknown;
}

const isRtkQueryError = (error: unknown): error is RtkQueryError =>
  typeof error === "object" &&
  error !== null &&
  !(error instanceof Error) &&
  "status" in error &&
  (typeof (error as { status: unknown }).status === "number" ||
    typeof (error as { status: unknown }).status === "string");

const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;

/** The error code of an API answer (data.code) or of a Firebase error (code). */
const errorCodeOf = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  const fromData = (error as { data?: { code?: unknown } | null }).data?.code;
  const code = typeof direct === "string" ? direct : fromData;
  return typeof code === "string" && CODE_PATTERN.test(code) ? code : undefined;
};

const statusOf = (error: unknown): number | string | undefined => {
  if (error instanceof HttpStatusError) return error.status;
  if (isRtkQueryError(error)) return error.originalStatus ?? error.status;
  return undefined;
};

/** True when the failure is worth a Sentry report. */
export const isUnexpectedError = (error: unknown): boolean => {
  if (isOffline()) return false;

  if (isRtkQueryError(error)) {
    // Numbers are HTTP answers: 4xx are expected, 5xx are reported by baseQuery.
    // FETCH_ERROR and TIMEOUT_ERROR mean no network. PARSING_ERROR is reported by baseQuery.
    return error.status === "CUSTOM_ERROR";
  }

  if (error instanceof HttpStatusError) return error.status >= 500;

  const code = errorCodeOf(error);
  if (code && EXPECTED_ERROR_CODES.has(code)) return false;

  if (error instanceof Error) {
    if (error.name === "AbortError") return false;
    const message = error.message.toLowerCase();
    if (error.name === "TypeError" && NETWORK_MESSAGES.some((text) => message.includes(text))) {
      return false;
    }
  }

  return true;
};

/**
 * Reports the failure to Sentry when it is unexpected. Returns true when it did.
 * @param feature short name of the feature and action, e.g. "notes.save"
 * @param error what was caught
 * @param context ids and codes only
 */
export const reportUnexpectedError = (
  feature: string,
  error: unknown,
  context?: ReportContext,
): boolean => {
  if (!isUnexpectedError(error)) return false;

  const facts: ReportContext = { feature, ...context };
  const status = statusOf(error);
  if (status !== undefined) facts.status = status;
  const code = errorCodeOf(error);
  if (code) facts.errorCode = code;
  if (!(error instanceof Error)) facts.errorType = error === null ? "null" : typeof error;

  // Only real Error objects go through as they are. Anything else (a string, a
  // plain object) could hold user text, so only its type is sent.
  clientLogger.error(`${feature} failed`, error instanceof Error ? error : undefined, facts);
  return true;
};
