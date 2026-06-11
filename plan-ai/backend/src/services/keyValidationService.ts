import { logger } from "../utils/logger";

/**
 * Result of a BYOK key check.
 * - `checked: false` means we couldn't reach the provider (network/timeout) —
 *   callers should NOT block a save on this, to avoid a transient outage
 *   stopping a legitimate update.
 * - `checked: true, valid: false` means the provider definitively rejected the
 *   key (401/403) — callers should block and surface the error.
 */
export interface KeyCheck {
  valid: boolean;
  checked: boolean;
}

const TIMEOUT_MS = 8000;

/**
 * Validate an OpenRouter API key with a cheap, generation-free auth call
 * (`GET /api/v1/key` returns the key's own metadata). No token cost.
 */
export async function validateOpenRouterKey(key: string): Promise<KeyCheck> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return { valid: false, checked: true };
    return { valid: res.ok, checked: true };
  } catch (err) {
    logger.warn("[keyValidation] OpenRouter key check could not complete (network)", err);
    return { valid: false, checked: false };
  }
}

/**
 * Validate a Deepgram API key by listing projects (`GET /v1/projects`), a
 * lightweight read that any valid key can perform.
 */
export async function validateDeepgramKey(key: string): Promise<KeyCheck> {
  try {
    const res = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return { valid: false, checked: true };
    return { valid: res.ok, checked: true };
  } catch (err) {
    logger.warn("[keyValidation] Deepgram key check could not complete (network)", err);
    return { valid: false, checked: false };
  }
}
