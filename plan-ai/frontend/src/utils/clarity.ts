import Clarity from "@microsoft/clarity";

/**
 * Microsoft Clarity records sessions (clicks, scrolls, page content). It must only
 * run on public marketing pages. App pages show transcripts, summaries and chats,
 * which must never be recorded.
 *
 * Rules:
 * - Clarity loads only on a marketing path, and only when nobody is signed in.
 * - As soon as the user reaches any other route, Clarity stops for the rest of the
 *   page's life. It does not restart, even if the user goes back to a marketing page.
 */

// Public marketing pages. Shared docs, slides and diagrams are not here: they show user content.
const MARKETING_PATHS = new Set(["/"]);

type ClarityGlobal = ((...args: unknown[]) => void) & { v?: string; q?: unknown[] };

let started = false;
let stopped = false;

const normalisePath = (pathname: string): string => pathname.replace(/\/+$/, "") || "/";

export const isMarketingPath = (pathname: string): boolean =>
  MARKETING_PATHS.has(normalisePath(pathname));

const stopClarity = (): void => {
  stopped = true;
  const w = window as unknown as { clarity?: ClarityGlobal };
  if (!w.clarity) return;

  if (w.clarity.v) {
    // Clarity is fully loaded: stop recording and uploading.
    w.clarity("stop");
    return;
  }

  // Clarity is still loading. Its "start" call sits in a queue that would run after any
  // "stop" we add, so replace the queue with one that drops every call. When the real
  // script arrives it finds an empty queue and never starts.
  const dropAll = (() => undefined) as ClarityGlobal;
  dropAll.q = [];
  w.clarity = dropAll;
};

/**
 * Call on every route change.
 * @param pathname current location path
 * @param isSignedIn true when a user session exists (signed-in users are never recorded)
 */
export const syncClarityWithRoute = (pathname: string, isSignedIn: boolean): void => {
  const projectId = process.env.REACT_APP_MICROSOFT_CLARITY_ID;
  if (!projectId || stopped) return;

  const allowed = isMarketingPath(pathname) && !isSignedIn;
  if (allowed) {
    if (!started) {
      Clarity.init(projectId);
      started = true;
    }
    return;
  }

  if (started) stopClarity();
};
