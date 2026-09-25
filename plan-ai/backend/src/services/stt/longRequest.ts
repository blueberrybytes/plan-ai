import { Agent } from "undici";

/**
 * HTTP client for requests that legitimately take many minutes: transcribing
 * a whole meeting channel on a CPU Whisper server, or separating its speakers.
 *
 * Node's built-in fetch gives up when a server takes more than 5 minutes to
 * start answering (undici's default headersTimeout), and neither server sends
 * anything until it's done. A 39-minute AMI meeting took about 8.5 minutes on
 * CPU, so without this every meeting longer than ~20 minutes failed with a
 * bare "fetch failed", whatever AbortSignal.timeout said. Here both undici
 * limits are off and the caller's AbortSignal is the only deadline.
 */
export const longRequestDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/** Init fields for Node's fetch; `dispatcher` isn't in the DOM RequestInit type. */
export const withLongRequestDispatcher = (init: RequestInit): RequestInit =>
  ({ ...init, dispatcher: longRequestDispatcher }) as RequestInit;
