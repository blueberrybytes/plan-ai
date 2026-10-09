/**
 * Wait before each retry of a failed webhook delivery: about 1 min, 5 min,
 * 30 min, 2 h and 6 h. A delivery is tried once and then retried once per
 * entry. Kept apart from the queue so it can be read without Redis.
 */
export const WEBHOOK_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
] as const;

/** Tries in total: the first one plus one per retry delay. */
export const WEBHOOK_MAX_TRIES = WEBHOOK_RETRY_DELAYS_MS.length + 1;

/** The wait after `attemptsMade` failed tries (1 after the first failure). */
export function webhookRetryDelay(attemptsMade: number): number {
  const index = Math.min(Math.max(attemptsMade, 1), WEBHOOK_RETRY_DELAYS_MS.length) - 1;
  return WEBHOOK_RETRY_DELAYS_MS[index];
}
