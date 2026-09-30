/**
 * Sentry reporting for the renderer.
 *
 * Only unexpected failures are reported: exceptions, 5xx, timeouts of a save.
 * Expected outcomes stay out (offline, auth, not found, conflicts, rate limits,
 * validation, a permission the user refused).
 *
 * Nothing the user wrote or said goes to Sentry. HTTP failures are sent as a
 * generic error with the status only, because the server's message can repeat
 * user input. Extra data takes ids, counts, codes and flags only.
 */

import * as Sentry from "@sentry/electron/renderer";
import type { Breadcrumb, ErrorEvent } from "@sentry/electron/renderer";

type Extra = Record<string, string | number | boolean | null | undefined>;

/** Default statuses that are an expected answer, not a failure. */
const EXPECTED_STATUSES = [400, 401, 403, 404, 409, 429];

/** The HTTP status planAiApi attaches to the errors it throws, if any. */
export function httpStatusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * fetch() could not reach the server (offline, DNS, TLS, CORS). Chromium
 * rejects with a TypeError "Failed to fetch". Other TypeErrors are code bugs.
 */
export function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    httpStatusOf(err) === undefined &&
    /failed to fetch|network/i.test(err.message)
  );
}

/** The request was aborted, which planAiApi does on its timeout. */
export function isTimeout(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "AbortError";
}

interface ExpectedOptions {
  /** Statuses treated as expected. Defaults to 400, 401, 403, 404, 409, 429. */
  statuses?: number[];
  /** Report timeouts. Used for saves, where a timeout means a lost upload. */
  reportTimeouts?: boolean;
}

export function isExpectedError(
  err: unknown,
  options: ExpectedOptions = {},
): boolean {
  const status = httpStatusOf(err);
  if (status !== undefined) {
    return (options.statuses ?? EXPECTED_STATUSES).includes(status);
  }
  if (isNetworkError(err)) return true;
  if (isTimeout(err)) return !options.reportTimeouts;
  // The user refused a permission, or there is no microphone.
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "NotFoundError";
}

/** Sends one failure to Sentry, tagged with the feature it belongs to. */
export function reportError(err: unknown, feature: string, extra?: Extra): void {
  const status = httpStatusOf(err);
  let error: Error;
  if (status !== undefined) {
    error = new Error(`${feature} failed with HTTP ${status}`);
  } else if (err instanceof Error) {
    error = err;
  } else {
    error = new Error(`${feature} failed`);
  }
  Sentry.captureException(error, {
    tags: {
      feature,
      ...(status !== undefined ? { http_status: String(status) } : {}),
      ...(isTimeout(err) ? { timeout: "true" } : {}),
    },
    extra,
  });
}

/** Reports the failure unless it is an expected outcome. */
export function reportUnexpected(
  err: unknown,
  feature: string,
  extra?: Extra,
  options?: ExpectedOptions,
): void {
  if (!isExpectedError(err, options)) reportError(err, feature, extra);
}

const reportedOnce = new Set<string>();

/**
 * Reports a failure once per key and app launch. For code that runs on every
 * utterance or audio chunk, where one broken disk would flood Sentry.
 */
export function reportOnce(
  key: string,
  err: unknown,
  feature: string,
  extra?: Extra,
): void {
  if (reportedOnce.has(key)) return;
  reportedOnce.add(key);
  reportError(err, feature, extra);
}

// ── Scrubbing, used by Sentry.init in main.tsx ──────────────────────────────
// The main process runs the same rules on every event it sends, renderer
// events included (see electron/main.ts).

function stripQuery(url: string): string {
  return url.split("?")[0];
}

/**
 * Console lines are dropped: the echo debug log prints every utterance, and
 * other logs name files and projects. URLs lose their query string, which can
 * hold search text.
 */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;
  if (!crumb.data) return crumb;
  const data = { ...crumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = stripQuery(data[key]);
  }
  return { ...crumb, data };
}

/** Drops request bodies, cookies and headers, and keeps only the user id. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = event.request.url
      ? { url: stripQuery(event.request.url) }
      : undefined;
  }
  event.user = event.user?.id !== undefined ? { id: event.user.id } : undefined;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return event;
}
