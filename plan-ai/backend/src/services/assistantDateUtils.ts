/**
 * Date parsing + validation helpers for assistant tool inputs.
 *
 * LLMs occasionally pass:
 *   - Half-formed ISO strings ("2025-13-40")
 *   - Years way in the past/future ("0024-01-01", "9999-12-31")
 *   - Natural language they were supposed to convert ("last week")
 *   - Inverted ranges (dateFrom > dateTo)
 *
 * These helpers normalize the input, drop garbage, and surface a single
 * `dateRange` result the caller can drop straight into a Prisma `where`.
 */

import { parseISO, isValid, isAfter, startOfDay, endOfDay } from "date-fns";
import { logger } from "../utils/logger";

/** Reasonable bounds — guards against year-9999 hallucinations. */
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

/**
 * Parse a single date string from an LLM. Accepts:
 *   - Full ISO: "2026-05-21T00:00:00Z"
 *   - Date only: "2026-05-21" (interpreted as start of that UTC day)
 *
 * Returns `null` if invalid; logs a warning. The model is trained to ALWAYS
 * pass ISO so anything else is a model error worth a log line.
 */
export function parseAssistantDate(input: string | undefined | null): Date | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Prefer parseISO — strict, no relative-date side effects.
  let date = parseISO(trimmed);
  if (!isValid(date)) {
    // Last-ditch: `new Date(...)` accepts more formats but is permissive.
    // Restrict to inputs that at least look numeric.
    if (/^\d{4}/.test(trimmed)) {
      date = new Date(trimmed);
    }
  }

  if (!isValid(date)) {
    logger.warn(`[assistantDateUtils] Invalid date from assistant: "${input}"`);
    return null;
  }

  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) {
    logger.warn(
      `[assistantDateUtils] Date out of bounds (year ${year}): "${input}"`,
    );
    return null;
  }

  return date;
}

export interface ResolvedDateRange {
  gte?: Date;
  lte?: Date;
  /** True iff the inputs produced ANY usable bound. */
  hasFilter: boolean;
  /** Echo back the normalized strings — handy for tool output / debug. */
  normalized: { from: string | null; to: string | null };
}

/**
 * Resolve a date-range pair from assistant tool inputs.
 * - Snaps date-only inputs to start-of-day (for `from`) or end-of-day (for `to`)
 *   so a user query like "yesterday" doesn't accidentally exclude the late part
 *   of the day.
 * - Swaps inverted ranges instead of dropping them — the most likely intent
 *   is "between A and B" regardless of order.
 */
export function resolveAssistantDateRange(
  dateFrom: string | undefined | null,
  dateTo: string | undefined | null,
): ResolvedDateRange {
  let gte = parseAssistantDate(dateFrom);
  let lte = parseAssistantDate(dateTo);

  // If the model passed a bare date ("2026-05-21"), it parses to 00:00:00Z.
  // For `from` that's fine; for `to` we want to include the entire day,
  // so snap to end-of-day.
  if (gte && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom?.trim() ?? "")) {
    gte = startOfDay(gte);
  }
  if (lte && /^\d{4}-\d{2}-\d{2}$/.test(dateTo?.trim() ?? "")) {
    lte = endOfDay(lte);
  }

  // Swap inverted ranges — likely a model mistake.
  if (gte && lte && isAfter(gte, lte)) {
    logger.warn(
      `[assistantDateUtils] Inverted range (from=${dateFrom}, to=${dateTo}); swapping.`,
    );
    [gte, lte] = [lte, gte];
  }

  return {
    gte: gte ?? undefined,
    lte: lte ?? undefined,
    hasFilter: Boolean(gte || lte),
    normalized: {
      from: gte?.toISOString() ?? null,
      to: lte?.toISOString() ?? null,
    },
  };
}
